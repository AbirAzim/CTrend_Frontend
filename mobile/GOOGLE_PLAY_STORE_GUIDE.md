# Ke Jitbe — Google Play Store Publishing Guide

Step-by-step instructions to publish the **Expo React Native** app (`mobile/`) on Google Play.

| Item | Value |
|------|--------|
| **App name (user-facing)** | Ke Jitbe |
| **Company / app brand** | **CTrend** |
| **Developer (individual)** | **Abir Azim Badhon** (Bangladesh) |
| **Play Console account type** | Personal developer (sole developer) |
| **Contact email** | `badhonkhanbk007@gmail.com` |
| **Distribution** | **Worldwide** — all countries/regions Google Play supports (unless you exclude specific markets later) |
| **Website / legal pages** | `https://kejitbe.app` · `/privacy` · `/terms` · `/credits` |
| **Package name** | `com.ctrend.app` |
| **Stack** | Expo SDK 56 · React Native 0.85 · Hermes |
| **Backend (production)** | `https://seashell-app-stt6c.ondigitalocean.app/graphql` |
| **Web client (separate)** | Vite app in repo root `src/` — not uploaded to Play Store |

> **Important:** The old Capacitor/WebView guide in [`../ANDROID_PLAYSTORE.md`](../ANDROID_PLAYSTORE.md) is obsolete. Follow **this document** only.

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Google Play Developer account](#2-google-play-developer-account)
3. [Legal & policy assets](#3-legal--policy-assets)
4. [Production environment](#4-production-environment)
5. [Firebase & push notifications (FCM)](#5-firebase--push-notifications-fcm)
6. [Google Sign-In (release SHA-1)](#6-google-sign-in-release-sha-1)
7. [Create a release signing key](#7-create-a-release-signing-key)
8. [Wire signing into Gradle](#8-wire-signing-into-gradle)
9. [Version numbers](#9-version-numbers)
10. [Build the release AAB](#10-build-the-release-aab)
11. [Test the release build locally](#11-test-the-release-build-locally)
12. [Create the app in Play Console](#12-create-the-app-in-play-console)
13. [Store listing assets](#13-store-listing-assets)
14. [App content declarations](#14-app-content-declarations)
15. [Upload to Internal testing](#15-upload-to-internal-testing)
16. [Promote through tracks](#16-promote-through-tracks)
17. [Submit for production review](#17-submit-for-production-review)
18. [Every future update](#18-every-future-update)
19. [Pre-submit checklist](#19-pre-submit-checklist)
20. [Troubleshooting](#20-troubleshooting)

---

## 1. Before you start

### Accounts & fees

| Requirement | Details |
|-------------|---------|
| **Google account** | Personal or organisation Gmail |
| **Play Console fee** | One-time **USD $25** registration |
| **Developer identity** | Google may ask for ID verification (can take a few days) |

### Tools on your PC (Linux — your current setup)

```bash
# Verify
node -v          # ≥ 18
java -version    # JDK 17 or 21 (Android Studio bundles one)
adb devices      # optional, for device testing
```

Install **Android SDK** (via [Android Studio](https://developer.android.com/studio) → SDK Manager):

- Android SDK Platform **35** (or latest stable)
- Android SDK Build-Tools **35**
- Platform-tools (includes `adb`)

Add to `~/.bashrc` (adjust path if SDK is elsewhere):

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/emulator
```

Reload: `source ~/.bashrc`

### Repo layout (what gets published)

```
CTrend_Frontend/
├── mobile/                    ← THIS is the Play Store app
│   ├── app/                   Expo Router screens
│   ├── android/               Native Android project (Gradle)
│   ├── assets/                Icons, splash, sounds
│   ├── app.json               App name, package, plugins
│   └── .env                   Production API keys (NOT in git)
├── packages/shared/           GraphQL + types (bundled into app)
└── src/                       Web-only — ignore for Play Store
```

### Low-RAM build tips (your machine)

Before release builds:

1. Close Android Studio (terminal Gradle is enough).
2. Close heavy browser tabs.
3. Use the safe script from repo root:

```bash
./scripts/build-mobile-apk-safe.sh   # debug smoke test
```

For release AAB, see [§10](#10-build-the-release-aab).

---

## 2. Google Play Developer account

1. Open [Google Play Console](https://play.google.com/console).
2. Sign in with your Google account.
3. Click **Get started** / **Create developer account**.
4. Choose **Personal** (sole developer — **Abir Azim Badhon**, Bangladesh).
5. Accept the **Developer Distribution Agreement**.
6. Pay the **$25** registration fee.
7. Complete **Account details**:
   - **Developer name** (shown on Play Store): **Abir Azim Badhon** (must match your ID if Google verifies)
   - **Contact email:** `badhonkhanbk007@gmail.com`
   - **Website:** `https://kejitbe.app`
   - **Company / brand** in app listing and legal pages: **CTrend** (Ke Jitbe is the product name)
8. Finish **Identity verification** if prompted (government ID, etc.).

> **Note:** On a **Personal** account, the public Play Store “Developer” line usually shows your **legal name** (Abir Azim Badhon). **CTrend** appears as the company/brand on your website, privacy policy, terms, and in store description text. An **Organization** account is only needed if you want “CTrend” as the official Play Console legal entity (requires business registration in many regions).

You cannot publish until the account is **verified** and in good standing.

> ⚠️ **NEW personal accounts must run a 20-tester closed test for 14 days before production.**
> Google requires **personal / individual developer accounts created on or after
> 13 Nov 2023** to run a **closed test with at least 20 testers who stay opted-in for
> 14 continuous days**, and *then* apply for production access — before you can ship to
> the public Production track. This is **not optional** for new accounts. **Start
> recruiting your 20 testers now** and budget ~2+ weeks of lead time. See [§16](#16-promote-through-tracks).
>
> If your account existed before that date, you are exempt and can skip straight to Production.

---

## 3. Legal & policy assets

Google **requires** these before production release.

### 3.1 Privacy policy URL

A public **Privacy Policy** page is built into the web app:

| Item | Value |
|------|--------|
| **Route** | `/privacy` |
| **Source** | `src/pages/PrivacyPolicyPage.tsx` |
| **Contact email** | Set `VITE_PRIVACY_CONTACT_EMAIL` in `.env` (defaults to `support@kejitbe.app`) |
| **Play Store privacy URL** | `https://kejitbe.app/privacy` |

Deploy the web app to **`kejitbe.app`** (e.g. Vercel custom domain on `main`), then paste this URL in Play Console → **App content → Privacy policy**:

```
https://kejitbe.app/privacy
```

The page is **public** (no login required) and covers: account data, posts/votes/messages, push tokens, Google Sign-In, Firebase FCM, retention, **13+ minimum age**, **content reporting & moderation**, contact for data requests.

**In-app reporting (Play UGC):** Post **⋯ → Report** on web + mobile → `reportContent` GraphQL stores reports and increments `post.reportCount`. Admins review in **Admin → Reported posts** (web tab **Reports**, mobile admin tab **🚩 Reports**) and can **Delete** violating posts.

**Local preview:**

```bash
npm run dev
# open http://localhost:5173/privacy
```

### 3.2 Terms of service

A public **Terms of Service** page is built into the web app:

| Item | Value |
|------|--------|
| **Route** | `/terms` |
| **Source** | `src/pages/TermsOfServicePage.tsx` |
| **Play Store URL (optional)** | `https://kejitbe.app/terms` |
| **Contact email** | Same as privacy — `VITE_PRIVACY_CONTACT_EMAIL` (e.g. `badhonkhanbk007@gmail.com`) |

Deploy with the web app to **`kejitbe.app`**. Sign-up page links to Terms + Privacy.

### 3.2.1 Credits & team page

Public **Credits & team** page lists developers, producers, and links to legal pages:

| Item | Value |
|------|--------|
| **Route** | `/credits` |
| **Source** | `src/pages/CreditsPage.tsx` · data in `packages/shared/src/lib/teamCredits.ts` |
| **Mobile** | Profile → **Credits** (`mobile/app/profile/credits.tsx`) — opens Privacy/Terms in browser |

**Developers:** Abir Azim Badhon, Anjan Kundu, Asief Mahir  
**Producers:** Niaz Rahman Khan, Tushar Hasan Lavlu, Rahmatulla Sunny

### 3.3 Delete account / data

Google Play requires a way for users to **request account and data deletion** when you collect personal data (email sign-up, profile, posts, etc.). Ke Jitbe meets this via **documented email support** — no in-app delete button yet.

| Item | Status |
|------|--------|
| **How users delete** | Email **`badhonkhanbk007@gmail.com`** (or `VITE_PRIVACY_CONTACT_EMAIL` in production `.env`) |
| **Documented in** | `/privacy` §6 (access, correction, deletion) · `/terms` §11 (account and data deletion) |
| **In-app “Delete account”** | ❌ Not built yet |
| **Backend `deleteAccount` API** | ❌ Not in GraphQL yet — you process requests manually (or add API later) |

**What to tell users (already on legal pages):**

1. Email from the address on the account (or explain if they lost access).
2. Ask to delete the Ke Jitbe account and associated personal data.
3. CTrend verifies and deletes within a reasonable period (retain only what law/security requires).

**Play Console → App content → Data safety**

When asked whether users can request **account or data deletion**, answer **Yes**, and provide:

| Field | Value |
|-------|--------|
| **Deletion method** | Users request deletion by email |
| **Deletion URL or email** | `badhonkhanbk007@gmail.com` (or link to `https://kejitbe.app/privacy` §6 and `https://kejitbe.app/terms` §11) |

Also declare that data is **encrypted in transit** (HTTPS) and whether it is **shared** with service providers (Google Sign-In, Firebase FCM, cloud host) — see [§14.6](#146-data-safety).

**Optional later:** Add Settings → **Delete my account** in web/mobile when the backend exposes `deleteAccount` / `deleteUser` GraphQL; then update Data safety to “in-app deletion” and keep email as a fallback.

---

### 3 — Open items checklist

| # | Item | Status |
|---|------|--------|
| 1 | Legal identity — **CTrend** (brand), **Abir Azim Badhon** (developer), Bangladesh | ✅ |
| 2 | Contact email — **`badhonkhanbk007@gmail.com`** | ✅ Set `VITE_PRIVACY_CONTACT_EMAIL` in `.env` before deploy |
| 3 | Domain — **`https://kejitbe.app`** (`/privacy`, `/terms`) | ✅ Pages built — deploy to go live |
| 4 | Terms of Service | ✅ `/terms` |
| 5 | Account deletion | ✅ **Email support** (Play-compliant); in-app/API later |
| 6 | Minimum age | ✅ **13+** worldwide |
| 7 | UGC moderation | ✅ Report + Admin Reports |
| 8 | Paid / ads | ✅ **Free, no ads** (stated in `/terms` §8) |

---

## 4. Production environment

The mobile app reads **`EXPO_PUBLIC_*`** variables at **build time** (embedded in the JS bundle).

### 4.1 Create `mobile/.env`

From repo root:

```bash
cp .env.example mobile/.env   # if you have a template
# OR create mobile/.env manually:
```

```env
EXPO_PUBLIC_GRAPHQL_HTTP=https://seashell-app-stt6c.ondigitalocean.app/graphql
EXPO_PUBLIC_GRAPHQL_WS=wss://seashell-app-stt6c.ondigitalocean.app/graphql
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=41983174733-rpq1s0k95fhnme4jfrb2uv2usfq4p1ce.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=41983174733-6hpfraahn2h971omfc1ntbgmuccaulp9.apps.googleusercontent.com
```

> **Never commit** `mobile/.env` — it is gitignored.

### 4.2 Backend checklist

Confirm with your backend team:

- [ ] Production GraphQL is live and stable
- [ ] WebSocket (`wss://`) works from mobile networks
- [ ] CORS is **not** an issue for native apps (no browser CORS on RN)
- [ ] Push token registration mutation works (`registerPushToken`)
- [ ] OAuth / email auth works for real users

### 4.3 Rebuild after any `.env` change

Environment variables are baked in when Gradle runs `export:embed`. Changing `.env` requires a **new AAB build**.

---

## 5. Firebase & push notifications (FCM)

The Android project applies the Google Services plugin (`com.google.gms.google-services` in `mobile/android/app/build.gradle`). Push notifications need Firebase.

### 5.1 Create Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. **Add project** (e.g. `Ke Jitbe` / `CTrend`).
3. Enable **Google Analytics** (optional but common).

### 5.2 Add Android app to Firebase

1. Firebase → **Project settings** → **Your apps** → **Add app** → Android.
2. **Android package name:** `com.ctrend.app` (must match exactly).
3. **App nickname:** Ke Jitbe (optional).
4. **Debug signing certificate SHA-1:** add your **debug** SHA-1 now (see [§6](#6-google-sign-in-release-sha-1) for how to get it).
5. Download **`google-services.json`**.

### 5.3 Place config file

```bash
cp ~/Downloads/google-services.json mobile/android/app/google-services.json
```

This path is **gitignored** — keep a backup in a secrets folder (1Password, etc.).

### 5.4 Release SHA-1 in Firebase

After you create the **release keystore** ([§7](#7-create-a-release-signing-key)), add the **release SHA-1** to the same Firebase Android app (Project settings → Your apps → Add fingerprint).

### 5.5 Backend FCM

Your NestJS backend must send pushes using the **same Firebase project** server key / service account. Coordinate with backend — mobile only registers device tokens via GraphQL.

---

## 6. Google Sign-In (release SHA-1)

Native Google Sign-In uses `@react-native-google-signin/google-signin`.

### 6.1 Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → same project as OAuth.
2. **APIs & Services → Credentials**.

You need **two** OAuth client types:

| Type | Purpose |
|------|---------|
| **Web client** | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env` |
| **Android client** | Package `com.ctrend.app` + SHA-1 fingerprints |

### 6.2 Get SHA-1 fingerprints

**Debug** (already used during development):

```bash
cd mobile/android
./gradlew signingReport
```

Look for `Variant: debug` → SHA-1. Example debug SHA-1 used in this project:

```
3A:88:C4:FD:BF:5E:48:F0:10:84:1F:BD:F3:93:01:9B:D4:57:FE:B6
```

**Release** (after [§7](#7-create-a-release-signing-key)):

```bash
keytool -list -v \
  -keystore /path/to/ke-jitbe-release.keystore \
  -alias ke-jitbe
```

Enter keystore password → copy **SHA-1** and **SHA-256**.

### 6.3 Register both SHA-1 values

In Google Cloud → Credentials → **Android OAuth client**:

- Package name: `com.ctrend.app`
- SHA-1: add **debug** AND **release** fingerprints (two entries or two clients as Google UI allows)

Without **release SHA-1**, Google Sign-In works in debug but **fails in Play Store builds**.

---

## 7. Create a release signing key

Google Play requires all updates to be signed with the **same key forever**. If you lose it, you cannot update the existing listing.

### 7.1 Generate keystore (one time)

Run outside the repo (e.g. `~/secrets/`):

```bash
mkdir -p ~/secrets/ke-jitbe
cd ~/secrets/ke-jitbe

keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore ke-jitbe-release.keystore \
  -alias ke-jitbe \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass 'CHOOSE_A_STRONG_PASSWORD' \
  -keypass 'CHOOSE_A_STRONG_PASSWORD' \
  -dname "CN=Your Name, OU=Mobile, O=Ke Jitbe, L=City, ST=State, C=BD"
```

Replace passwords and `dname` with your details.

### 7.2 Back up securely

Store copies of:

- `ke-jitbe-release.keystore`
- Keystore password
- Key alias (`ke-jitbe`)
- Key password

Use a password manager + offline backup. **Do not commit** to git (`.gitignore` already blocks `*.keystore`).

### 7.3 Play App Signing (required for new apps)

New apps uploading an **AAB** use **Play App Signing** — it is effectively mandatory:

- You upload an AAB signed with your **upload key** (the keystore from §7.1).
- Google re-signs with the **app signing key** it holds, and distributes that to users.

Let Google **generate the app signing key on first upload** (simplest, recommended).
Your `keystore.properties` keystore is then your **upload key** — still back it up, because
losing it means you must reset the upload key with Google support before you can ship updates.

---

## 8. Wire signing into Gradle

> ✅ **The Gradle wiring is already done** in `mobile/android/app/build.gradle`. It
> reads `android/keystore.properties` and signs **release** with your release key
> when that file exists, falling back to the debug key for local builds when it
> doesn't. You only need to create the keystore (§7) and the properties file (§8.1).

### 8.1 Create `mobile/android/keystore.properties`

A committed template exists at **`mobile/android/keystore.properties.example`**. Copy it and fill in real values:

```bash
cp mobile/android/keystore.properties.example mobile/android/keystore.properties
# then edit mobile/android/keystore.properties
```

```properties
storeFile=/home/YOUR_USER/secrets/ke-jitbe/ke-jitbe-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=ke-jitbe
keyPassword=YOUR_KEY_PASSWORD
```

Use an **absolute path** to the keystore. `keystore.properties` is **gitignored** — never commit it.

### 8.2 How the wiring works (already in `build.gradle`)

For reference, the build file already contains:

```gradle
// before android { }
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
def hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

// inside signingConfigs { }
if (hasReleaseKeystore) {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}

// inside buildTypes.release { }
signingConfig hasReleaseKeystore ? signingConfigs.release : signingConfigs.debug
```

Nothing to edit here — just make sure `keystore.properties` exists before a Play build.

### 8.3 Verify signing

```bash
cd mobile/android
./gradlew signingReport
```

Confirm **release** variant shows your release keystore, not `debug.keystore`.

---

## 9. Version numbers

Edit `mobile/android/app/build.gradle` → `defaultConfig`:

```gradle
versionCode 1        // INTEGER — must increase every Play upload
versionName "1.0.0"  // Human-readable string on store
```

Also keep `mobile/app.json` in sync for Expo metadata:

```json
"version": "1.0.0"
```

| Field | Rule |
|-------|------|
| `versionCode` | Must be **greater** than any previous upload (1 → 2 → 3 …) |
| `versionName` | Any string users see (e.g. `1.0.1`, `1.1.0`) |

---

## 10. Build the release AAB

Google Play requires **AAB** (Android App Bundle), not APK, for new apps.

### 10.1 Pre-build checklist

- [ ] `mobile/.env` has production URLs
- [ ] `google-services.json` in `mobile/android/app/`
- [ ] Release keystore configured ([§8](#8-wire-signing-into-gradle))
- [ ] `versionCode` set correctly

### 10.2 Build commands

From repo root:

```bash
export TMPDIR=$HOME/tmp
mkdir -p $TMPDIR
export GRADLE_USER_HOME=$HOME/.gradle
export ANDROID_SDK_ROOT=$HOME/Android/Sdk

# Embed JS bundle with production env
cd mobile
set -a && source .env && set +a

# Optional: verify bundle step alone
npx expo export:embed --eager --platform android --dev false

# Build release AAB
cd android
./gradlew bundleRelease --no-daemon
```

Output file:

```
mobile/android/app/build/outputs/bundle/release/app-release.aab
```

### 10.3 Optional: release APK for sideload testing

```bash
cd mobile/android
./gradlew assembleRelease --no-daemon
# mobile/android/app/build/outputs/apk/release/app-release.apk
```

Install with:

```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## 11. Test the release build locally

On a physical phone (recommended):

1. Install release APK ([§10.3](#10.3-optional-release-apk-for-sideload-testing)).
2. **Cold start** — app opens without Metro/PC.
3. **Sign up / log in** (email + Google).
4. **Feed** loads posts from production API.
5. **Create post** with images.
6. **Vote**, comment, notifications bell.
7. **Messages** — send/receive (second account).
8. **Push notification** — background app, trigger notification from another account.
9. **Deep links** — notification tap opens correct screen.

Fix any crash before uploading to Play Console.

---

## 12. Create the app in Play Console

1. [Play Console](https://play.google.com/console) → **Create app**.
2. Fill in:

| Field | Suggested value |
|-------|-----------------|
| App name | Ke Jitbe |
| Default language | **English (United States)** — primary global listing; add Bengali or other locales later in **Store presence → Custom store listings** |
| App or game | App |
| Free or paid | Free |

3. Declarations: policies, **US export laws** (standard for worldwide apps), etc. → **Create app**.

### 12.1 Countries and regions (worldwide)

After the app is created:

1. **Release** → **Production** (or **Testing**) → **Countries / regions**.
2. For a **worldwide** launch, select **Add countries / regions** → choose **All countries** (or pick specific regions if you want a phased rollout).
3. Legal pages (`/privacy`, `/terms`) state that **CTrend** operates Ke Jitbe, published by **Abir Azim Badhon** (Bangladesh).
4. You remain responsible for local rules (age ratings, data safety answers, and any country-specific Play requirements). Google’s **Data safety** and **Content rating** forms apply globally to your listing.

You land on the app dashboard with a **Setup checklist** — complete every required item before production.

---

## 13. Store listing assets

**Main store listing** → fill all required fields.

### 13.1 Text

| Field | Max length | Tips |
|-------|------------|------|
| **Short description** | 80 chars | e.g. *Compare, vote, and vibe with friends worldwide on Ke Jitbe.* |
| **Full description** | 4000 chars | Global social app: side-by-side polls, feed, friends, chat, campaigns, notifications — English UI first |

### 13.2 Graphics

| Asset | Size | Source in repo |
|-------|------|----------------|
| **App icon** | 512×512 PNG | Export from `mobile/assets/icon.png` |
| **Feature graphic** | 1024×500 PNG | Create in Canva/Figma (brand colours `#312e81`) |
| **Phone screenshots** | Min 2, max 8 | Capture from Pixel 6: feed, create, post detail, profile, messages |

Capture screenshots:

```bash
adb exec-out screencap -p > screenshot-feed.png
```

Or use Android Studio **Device Manager → Screenshot**.

Recommended set (align with `web ui reference/`):

1. Home feed with campaign banner  
2. Create compare screen  
3. Post detail / voting results  
4. Profile  
5. Messages  
6. Notifications  

### 13.3 Categorisation

- **App category:** Social (or Entertainment — pick closest)
- **Tags:** optional keywords Google suggests

---

## 14. App content declarations

Complete every section under **Policy and programmes → App content**. Typical for Ke Jitbe:

### 14.1 Privacy policy

Paste your privacy policy URL.

### 14.2 App access

If login is required, provide **test credentials** for Google reviewers:

```
Email:    reviewer+jitbe@yourdomain.com
Password: (strong temp password)
```

Add instructions: *Sign in → Home feed → Create tab → Profile.*

### 14.3 Ads

Select **No, my app does not contain ads** (unless you add ads later).

### 14.4 Content rating

Start questionnaire (IARC):

- Violence, user-generated content, social features → answer honestly  
- Likely result: **Teen** or **Everyone** depending on UGC moderation

Submit and apply rating to the app.

### 14.5 Target audience

Select age groups aligned with your legal pages: **13+** minimum worldwide (higher where local law requires). For a global social app with UGC, do **not** target children under 13.

### 14.6 Data safety

Declare data collected:

| Data type | Likely collected? |
|-----------|-------------------|
| Email, name, user IDs | Yes |
| Photos (posts) | Yes |
| App activity (votes, posts) | Yes |
| Device IDs (push token) | Yes |

Mark whether data is shared, encrypted in transit, and if users can request deletion.

**Account / data deletion (Ke Jitbe):** select **Yes** — users email **`badhonkhanbk007@gmail.com`** (documented on `/privacy` and `/terms`). Deletion is not in-app yet.

### 14.7 Government apps / Financial / Health

Select **No** unless applicable.

### 14.8 News apps

Select **No** unless you are a news publisher.

---

## 15. Upload to Internal testing

Always test on **Internal testing** before production.

1. Play Console → **Testing → Internal testing**.
2. Click **Create new release**.
3. **Upload** `app-release.aab`.
4. **Release name:** `1.0.0 (1)` (match versionName/versionCode).
5. **Release notes:** e.g. *Initial internal test build.*
6. **Save** → **Review release** → **Start rollout to Internal testing**.

### 15.1 Add testers

1. **Testers** tab → create email list.
2. Add Gmail addresses of your team.
3. Copy the **opt-in URL** and open it on each tester's phone.
4. Accept invite → install from Play Store (internal track).

### 15.2 Closed testing release (required before production for new accounts)

1. Play Console → **Testing → Closed testing** (Alpha).
2. **Create new release** → upload `app-release.aab` from `./scripts/build-mobile-aab-release.sh`.
3. **Release name:** match `versionName (versionCode)` — e.g. `1.0.7 (8)`.
4. **Release notes** → **Save** → **Review release** → **Start rollout to Closed testing**.
5. **Testers** tab → email list → share opt-in URL:
   **https://play.google.com/apps/testing/com.ctrend.app**
6. After rollout: Admin app → **Force Android update** → set min `versionCode` to this release.

Public store listing (after production): **https://play.google.com/store/apps/details?id=com.ctrend.app**

---

## 16. Promote through tracks

### 16.1 For NEW personal developer accounts (likely you)

Accounts created **on/after 13 Nov 2023** must complete a **closed test** before Google
unlocks the Production track:

```
Internal testing   (you + team — instant, unlimited iterations)
       ↓
Closed testing     (REQUIRED — ≥20 testers opted-in for 14 continuous days)
       ↓
Apply for production access   (button appears after the 14-day test)
       ↓
Production         (public, after Google reviews your application)
```

**What "20 testers for 14 days" means in practice:**

1. **Testing → Closed testing → Create a track** (or use the default "Alpha").
2. Add an **email list of at least 20 Gmail addresses** under **Testers**, and have
   **each person actually opt in** via the test link **and keep the app installed**.
3. The 14-day clock counts **continuous opted-in testers** — if you drop below 20, it
   can reset. Recruit 25+ to have a buffer.
4. After 14 days Google shows **"Apply for production access"** on the dashboard.
   Fill in the questionnaire (who your testers are, what feedback you got).
5. Only then can you create a **Production** release.

> Start this **early** — it is the longest single wait in the whole process (longer
> than Google's review). Real testers (friends, family, teammates) are fine.

### 16.2 For older accounts (created before 13 Nov 2023)

You are exempt and can promote straight from Internal testing to Production:

```
Internal testing → (optional Closed/Open testing) → Production
```

To promote any release: open the tested release → **Promote release** → choose target track.

---

## 17. Submit for production review

1. Complete **all** dashboard checklist items (green checks).
2. **Production** → **Create new release**.
3. Upload the same (or newer) AAB with incremented `versionCode`.
4. Add release notes for users.
5. **Review release** → **Start rollout to Production**.

Review times:

- First app: often **1–7 days**
- Updates: often **hours to 3 days**

You'll get email for approval or requested changes.

---

## 18. Every future update

```bash
# 1. Bump versions (all three must match):
#    mobile/android/app/build.gradle  → versionCode + versionName
#    mobile/app.json                  → version + android.versionCode
#    packages/shared/src/lib/appUpdate.ts → BUNDLED_ANDROID_VERSION_CODE

# 2. Build release AAB + optional device APK (from repo root):
./scripts/build-mobile-aab-release.sh

# 3. Play Console → Testing → Closed testing → Create new release → upload AAB
#    Release name example: 1.0.7 (8)

# 4. Add "What's new" release notes → Save → Review → Start rollout

# 5. Force-update older installs (after rollout is live):
#    Admin app → Force Android update → set min versionCode to this release (e.g. 8)
#    Users below that code see a blocking popup with:
#      • https://play.google.com/store/apps/details?id=com.ctrend.app
#      • https://play.google.com/apps/testing/com.ctrend.app  (closed testers)
```

### 18.1 Closed testing links (Ke Jitbe)

| Track | URL |
|-------|-----|
| **Production listing** | https://play.google.com/store/apps/details?id=com.ctrend.app |
| **Closed testing opt-in** | https://play.google.com/apps/testing/com.ctrend.app |

Testers on the closed track install/update from Play after opting in. The in-app update
popup shows **both** links so production users and closed testers each have a path.

### 18.2 Force update (min Android version)

After each Play release:

1. Deploy backend with `platformSettings.minAndroidVersionCode` (if not already live).
2. Upload and roll out the new AAB on **Closed testing** (or Production).
3. In the **Admin** app → **Force Android update**, set the minimum `versionCode` to the
   new build (e.g. `8` for `1.0.7 (8)`).
4. Set `0` to disable force update.

Users on an older `versionCode` see a full-screen **Update required** dialog until they
update from Google Play.

Never decrease `versionCode`. Never lose the upload/release keystore.

---

## 19. Pre-submit checklist

### Build & signing

- [ ] `mobile/android/keystore.properties` created from `.example` (release key wired — §8)
- [ ] Release AAB signed with **release** keystore, not debug — confirm via `./gradlew signingReport`
- [ ] `versionCode` and `versionName` correct
- [ ] `mobile/.env` production values embedded (rebuilt after last change)
- [ ] `google-services.json` present for release build
- [ ] Release **SHA-1** in Firebase + Google Cloud Android OAuth client

### Functionality

- [ ] Login (email + Google) on release APK/AAB
- [ ] Feed, create, vote, comments, messages, notifications
- [ ] Push notifications when app backgrounded
- [ ] No debug-only URLs (`localhost`, Metro)

### Play Console

- [ ] Store listing text + icon + feature graphic + screenshots
- [ ] Privacy policy URL live
- [ ] Content rating completed
- [ ] Data safety form completed
- [ ] App access test account for reviewers (works on **production** backend)
- [ ] Internal testing passed on real device via Play opt-in link
- [ ] **(New personal accounts)** Closed test with **≥20 testers for 14 days** done + **production access granted** (§16.1)
- [ ] Privacy/Terms pages **deployed & publicly reachable** at `https://kejitbe.app/privacy` and `/terms`

### Security

- [ ] Keystore backed up offline
- [ ] `keystore.properties` and `.env` not in git
- [ ] No secrets in source code

---

## 20. Troubleshooting

### `Google Sign-In` fails only on Play build

→ Release SHA-1 missing in Google Cloud Android OAuth client. See [§6](#6-google-sign-in-release-sha-1).

### Push notifications never arrive

→ Check `google-services.json`, Firebase SHA-1, backend FCM config, and `POST_NOTIFICATIONS` permission on Android 13+.

### `Upload failed` / signing errors

→ AAB must be signed with upload key matching Play App Signing setup. Run `./gradlew signingReport`.

### Gradle OOM on your PC

→ Close Android Studio, use `./scripts/build-mobile-apk-safe.sh` settings (`org.gradle.daemon=false`, 8GB swap script).

### `Version code X has already been used`

→ Increment `versionCode` in `build.gradle` and rebuild.

### App rejected for login

→ Add valid **App access** credentials; verify test account works on production API.

### Backend unreachable from app

→ Confirm `EXPO_PUBLIC_GRAPHQL_HTTP` in `.env` before build; rebuild AAB after fixing.

---

## Optional: EAS Build (cloud)

If local Gradle is too heavy, you can use [Expo Application Services (EAS)](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas login
eas build:configure   # creates eas.json
eas build --platform android --profile production
```

EAS can manage credentials (keystore) in the cloud. This repo currently builds **locally** via Gradle; EAS is optional.

---

## Quick reference commands

```bash
# Debug install (development)
./scripts/build-mobile-apk-safe.sh

# Release AAB (Play Store upload)
cd mobile && set -a && source .env && set +a
cd android && ./gradlew bundleRelease --no-daemon

# SHA-1
cd mobile/android && ./gradlew signingReport

# Screenshot
adb exec-out screencap -p > screen.png
```

---

## Related docs in this repo

| File | Purpose |
|------|---------|
| [`README.md`](README.md) | Mobile dev setup |
| [`../MOBILE_PROGRESS.md`](../MOBILE_PROGRESS.md) | Feature parity tracker |
| [`../scripts/build-mobile-apk-safe.sh`](../scripts/build-mobile-apk-safe.sh) | Low-RAM debug build |
| [`../web ui reference/`](../web%20ui%20reference/) | Screenshot references for store listing |

---

*Last updated: 2026-06-05 — Ke Jitbe / `com.ctrend.app` / Expo SDK 56*
