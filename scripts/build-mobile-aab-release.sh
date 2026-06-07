#!/usr/bin/env bash
# Build signed release AAB for Google Play + optional release APK for device testing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/tmp"
export TMPDIR="$HOME/tmp"
export GRADLE_USER_HOME="$HOME/.gradle"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}"

cd "$ROOT/mobile"

if [[ ! -f android/keystore.properties ]]; then
  echo "ERROR: android/keystore.properties missing. See mobile/GOOGLE_PLAY_STORE_GUIDE.md §8" >&2
  exit 1
fi

echo "==> Stopping Gradle daemons..."
if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew --stop 2>/dev/null) || true
fi

echo "==> Loading production env..."
if [[ -f .env ]]; then
  set -a && source .env && set +a
else
  echo "WARN: mobile/.env not found — using embedded defaults" >&2
fi

echo "==> Verifying versionCode sync (app.json / build.gradle / appUpdate.ts)..."
APP_JSON_CODE=$(grep -oP '"versionCode":\s*\K[0-9]+' "$ROOT/mobile/app.json" | head -1)
GRADLE_CODE=$(grep -oP 'versionCode\s+\K[0-9]+' "$ROOT/mobile/android/app/build.gradle" | head -1)
BUNDLED_CODE=$(grep -oP 'BUNDLED_ANDROID_VERSION_CODE = \K[0-9]+' "$ROOT/packages/shared/src/lib/appUpdate.ts" | head -1)
if [[ "$APP_JSON_CODE" != "$GRADLE_CODE" || "$APP_JSON_CODE" != "$BUNDLED_CODE" ]]; then
  echo "ERROR: versionCode mismatch — app.json=$APP_JSON_CODE build.gradle=$GRADLE_CODE appUpdate.ts=$BUNDLED_CODE" >&2
  echo "Sync all three before building. See mobile/GOOGLE_PLAY_STORE_GUIDE.md" >&2
  exit 1
fi
echo "✓ versionCode $APP_JSON_CODE (all sources match)"

echo "==> Verifying JS bundle..."
npx expo export:embed --eager --platform android --dev false 2>&1 | tail -5

echo "==> Building release AAB..."
cd android
./gradlew bundleRelease --no-daemon --max-workers=2

AAB="app/build/outputs/bundle/release/app-release.aab"
if [[ ! -f "$AAB" ]]; then
  echo "ERROR: AAB not found at $AAB" >&2
  exit 1
fi

echo ""
echo "✓ Release AAB: $(pwd)/$AAB"
ls -lah "$AAB"

echo "==> Building release APK (for local install test)..."
./gradlew assembleRelease --no-daemon --max-workers=2

APK="app/build/outputs/apk/release/app-release.apk"
if [[ -f "$APK" ]]; then
  echo "✓ Release APK: $(pwd)/$APK"
  ls -lah "$APK"
  if adb devices 2>/dev/null | grep -q 'device$'; then
    echo "==> Installing release APK on connected device..."
    adb install -r "$APK" || {
      echo "Install failed (signature mismatch?). Uninstalling old build and retrying..."
      adb uninstall com.ctrend.app 2>/dev/null || true
      adb install -r "$APK"
    }
    adb shell pm enable com.ctrend.app 2>/dev/null || true
    adb shell am start -n com.ctrend.app/.MainActivity
    echo "✓ Installed and launched release build on device."
  fi
else
  echo "WARN: release APK not found (AAB build succeeded)" >&2
fi

echo ""
echo "Upload to Play Console → Testing → Closed testing → Create new release"
echo "  AAB: mobile/android/app/build/outputs/bundle/release/app-release.aab"
echo "  Production: https://play.google.com/store/apps/details?id=com.ctrend.app"
echo "  Closed test: https://play.google.com/apps/testing/com.ctrend.app"
echo "After rollout: Admin → Force Android update → set min versionCode to match this release."
