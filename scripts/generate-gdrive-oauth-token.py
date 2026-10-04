#!/usr/bin/env python3
"""
=============================================================================
WINRAH - Google Drive OAuth 2.0 Token Generator
Run this script ONCE on your local computer to generate your personal
Google Drive OAuth credentials (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET,
GDRIVE_REFRESH_TOKEN) for GitHub Actions.

This allows GitHub Actions to upload APK releases directly to your personal
Google Drive without hitting Service Account storage quota limits (403)!
=============================================================================
"""

import sys
import json

def main():
    print("=" * 70)
    print("🚀 WINRAH — Google Drive OAuth 2.0 Refresh Token Generator")
    print("=" * 70)
    print("This tool generates the 3 GitHub secrets needed for personal Google Drive:")
    print("  1. GDRIVE_CLIENT_ID")
    print("  2. GDRIVE_CLIENT_SECRET")
    print("  3. GDRIVE_REFRESH_TOKEN")
    print("=" * 70)
    print("\n👉 STEP 1: Create an OAuth Client ID in Google Cloud Console")
    print("1. Go to: https://console.cloud.google.com/apis/credentials")
    print("2. Click '+ CREATE CREDENTIALS' -> 'OAuth client ID'")
    print("3. Application type: Choose 'Desktop app' (or 'Web application')")
    print("4. Name: 'WINRAH GitHub Uploader'")
    print("5. Click 'Create' and copy your Client ID and Client Secret.\n")

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("Installing required dependencies (google-auth-oauthlib)...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "google-auth-oauthlib"])
        from google_auth_oauthlib.flow import InstalledAppFlow

    client_id = input("Enter your OAuth Client ID: ").strip()
    if not client_id:
        print("Error: Client ID cannot be empty.")
        sys.exit(1)

    client_secret = input("Enter your OAuth Client Secret: ").strip()
    if not client_secret:
        print("Error: Client Secret cannot be empty.")
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"]
        }
    }

    scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive'
    ]

    print("\n🌐 Opening your browser for Google authorization...")
    print("Please select your Google account and click 'Continue' / 'Allow'...")

    flow = InstalledAppFlow.from_client_config(client_config, scopes=scopes)
    credentials = flow.run_local_server(port=0, prompt='consent', access_type='offline')

    refresh_token = credentials.refresh_token

    if not refresh_token:
        print("\n⚠️ No refresh token was returned. Make sure to prompt consent.")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("🎉 SUCCESS! COPY THESE 3 SECRETS INTO YOUR GITHUB REPOSITORY:")
    print("   Repository > Settings > Secrets and variables > Actions")
    print("=" * 70)
    print(f"\n1. Secret Name: GDRIVE_CLIENT_ID")
    print(f"   Value: {client_id}\n")
    print(f"2. Secret Name: GDRIVE_CLIENT_SECRET")
    print(f"   Value: {client_secret}\n")
    print(f"3. Secret Name: GDRIVE_REFRESH_TOKEN")
    print(f"   Value: {refresh_token}\n")
    print("=" * 70)
    print("Now re-run your GitHub Actions workflow, and the APK will upload")
    print("using your personal Google Drive storage without any quota errors!")
    print("=" * 70 + "\n")

if __name__ == '__main__':
    main()
