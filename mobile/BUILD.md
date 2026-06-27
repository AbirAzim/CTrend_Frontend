# Ke Jitbe — Android Build Guide

Everything about building, installing, and shipping the Android app.
For Play Store publishing details see [`GOOGLE_PLAY_STORE_GUIDE.md`](GOOGLE_PLAY_STORE_GUIDE.md).

---

## Device setup (one-time)

1. On your Pixel 6: **Settings → About phone** → tap **Build number** 7 times → Developer options enabled.
2. **Settings → Developer options → USB debugging → ON**.
3. Plug in via USB, accept the RSA fingerprint prompt on the phone.
4. Verify the device is seen:
   ```bash
   adb devices
   # Should show: 1C071FDF600CCE  device
   ```

Your device serial is `1C071FDF600CCE`. All ADB commands that target the phone explicitly use `ANDROID_SERIAL=1C071FDF600CCE`.

---

## Debug build (day-to-day development)

### Method 1 — `expo run:android` (fastest, what Claude uses)

Run from the `mobile/` directory:

```bash
ANDROID_SERIAL=1C071FDF600CCE npx expo run:android
```

What it does:
- Compiles the native Android project with Gradle (incremental — fast after first build)
- Installs the **debug APK** directly on the connected Pixel 6
- Launches the app

Claude runs this command via the Bash tool every time you ask for a debug install. It runs in the background and notifies when done (usually 2–4 min on incremental builds, ~8 min cold).

If the phone isn't connected when the build starts it exits immediately with:
```
CommandError: No Android connected device found
```
→ Check USB cable, re-enable USB debugging, confirm `adb devices` shows the device, then retry.

### Method 2 — safe build script (low-RAM / clean rebuild)

From repo root:

```bash
./scripts/build-mobile-apk-safe.sh
```

Use this when:
- The incremental Gradle cache is corrupted
- You get OOM errors during the build
- You need to do a fully clean debug build

What it does differently:
- Stops all leftover Gradle daemons first (frees RAM)
- Skips `expo prebuild` if `android/` already exists (preserves custom `build.gradle` settings)
- Verifies the JS bundle compiles before starting Gradle
- Installs and launches the app automatically if a device is connected

### Logcat (reading crash logs)

```bash
adb logcat -c && adb shell am start -n com.ctrend.app/.MainActivity && sleep 5 && adb logcat -d | grep -iE 'ReactNativeJS|FATAL|ctrend'
```

---

## Production / release build

Full process from code changes to Play Store upload. Do every step in order.

---

### Step 1 — Bump version numbers (ALL THREE files)

Every Play Store upload needs a higher `versionCode` than the previous one. Edit all three files manually:

**`mobile/android/app/build.gradle`**
```gradle
versionCode 38          ← increment by 1
versionName "1.11.0"   ← bump semver (major.minor.patch)
```

**`mobile/app.json`**
```json
"version": "1.11.0",
"android": {
  "versionCode": 38,
```

**`packages/shared/src/lib/appUpdate.ts`**
```ts
export const BUNDLED_ANDROID_VERSION_CODE = 38;
```

> All three must have the **same** versionCode. The build script checks this and exits immediately if they don't match. If the numbers drifted (happens when builds are done on different machines), set all three to the same value before building.

Current version after 1.11.0 release: **versionCode 38** across all three files.

---

### Step 2 — Check prerequisites

Before running the build script, confirm:

- [ ] `mobile/.env` exists and has **production** API URLs (not localhost)
- [ ] `mobile/android/keystore.properties` exists and points to the release keystore
- [ ] `mobile/android/app/google-services.json` present

`mobile/.env` (production):
```env
EXPO_PUBLIC_GRAPHQL_HTTP=https://seashell-app-stt6c.ondigitalocean.app/graphql
EXPO_PUBLIC_GRAPHQL_WS=wss://seashell-app-stt6c.ondigitalocean.app/graphql
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=41983174733-rpq1s0k95fhnme4jfrb2uv2usfq4p1ce.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=41983174733-6hpfraahn2h971omfc1ntbgmuccaulp9.apps.googleusercontent.com
```

