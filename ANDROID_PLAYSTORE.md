# CTrend → Android Play Store

This guide takes the existing React + Vite web app and wraps it into a native
Android app using **Capacitor**. Capacitor embeds the built web app inside a
native WebView, which means all your existing GraphQL calls, routing, and UI
work unchanged — you just add a native shell around them.

---

## 0. Prerequisites

Install these on your machine before starting:

| Tool | Version | How to get |
|------|---------|------------|
| Node.js | ≥ 18 | Already installed |
| Android Studio | Latest stable | https://developer.android.com/studio |
| Java (JDK) | 17 or 21 | Bundled with Android Studio or via `brew install openjdk@17` |
| Android SDK | API 35 (Android 15) | Install from Android Studio → SDK Manager |

After installing Android Studio, open its **SDK Manager** (Tools → SDK Manager)
and make sure these are ticked:

- Android SDK Platform 35
- Android SDK Build-Tools 35
- Android Emulator
- Google Play services

Add these to your shell profile (`~/.zshrc`):

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

Then reload: `source ~/.zshrc`

---

## 1. Install Capacitor

Inside the `CTrend_frontend` folder:

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npm install @capacitor/android
```

---

## 2. Fix Vite's asset base path

Capacitor serves the `dist/` folder from a local file path, not a web server
root. Relative asset paths break unless you tell Vite to use `"./"`.

Open `vite.config.ts` and add `base: "./"`:

```ts
// vite.config.ts
export default defineConfig(({ mode }) => {
  // ... existing env/proxy setup ...
  return {
    base: "./",          // ← add this line
    plugins: [react()],
    // ...
  };
});
```

---

## 3. Initialise Capacitor

```bash
npx cap init
```

Answer the prompts:

| Prompt | Value |
|--------|-------|
| App name | `CTrend` |
| App package ID | `com.ctrend.app` (or your own reverse-domain) |
| Web asset directory | `dist` |

This creates `capacitor.config.ts` in the project root. Open it and confirm:

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ctrend.app',
  appName: 'CTrend',
  webDir: 'dist',
  server: {
    // For production builds leave this out entirely.
    // During development you can point to your local dev server:
    // url: 'http://10.0.2.2:5173',   // 10.0.2.2 = host machine from Android emulator
    // cleartext: true,
  },
};

export default config;
```

---

## 4. Set the production API URL

