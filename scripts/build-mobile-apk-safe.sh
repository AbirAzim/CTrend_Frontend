#!/usr/bin/env bash
# Build Expo mobile debug APK with minimal RAM use. Run from repo root.
# Skips expo prebuild if android/ already exists to preserve custom build.gradle settings.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/tmp"
export TMPDIR="$HOME/tmp"
export GRADLE_USER_HOME="$HOME/.gradle"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}"

cd "$ROOT/mobile"

# Load production env so EXPO_PUBLIC_* vars are embedded in the JS bundle.
if [[ -f .env ]]; then
  echo "==> Loading mobile/.env..."
  set -a && source .env && set +a
else
  echo "WARN: mobile/.env not found — Google Sign-In and API URLs may be missing from the bundle." >&2
fi

# ── Stop leftover Gradle daemons to free RAM ──────────────────────────────────
echo "==> Stopping leftover Gradle daemons..."
if [[ -x android/gradlew ]]; then
  (cd android && ./gradlew --stop 2>/dev/null) || true
fi

# ── Skip expo prebuild if android/ already exists ────────────────────────────
# prebuild overwrites android/app/build.gradle and android/gradle.properties,
# losing debuggableVariants=[] and the low-RAM Gradle settings.
if [[ -d android/app ]]; then
  echo "==> android/ already exists — skipping expo prebuild (preserving custom settings)"
else
  echo "==> android/ not found — running expo prebuild..."
  npx expo prebuild --platform android --no-install

  # Restore critical settings that prebuild wipes
  echo "==> Restoring debuggableVariants=[] in build.gradle..."
  sed -i 's|// debuggableVariants = \[\]|debuggableVariants = []|g' android/app/build.gradle || true

  echo "==> Restoring low-RAM Gradle settings..."
  cat >> android/gradle.properties << 'PROPS'
org.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=256m -XX:+HeapDumpOnOutOfMemoryError
org.gradle.daemon=false
org.gradle.workers.max=2
PROPS
fi

# ── Bundle JS first (fast check before slow Gradle) ──────────────────────────
echo "==> Verifying JS bundle (catches JS errors before Gradle)..."
npx expo export:embed --eager --platform android --dev false 2>&1 | tail -5

# ── Build APK ─────────────────────────────────────────────────────────────────
echo "==> Building debug APK..."
cd android
./gradlew assembleDebug --no-daemon --max-workers=2

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ ! -f "$APK" ]]; then
  echo "ERROR: APK not found at $APK" >&2
  exit 1
fi

echo ""
echo "✓ Build done: $(pwd)/$APK"
ls -lah "$APK"

# ── Install on phone ──────────────────────────────────────────────────────────
if adb devices 2>/dev/null | grep -q 'device$'; then
  echo "==> Device found — installing APK..."
  adb install -r "$APK" || {
    echo "Install failed (signature mismatch?). Uninstalling old build and retrying..."
    adb uninstall com.ctrend.app 2>/dev/null || true
    adb install -r "$APK"
  }
  echo "==> Enabling app if needed..."
  adb shell pm enable com.ctrend.app 2>/dev/null || true
  echo "==> Launching app..."
  adb shell am start -n com.ctrend.app/.MainActivity
  echo ""
  echo "✓ Installed and launched. Watch logcat with:"
  echo "  adb logcat -c && adb shell am start -n com.ctrend.app/.MainActivity && sleep 5 && adb logcat -d | grep -iE 'ReactNativeJS|FATAL|ctrend|valueUnpacker|8081'"
else
  echo "No device found. Connect phone with USB debugging then:"
  echo "  adb install -r $(pwd)/$APK"
  echo "  adb shell pm enable com.ctrend.app"
fi