`mobile/android/keystore.properties` (gitignored — never commit):
```properties
storeFile=/absolute/path/to/ke-jitbe-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=ke-jitbe
keyPassword=YOUR_KEY_PASSWORD
```

---

### Step 3 — Run the release build script

From repo root:

```bash
./scripts/build-mobile-aab-release.sh
```

What the script does internally:
1. Stops leftover Gradle daemons to free RAM
2. Reads `mobile/.env` — production URLs get baked into the JS bundle at this point
3. Checks `versionCode` matches in all three files — **exits with error if not**
4. Bundles the JS with Metro (`expo export:embed`) — surfaces any JS/TS errors before Gradle starts
5. Runs `./gradlew bundleRelease` → produces the **AAB** for Play Store
6. Runs `./gradlew assembleRelease` → produces a **release APK** for sideload testing
7. If a device is connected via USB, installs the release APK on it automatically

Output files:
```
mobile/android/app/build/outputs/bundle/release/app-release.aab   ← upload to Play Console
mobile/android/app/build/outputs/apk/release/app-release.apk      ← optional: test on device
```

Build takes ~2–5 min on an incremental Gradle cache, ~10–15 min cold.

**If the script fails with `grep: invalid option -- P`:**
This is a macOS vs Linux difference. macOS's BSD grep has no `-P` (Perl regex) flag. The fix is already applied in the script (uses `grep -E` instead). If you see this error, it means the script was reverted — open `scripts/build-mobile-aab-release.sh` and change any `grep -oP` to `grep -oE` with equivalent patterns.

---

### Step 4 — Test the release APK on device (optional but recommended)

If a device was connected during the build, it's already installed. Otherwise:

```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

Verify cold start works, login works, feed loads from production API.

---

### Step 5 — Upload AAB to Play Console

1. Open [Play Console](https://play.google.com/console) → your app → **Testing → Closed testing**
2. Click **Create new release**
3. Upload `mobile/android/app/build/outputs/bundle/release/app-release.aab`
4. **Release name:** `{versionName} ({versionCode})` — e.g. `1.10.0 (37)`
5. **What's new** (shown to users in Play Store update listing):
   ```
   • [Feature 1 in plain language]
   • [Feature 2]
   • Bug fixes and stability improvements
   ```
   See **Play Console copy** below for the current release.
6. Click **Save → Review release → Start rollout to Closed testing**

Play Store links:
- Public listing: `https://play.google.com/store/apps/details?id=com.ctrend.app`
- Closed testing opt-in: `https://play.google.com/apps/testing/com.ctrend.app`

---

### Step 6 — Force update old installs (after rollout is live)

Once the release is live on Play Console:

Admin app → **Force Android update** → set min `versionCode` to the new build number.

Users on older versionCodes see a blocking "Update required" dialog with a link to the Play Store. Set it to `0` to disable the force update.

---

### Release history

| Version | versionCode | Date | Changes |
|---------|-------------|------|---------|
| 1.11.0 | 38 | 2026-06-27 | Admin overview redesign (stats, charts, online users), platform settings UX, notifications page, profile/rewards polish |
| 1.10.0 | 37 | 2026-06-26 | Referral admin toggle, leaderboard rank on profile, notification fixes (background + no duplicates), branded splash, rewards UI polish, launch sound fix |
| 1.9.0 | 36 | 2026-06-25 | Compact compare cells for 5–6 image posts, silent sound option, announcement edit fix |
| 1.8.0 | 35 | — | World Cup tab, campaign features |

