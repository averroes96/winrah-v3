#!/usr/bin/env bash
set -e

# Find keytool
if [ -x "/opt/homebrew/opt/openjdk@21/bin/keytool" ]; then
  KEYTOOL="/opt/homebrew/opt/openjdk@21/bin/keytool"
elif [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/keytool" ]; then
  KEYTOOL="$JAVA_HOME/bin/keytool"
else
  KEYTOOL="keytool"
fi

echo "Using keytool: $KEYTOOL"
"$KEYTOOL" -genkeypair -v \
  -keystore android/app/winrah-release.keystore \
  -alias winrah \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  "$@"