The app currently reads `VITE_GRAPHQL_HTTP` and `VITE_GRAPHQL_WS` from the
environment. Create a `.env.production` file (if you don't have one already):

```env
# .env.production
VITE_GRAPHQL_HTTP=https://your-backend-domain.com/graphql
VITE_GRAPHQL_WS=wss://your-backend-domain.com/graphql
```

Replace `your-backend-domain.com` with wherever your NestJS API is deployed
(Railway, Render, etc.). These values get baked into the JS bundle at build
time.

---

## 5. Add the Android platform

```bash
npx cap add android
```

This creates an `android/` folder — a full Gradle Android project. Check it
into git (it won't be large and you'll need to edit it for app icons and
signing).

---

## 6. Build and sync

Every time you change frontend code you need to rebuild and sync:

```bash
npm run build          # compiles TypeScript + Vite → dist/
npx cap sync android   # copies dist/ into android/ + updates plugins
```

> **Shortcut:** `npx cap sync` alone is enough; it runs `copy` + `update`.

---

## 7. Add app icons and splash screen

### Install the assets plugin

```bash
npm install @capacitor/assets -D
```

### Prepare source images

Create a folder `assets/` in the project root with:

```
assets/
  icon.png          # 1024×1024 px, no transparency, your logo
  icon-foreground.png  # same, used for adaptive icons on Android 8+
  icon-background.png  # 1024×1024 solid colour background (e.g. #312e81 — your theme-color)
  splash.png        # 2732×2732 px, centred logo on a solid background
  splash-dark.png   # same but dark-mode variant (optional)
```

You can resize the existing `public/logo.png` in any image editor (Figma,
Photoshop, GIMP, or even https://squoosh.app).

### Generate all icon sizes automatically

```bash
npx @capacitor/assets generate --android
```

This writes the correctly-sized PNGs into `android/app/src/main/res/`.

---

## 8. Update the AndroidManifest

Open `android/app/src/main/AndroidManifest.xml`.

Add internet permission (Capacitor does this by default, but verify it exists):

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Set the `android:label` and `android:icon` if they aren't already:

```xml
<application
    android:label="CTrend"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    ...>
```

---

## 9. Allow your backend origin (one small backend env change)

Capacitor apps on Android make requests from `capacitor://localhost`. Your
NestJS backend reads allowed origins from `CORS_ORIGIN`. No code change is
needed — just update the environment variable on your deployed backend:

```
CORS_ORIGIN=https://your-frontend-domain.com,capacitor://localhost
```

---

## 10. Open in Android Studio and test

```bash
npx cap open android
```

Android Studio opens. Press the green **Run ▶** button (or `Shift+F10`) to
launch on an emulator or a plugged-in physical device.

Check that:
- The app loads and you can log in
- GraphQL queries work (check Logcat for network errors)
- Navigation (React Router) works — tap the browser back button concept inside the app
- Google OAuth works (see note below)

### Google OAuth on Android

`@react-oauth/google` uses a browser popup. In a WebView this works via an
in-app Chrome Custom Tab. You need to add your Android app's **SHA-1
fingerprint** as an authorised Android client in the Google Cloud Console:

1. In Android Studio → **Gradle → Tasks → android → signingReport** to get
   the SHA-1 of your debug keystore.
2. In Google Cloud Console → Your project → **Credentials → OAuth 2.0 Client
   IDs → Android** → Add the package name `com.ctrend.app` and the SHA-1.
3. Repeat with the release keystore SHA-1 before publishing.

---

## 11. Create a release keystore (do this once, keep it safe)

```bash
keytool -genkey -v \
  -keystore ctrend-release.keystore \
  -alias ctrend \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store `ctrend-release.keystore` somewhere **outside** the git repo (or in a
private secrets manager). You will need it forever — losing it means you cannot
publish updates to the same Play Store listing.

### Wire the keystore into Gradle

Open `android/app/build.gradle` and add inside `android { ... }`:

```gradle
signingConfigs {
    release {
        storeFile file("/absolute/path/to/ctrend-release.keystore")
        storePassword "your_store_password"
        keyAlias "ctrend"
        keyPassword "your_key_password"
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

> **Security tip:** Instead of hardcoding passwords here, use Android Studio's
> local `keystore.properties` file and load them via `def keystoreProps = ...`.
> See https://developer.android.com/studio/publish/app-signing#secure-shared-keystore

---

## 12. Build the release AAB (Android App Bundle)

Google Play requires an **AAB** (not an APK) for new apps.

In Android Studio:

1. **Build → Generate Signed Bundle / APK**
2. Choose **Android App Bundle**
3. Select your keystore, fill in passwords and alias
4. Choose **release** build variant
5. Click **Finish**

Output will be at:
```
android/app/release/app-release.aab
```

Or from the terminal:

```bash
cd android
./gradlew bundleRelease
# output: app/build/outputs/bundle/release/app-release.aab
```

---

## 13. Create the Play Store listing

1. Go to https://play.google.com/console and sign in with a Google account.
2. Pay the **one-time $25 developer registration fee**.
3. Click **Create app**.

Fill in the required details:

| Field | Value |
|-------|-------|
| App name | CTrend |
| Default language | English (United States) |
| App or game | App |
| Free or paid | Free |

### Store listing (required)

- **Short description** (80 chars max): e.g. *Vote on trends, follow friends, discover what's hot*
- **Full description** (4000 chars max): Describe the app's features
- **App icon**: 512×512 PNG (use the same icon you made in step 7)
- **Feature graphic**: 1024×500 PNG banner (create one in Canva or Figma)
- **Screenshots**: Minimum 2 phone screenshots (take them from the emulator: `adb exec-out screencap -p > screen.png`)

### Content rating

Go to **Policy → App content → Content rating** and fill in the questionnaire.
CTrend is a social voting app — it will likely receive a rating of **Everyone**
or **Teen**.

### Privacy policy

Google requires a privacy policy URL. Create a simple one (you can use
https://www.privacypolicygenerator.info/) and host it on your domain or a
GitHub Gist. Paste the URL in **App content → Privacy policy**.

---

## 14. Upload the AAB and create a release

1. In Play Console → **Testing → Internal testing** (start here to test before
   going public)
2. Click **Create new release**
3. Upload `app-release.aab`
4. Fill in release notes (e.g. *Initial release*)
5. Click **Save → Review release → Start rollout**

Add your own Gmail to the **Internal testers** list and install the app via the
opt-in link to verify everything works end-to-end on a real device.

Once internal testing passes:

- Promote to **Closed testing (Alpha)** → invite a small group
- Promote to **Open testing (Beta)** → anyone can join
- Promote to **Production** → public release

Google reviews the app before it goes live. First review typically takes
**1–3 business days**.

---

## 15. Day-to-day update workflow

Every time you ship a new version:

```bash
# 1. Bump version in android/app/build.gradle
#    versionCode must increase by at least 1 each release
#    versionName is the human-readable string shown in the Store

# 2. Rebuild
npm run build
npx cap sync android

# 3. Build signed AAB (Android Studio or ./gradlew bundleRelease)

# 4. Upload to Play Console → Production → Create new release
```

---

## Checklist before submitting

- [ ] `VITE_GRAPHQL_HTTP` and `VITE_GRAPHQL_WS` point to production backend
- [ ] `capacitor.config.ts` has no `server.url` (that's for dev only)
- [ ] App icons and splash screen generated in all sizes
- [ ] Release keystore backed up securely (not in git)
- [ ] `versionCode` incremented in `build.gradle`
- [ ] `CORS_ORIGIN` on backend includes `capacitor://localhost`
- [ ] Google OAuth Android client ID configured with release SHA-1
- [ ] Privacy policy URL added to Play Console
- [ ] Content rating questionnaire completed
- [ ] Tested on a real Android device via Internal Testing track
- [ ] Screenshots and feature graphic uploaded to Store listing
