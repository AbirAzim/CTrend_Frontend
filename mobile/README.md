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

**Google Sign-In (Android):** In [Google Cloud Console](https://console.cloud.google.com/), create an **Android** OAuth client for package `com.ctrend.app` and add your debug SHA-1:

```
3A:88:C4:FD:BF:5E:48:F0:10:84:1F:BD:F3:93:01:9B:D4:57:FE:B6
```

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
