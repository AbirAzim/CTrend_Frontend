# CTrend mobile (Expo / React Native)

Native app. The web app in `../src` is separate (Vite only).

**Publishing to Google Play:** see **[GOOGLE_PLAY_STORE_GUIDE.md](./GOOGLE_PLAY_STORE_GUIDE.md)** (step-by-step).

## Setup

```bash
# from repo root
cp .env.production mobile/.env   # or create mobile/.env with EXPO_PUBLIC_* vars
npm run mobile:prebuild          # once: generates mobile/android/
```

`mobile/.env` needs:

```
EXPO_PUBLIC_GRAPHQL_HTTP=https://your-api/graphql
EXPO_PUBLIC_GRAPHQL_WS=wss://your-api/graphql
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

**Google Sign-In (Android):** In [Google Cloud Console](https://console.cloud.google.com/), create an **Android** OAuth client for package `com.ctrend.app` and add SHA-1 fingerprints:

```
Debug (mobile/android/app/debug.keystore):  EC:CF:F6:3B:93:80:A3:5F:3B:83:8B:C7:29:E3:E5:59:8C:01:DC:5D
Release (ke-jitbe-release.keystore):      B0:77:73:F8:4C:06:A1:0D:0B:FE:5A:E8:7B:14:5E:0E:6A:9C:3D:71
```

When `android/keystore.properties` exists, **release** builds use the release key; **debug** builds always use `android/app/debug.keystore` (required for Google Sign-In on local installs).

Use the same **Web client ID** as the web app for `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

## Low memory / PC crashes (OOM)

Your machine had **512MB swap (full)** while Gradle + Cursor + Chromium ran together.
The kernel then kills Chromium (`app-org.chromium.Chromium-*.scope`).

**Before any Android build:**

1. Close extra browser tabs; quit **Android Studio** (not required for terminal builds).
2. Enlarge swap once: `sudo ./scripts/increase-swap-8g.sh` (from repo root).
3. Build with: `./scripts/build-mobile-apk-safe.sh` (stops Gradle daemons, limits RAM).

**Does the phone need the PC?**

| Mode | PC needed after install? |
|------|---------------------------|
| **Debug APK** (`assembleDebug`) | No — JS is inside the APK; test offline. |
| **Dev** (`expo start` + `expo run:android`) | Yes — Metro on PC serves JS over USB/Wi‑Fi. |

**Android Studio open?** No — use terminal only; Studio + Gradle doubles RAM use.

## Run on a connected phone (USB debugging)

Close Android Studio first to avoid two Gradle daemons.

```bash
export ANDROID_SERIAL=YOUR_DEVICE_ID   # adb devices
npm run mobile:android -w mobile
```

If Expo asks for a device interactively, pick the USB device in the terminal.

## Debug APK only (lighter than `expo run:android`)

```bash
npm run mobile:prebuild
npm run mobile:apk -w mobile
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

APK path: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`
