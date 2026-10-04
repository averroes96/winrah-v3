# 🚀 WINRAH — CI/CD Deployment Guide (Android & iOS)

This guide documents the automated GitHub Actions workflows created in [`.github/workflows/`](file:///Users/admin/Github/winrah-v3/.github/workflows) to build and deploy signed releases for **Android** and **iOS**.

---

## 🤖 1. Android Workflow: `.github/workflows/deploy-android.yml`

This workflow runs on **Ubuntu** (`ubuntu-latest`), compiles the web app, syncs Capacitor, signs the release APK and AAB, and can publish directly to Google Play.

### Required GitHub Secrets (Repository Settings > Secrets and variables > Actions)

| Secret Name | Description | How to generate |
| :--- | :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded string of your `.keystore` or `.jks` file | `base64 -i winrah-release.keystore \| pbcopy` |
| `ANDROID_KEYSTORE_PASSWORD` | The password for your keystore | Created during `keytool` generation |
| `ANDROID_KEY_ALIAS` | Key alias | Default: `winrah` |
| `ANDROID_KEY_PASSWORD` | The password for the specific key | Usually same as keystore password |
| `PLAY_STORE_JSON_KEY` *(Optional)* | Google Cloud Service Account JSON key for Google Play Console | From Google Cloud Console with Google Play Developer API access |
| `GDRIVE_SERVICE_ACCOUNT_JSON` *(Optional)* | Google Cloud Service Account JSON key for Google Drive upload | Google Cloud Console > IAM & Admin > Service Accounts > Keys > Create JSON Key |
| `GDRIVE_FOLDER_ID` *(Optional)* | Target Google Drive folder ID for storing APK releases | From the Google Drive URL: `drive.google.com/drive/folders/<FOLDER_ID>` |

> ℹ️ **CI Fallback**: If `ANDROID_KEYSTORE_BASE64` is not configured, the workflow generates a temporary self-signed release keystore so you still get a downloadable, signed `.apk` artifact for test distribution!
> 
> 📁 **Google Drive Deployment**: When `GDRIVE_SERVICE_ACCOUNT_JSON` and `GDRIVE_FOLDER_ID` are configured, every signed APK is automatically uploaded to your Google Drive folder (named `WINRAH-vX.X.X.apk`) for instant download by warehouse operators. Make sure to **Share** your Google Drive folder with the Service Account email address as an **Editor**!

---

## 🍏 2. iOS Workflow: `.github/workflows/deploy-ios.yml`

This workflow runs on **macOS** (`macos-15` with Xcode 16), compiles the web app, syncs Capacitor, unlocks a temporary CI keychain with your Apple distribution certificate, archives, and exports the signed `.ipa`.

### Required GitHub Secrets (Repository Settings > Secrets and variables > Actions)

| Secret Name | Description | How to generate |
| :--- | :--- | :--- |
| `IOS_P12_BASE64` | Base64-encoded `.p12` certificate exported from Keychain Access | `base64 -i Certificate.p12 \| pbcopy` |
| `IOS_P12_PASSWORD` | Password you set when exporting the `.p12` | Chosen during Keychain export |
| `IOS_MOBILEPROVISION_BASE64` | Base64-encoded provisioning profile from developer.apple.com | `base64 -i App.mobileprovision \| pbcopy` |
| `IOS_PROVISIONING_NAME` | Name of the provisioning profile | e.g. `Winrah AdHoc Profile` |
| `KEYCHAIN_PASSWORD` | Temporary CI keychain password | e.g. `ci_keychain_123` |
| `APP_STORE_CONNECT_API_KEY` *(Optional)* | App Store Connect API Private Key (`.p8`) contents | Generated under App Store Connect > Users & Access > Integrations |
| `APP_STORE_CONNECT_KEY_ID` *(Optional)* | Key ID (10 alphanumeric chars) | From App Store Connect API Keys |
| `APP_STORE_CONNECT_ISSUER_ID` *(Optional)* | Issuer ID (UUID) | From App Store Connect API Keys |

---

## 🎯 How to Trigger Builds

### 1. Manual Trigger (GitHub Web UI)
1. Go to your GitHub repository: **Actions** tab.
2. Select **Build & Deploy Android App** or **Build & Deploy iOS App**.
3. Click **Run workflow**:
   - For Android: choose build type (`both`, `apk`, or `bundle`) and whether to publish to Play Store.
   - For iOS: choose export method (`ad-hoc`, `app-store`, `development`, or `enterprise`) and whether to upload to TestFlight.

### 2. Automatic Release on Git Tag
Whenever you tag a release, both workflows trigger automatically and attach the signed `.apk`, `.aab`, and `.ipa` files directly to the GitHub Release:
```bash
git tag v1.0.0
git push origin v1.0.0
```
