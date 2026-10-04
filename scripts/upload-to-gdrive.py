#!/usr/bin/env python3
"""
=============================================================================
WINRAH - Google Drive Build Artifact Uploader
Uploads built Android APK (or other release artifacts) to a specified
Google Drive folder or Shared Drive using either:
  1. OAuth 2.0 User Credentials (recommended for personal @gmail.com accounts)
  2. Google Cloud Service Account (for Google Workspace Shared Drives)
=============================================================================
"""

import os
import sys
import json
import base64

def get_credentials_dict(raw_data: str):
    """
    Parses service account credentials from either raw JSON or base64-encoded JSON.
    """
    cleaned = raw_data.strip()
    if cleaned.startswith('{'):
        return json.loads(cleaned)
    try:
        decoded = base64.b64decode(cleaned).decode('utf-8')
        return json.loads(decoded)
    except Exception:
        return json.loads(cleaned)

def main():
    folder_id = os.environ.get('GDRIVE_FOLDER_ID')
    service_account_raw = os.environ.get('GDRIVE_SERVICE_ACCOUNT_JSON')
    
    # OAuth 2.0 credentials (for personal Gmail accounts with user quota)
    client_id = os.environ.get('GDRIVE_CLIENT_ID')
    client_secret = os.environ.get('GDRIVE_CLIENT_SECRET')
    refresh_token = os.environ.get('GDRIVE_REFRESH_TOKEN')

    has_oauth = bool(refresh_token and client_id and client_secret)
    has_service_account = bool(service_account_raw)

    if not folder_id or (not has_oauth and not has_service_account):
        print("::warning::Google Drive deployment skipped: credentials or GDRIVE_FOLDER_ID not configured.")
        print("Refer to DEPLOYMENT_GUIDE.md to configure Google Drive upload via OAuth2 or Shared Drive.")
        sys.exit(0)

    # File path passed as argument or default to APK
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = 'android/app/build/outputs/apk/release/app-release.apk'

    if not os.path.exists(file_path):
        print(f"::error::File to upload not found: {file_path}")
        sys.exit(1)

    custom_name = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(file_path)

    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        print("::error::Missing Google Client libraries. Please run 'pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib'")
        sys.exit(1)

    scopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    credentials = None

    # Priority 1: OAuth2 User Credentials (uses personal 15GB+ quota, bypasses 0-quota Service Account limit)
    if has_oauth:
        try:
            from google.oauth2.credentials import Credentials
            credentials = Credentials(
                None,
                refresh_token=refresh_token.strip(),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id.strip(),
                client_secret=client_secret.strip(),
                scopes=scopes
            )
            print("🔑 Authenticated via OAuth 2.0 User Credentials (Personal Storage Quota).")
        except Exception as e:
            print(f"::error::Failed to initialize OAuth2 credentials: {e}")
            sys.exit(1)

    # Priority 2: Service Account (for Google Workspace Shared Drives)
    elif has_service_account:
        try:
            from google.oauth2 import service_account
            creds_dict = get_credentials_dict(service_account_raw)
            credentials = service_account.Credentials.from_service_account_info(creds_dict, scopes=scopes)
            client_email = creds_dict.get('client_email', 'unknown')
            print(f"🔑 Authenticated via Service Account: {client_email}")
        except Exception as e:
            print(f"::error::Failed to parse GDRIVE_SERVICE_ACCOUNT_JSON: {e}")
            sys.exit(1)

    drive_service = build('drive', 'v3', credentials=credentials)

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"📦 Uploading '{file_path}' ({file_size_mb:.2f} MB) as '{custom_name}'...")
    print(f"📁 Target Google Drive folder / Shared Drive ID: {folder_id}")

    file_metadata = {
        'name': custom_name,
        'parents': [folder_id.strip()]
    }

    # Upload with 5MB chunks and resumable upload for reliability
    media = MediaFileUpload(
        file_path,
        mimetype='application/vnd.android.package-archive' if file_path.endswith('.apk') else 'application/octet-stream',
        resumable=True,
        chunksize=5 * 1024 * 1024
    )

    request = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, name, webViewLink, webContentLink, size',
        supportsAllDrives=True
    )

    response = None
    try:
        while response is None:
            status, response = request.next_chunk()
            if status:
                print(f"Uploading progress: {int(status.progress() * 100)}%")
    except Exception as e:
        err_msg = str(e)
        if "storageQuotaExceeded" in err_msg or "Service Accounts do not have storage quota" in err_msg:
            print("\n" + "=" * 76)
            print("❌ GOOGLE DRIVE 403: SERVICE ACCOUNT HAS NO STORAGE QUOTA")
            print("=" * 76)
            print("Google Service Accounts have 0 GB quota and cannot own files in personal")
            print("Google Drive accounts (My Drive / Mon Drive).")
            print("\n👉 HOW TO FIX:")
            print("\n1️⃣ If you have Google Workspace (Business / Enterprise / Education):")
            print("   Upload to a 'Shared Drive' (Disque partagé), NOT 'My Drive':")
            print("   - In Google Drive, click 'Shared Drives' (Disques partagés) -> New.")
            print("   - Add your service account email as 'Content Manager'.")
            print("   - Set GDRIVE_FOLDER_ID to the Shared Drive ID.")
            print("\n2️⃣ If you use a personal @gmail.com account:")
            print("   Personal accounts do not have Shared Drives. Use OAuth 2.0 instead:")
            print("   - Run: python3 scripts/generate-gdrive-oauth-token.py")
            print("   - Set GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, and GDRIVE_REFRESH_TOKEN in GitHub.")
            print("   - This uploads under your personal 15 GB storage quota!")
            print("=" * 76 + "\n")
        elif "Google Drive API has not been used" in err_msg or "accessNotConfigured" in err_msg:
            print("\n" + "=" * 70)
            print("❌ GOOGLE DRIVE API IS DISABLED IN YOUR GOOGLE CLOUD PROJECT")
            print("=" * 70)
            print("👉 You must enable the Google Drive API:")
            print("   https://console.cloud.google.com/apis/library/drive.googleapis.com")
            print("=" * 70 + "\n")
        elif "File not found" in err_msg or "notFound" in err_msg or "404" in err_msg:
            print("\n" + "=" * 70)
            print("❌ TARGET GOOGLE DRIVE FOLDER NOT FOUND OR NOT SHARED")
            print("=" * 70)
            print(f"👉 Ensure folder/drive ID '{folder_id}' exists and is shared with your")
            print("   account with 'Editor' or 'Content Manager' permissions.")
            print("=" * 70 + "\n")
        raise

    file_id = response.get('id')
    view_link = response.get('webViewLink')
    download_link = response.get('webContentLink')

    print(f"✅ Successfully uploaded '{custom_name}' to Google Drive!")
    print(f"🔹 File ID: {file_id}")
    if view_link:
        print(f"🔹 Web View Link: {view_link}")

    # Write summary to GitHub Step Summary if available in CI
    summary_path = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_path and os.path.exists(summary_path):
        try:
            with open(summary_path, 'a', encoding='utf-8') as f:
                f.write("\n\n---\n")
                f.write("### 🚀 Google Drive Deployment\n\n")
                f.write(f"- **File:** `{custom_name}` ({file_size_mb:.2f} MB)\n")
                f.write(f"- **Google Drive ID:** `{file_id}`\n")
                if view_link:
                    f.write(f"- **Preview Link:** [Open in Google Drive]({view_link})\n")
                if download_link:
                    f.write(f"- **Direct Download:** [Download APK]({download_link})\n")
        except Exception as e:
            print(f"Note: Could not write to GITHUB_STEP_SUMMARY: {e}")

if __name__ == '__main__':
    main()
