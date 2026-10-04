#!/usr/bin/env python3
"""
=============================================================================
WINRAH - Google Drive Build Artifact Uploader
Uploads built Android APK (or other release artifacts) to a specified
Google Drive folder using a Google Cloud Service Account.
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
    # Try base64 decoding
    try:
        decoded = base64.b64decode(cleaned).decode('utf-8')
        return json.loads(decoded)
    except Exception:
        # Fallback to direct json.loads
        return json.loads(cleaned)

def main():
    service_account_raw = os.environ.get('GDRIVE_SERVICE_ACCOUNT_JSON')
    folder_id = os.environ.get('GDRIVE_FOLDER_ID')

    if not service_account_raw or not folder_id:
        print("::warning::Google Drive deployment skipped: 'GDRIVE_SERVICE_ACCOUNT_JSON' or 'GDRIVE_FOLDER_ID' secret is not configured.")
        print("To enable automatic Google Drive upload, add both secrets to your GitHub repository.")
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
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        print("::error::Missing Google Client libraries. Please run 'pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib'")
        sys.exit(1)

    try:
        creds_dict = get_credentials_dict(service_account_raw)
    except Exception as e:
        print(f"::error::Failed to parse GDRIVE_SERVICE_ACCOUNT_JSON: {e}")
        sys.exit(1)

    scopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
    credentials = service_account.Credentials.from_service_account_info(creds_dict, scopes=scopes)
    drive_service = build('drive', 'v3', credentials=credentials)

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"📦 Uploading '{file_path}' ({file_size_mb:.2f} MB) as '{custom_name}'...")
    print(f"📁 Target Google Drive folder ID: {folder_id}")

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
        fields='id, name, webViewLink, webContentLink, size'
    )

    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"Uploading progress: {int(status.progress() * 100)}%")

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
