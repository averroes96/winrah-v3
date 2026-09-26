#!/usr/bin/env bash
# ==============================================================================
# WINRAH - Automated Mobile Build & Sign Script (Android & iOS)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting WINRAH Mobile Build Pipeline..."
echo "📂 Project root: $ROOT_DIR"

# 1. Environment Detection
if [ -d "/opt/homebrew/opt/openjdk@21" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
fi

echo "☕ Java: $(java -version 2>&1 | head -n 1)"
if [ -n "${ANDROID_HOME:-}" ]; then
  echo "🤖 Android SDK: $ANDROID_HOME"
fi

# 2. Compile Web Application
echo ""
echo "📦 1. Compiling Web Application (Vite)..."
cd "$ROOT_DIR"
npm run build

# 3. Synchronize Capacitor Platforms
echo ""
echo "🔄 2. Syncing Capacitor Android & iOS native platforms..."
npx cap sync

# 4. Prepare Release Keystore for Android
echo ""
echo "🔐 3. Checking Android Release Keystore..."
mkdir -p "$ROOT_DIR/android/app"
KEYSTORE_PATH="$ROOT_DIR/android/app/winrah-release.keystore"
KEY_PASSWORD="${KEY_PASSWORD:-winrah1234}"
STORE_PASSWORD="${KEYSTORE_PASSWORD:-winrah1234}"
KEY_ALIAS="${KEY_ALIAS:-winrah}"

if [ ! -f "$KEYSTORE_PATH" ]; then
  echo "Generating release keystore at $KEYSTORE_PATH..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE_PATH" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=WINRAH Warehouse, OU=Logistics, O=Winrah, L=Casablanca, C=MA"
  echo "✅ Keystore created."
else
  echo "✅ Found existing release keystore."
fi

# 5. Build Android Release APK and AAB
echo ""
echo "🤖 4. Building Signed Android APK & AAB..."
cd "$ROOT_DIR/android"
export KEYSTORE_FILE="winrah-release.keystore"
export KEYSTORE_PASSWORD="$STORE_PASSWORD"
export KEY_ALIAS="$KEY_ALIAS"
export KEY_PASSWORD="$KEY_PASSWORD"

./gradlew assembleRelease bundleRelease --no-daemon

mkdir -p "$ROOT_DIR/release"
cp "$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk" "$ROOT_DIR/release/winrah-release.apk"
cp "$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab" "$ROOT_DIR/release/winrah-release.aab"

echo ""
echo "=============================================================================="
echo "🎉 ANDROID BUILD COMPLETED SUCCESSFULLY!"
echo "📍 Signed APK: $ROOT_DIR/release/winrah-release.apk"
echo "📍 Signed AAB: $ROOT_DIR/release/winrah-release.aab"
echo "=============================================================================="

# 6. iOS Build Status & Guidance
echo ""
echo "🍏 5. iOS Build & Packaging Status:"
if command -v xcodebuild >/dev/null 2>&1 && [ -d "/Applications/Xcode.app" ]; then
  echo "Xcode found. You can archive and sign the iOS app with Xcode."
else
  echo "⚠️ Full Xcode (/Applications/Xcode.app) is not installed on this local environment."
  echo "   The native iOS project has been fully updated and synchronized at: ios/App/App.xcodeproj"
  echo ""
  echo "   To generate the signed iOS .ipa:"
  echo "   Option A (Cloud CI): Trigger the GitHub Actions workflow at .github/workflows/deploy-ios.yml"
  echo "   Option B (Local): Open ios/App/App.xcodeproj in Xcode on a Mac with Xcode installed, and choose Product > Archive."
fi

echo ""
echo "✨ All operations completed!"