### Play Console copy — 1.11.0 (38)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.11.0 (38)
```

**What's new** (user-facing release notes)
```
• Redesigned admin dashboard — live stats, activity charts, and online user list
• Smarter platform settings — clearer controls for global posts and referral program
• New notifications page — see all alerts in one place
• Profile and rewards UI polish
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Admin overview overhaul (web + mobile): clickable stats, 14-day activity charts/tables,
online users API, platform settings card UI. Notifications page added. Requires backend
deploy with adminOnlineUsers + adminPlatformStats APIs.
```

### Play Console copy — 1.10.0 (37)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.10.0 (37)
```

**What's new** (user-facing release notes)
```
• Leaderboard ranks on your profile — see your coin standing at a glance
• Smarter notifications — vote, comment, and chat alerts work reliably in the background
• Invite friends anytime; referral points can be turned on or off by admins
• Cleaner rewards cards and a polished app launch screen
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Major quality release: notification pipeline (FCM + Notifee), referral program toggle,
coin leaderboard rank badges, splash screen branding, profile rewards UI, startup sound fix.
Requires backend deploy with coinLeaderboardRank + referralSystemEnabled APIs.
```

---

## Signing

| Build type | Keystore used |
|------------|--------------|
| Debug | `mobile/android/app/debug.keystore` (auto, password: `android`) |
| Release | `mobile/android/keystore.properties` → your release keystore |

Release builds automatically fall back to the debug key when `keystore.properties` is missing (safe for local testing, **not** for Play uploads).

Verify which key a build uses:
```bash
cd mobile/android && ./gradlew signingReport
```

Google Sign-In requires the **release SHA-1** registered in Google Cloud Console (APIs & Services → Credentials → Android OAuth client). Without it, Google Sign-In works in debug but fails on Play Store builds. See [`GOOGLE_PLAY_STORE_GUIDE.md`](GOOGLE_PLAY_STORE_GUIDE.md) §6.

---

## Key rules

| Rule | Why |
|------|-----|
| Bump `versionCode` in **all three** files before each Play upload | The release script checks this and exits on mismatch; Play also rejects duplicate version codes |
| Never commit `keystore.properties` or `mobile/.env` | Gitignored; contains signing secrets and production API keys |
| Never lose the release keystore | Google cannot re-sign with a different key — losing it means you cannot ship updates to the existing listing |
| Rebuild after any `.env` change | Env vars are baked in at bundle time, not at runtime |
| Enable `minifyEnabled` (R8) before next release | Reduces the ~55MB AAB size and silences Play's deobfuscation-file warning |
| `build-mobile-aab-release.sh` uses `grep -E` not `grep -P` | macOS BSD grep has no `-P` flag — PCRE patterns will break on Mac, use `-E` |

---

## Quick reference

```bash
# Debug install on Pixel 6 (from mobile/)
ANDROID_SERIAL=1C071FDF600CCE npx expo run:android

# Debug install — clean / low-RAM (from repo root)
./scripts/build-mobile-apk-safe.sh

# Release AAB + APK (from repo root)
./scripts/build-mobile-aab-release.sh

# Verify signing config
cd mobile/android && ./gradlew signingReport

# SHA-1 from release keystore
keytool -list -v -keystore /path/to/ke-jitbe-release.keystore -alias ke-jitbe

# Read device logs
adb logcat | grep -iE 'ReactNativeJS|FATAL|ctrend'

# Screenshot
adb exec-out screencap -p > screen.png

# Install release APK manually
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## Package info

| Field | Value |
|-------|-------|
| Package name | `com.ctrend.app` |
| App name | Ke Jitbe |
| Device for testing | Pixel 6 · serial `1C071FDF600CCE` |
| Stack | Expo SDK 56 · React Native 0.85 · Hermes |
| Current version | 1.11.0 (versionCode 38) |

---

*For Play Store listing, assets, legal, and track promotion — see [`GOOGLE_PLAY_STORE_GUIDE.md`](GOOGLE_PLAY_STORE_GUIDE.md).*
