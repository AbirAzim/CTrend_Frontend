# Ke Jitbe Android Play Store Publish + Update Guide (Bangla)

এই ডকুমেন্টে ২টা জিনিস বিস্তারিতভাবে আছে:

1. **প্রথমবার Google Play Store-এ অ্যাপ publish করা**
2. **পরবর্তী update/release publish করা**

---

## কস্টিং সারাংশ (আগে দেখে নিন)

> Google Play Console-এ publish করতে **সবচেয়ে গুরুত্বপূর্ণ fixed cost** হলো একবারের developer registration fee।

- **Google Play Console Developer Account**: এককালীন **USD 25** (সাধারণত কার্ড/ট্যাক্সসহ কিছুটা বেশি কাটা যেতে পারে)
- **App signing / AAB upload / update publish**: Google Play-এর দিক থেকে আলাদা fee নেই
- **Optional খরচ**:
  - Privacy policy hosting/domain (যদি নিজের domain লাগে)
  - UI assets (icon, feature graphic, screenshot design)
  - QA device/testing cost (নিজস্ব ডিভাইস না থাকলে)

---

## 0) Pre-check (publish-এর আগে baseline)

### কী নিশ্চিত করবেন
- Android app local device-এ install/run হচ্ছে
- Feed + login + Google login কাজ করছে
- Backend CORS-এ Android app থেকে request allow করা আছে
- App name, icon, splash final
- Package name final (পরবর্তীতে বদলালে নতুন app listing লাগতে পারে)

### কেন জরুরি
- Pre-check skip করলে publish-এর পরে crash/login failure/data fetch issue ধরা পড়ে

### কস্টিং
- **Mandatory direct cost**: নেই
- **Optional**: QA/testing device/internet/logging tools

---

## 1) Release keystore তৈরি (শুধু একবার)

> সবচেয়ে critical step। **এই keystore হারালে একই Play listing-এ update দিতে বড় সমস্যা হবে।**

### কমান্ড
```bash
keytool -genkey -v \
  -keystore kejitbe-release.keystore \
  -alias kejitbe \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### এরপর যা করবেন
- `kejitbe-release.keystore` repo-র বাইরে secure জায়গায় রাখুন
- password + alias password password manager-এ রাখুন
- অন্তত 2 জায়গায় backup রাখুন (encrypted cloud + offline storage)

### কস্টিং
- **Direct cost**: নেই
- **Optional**: password manager subscription / secure backup storage

---

## 2) `keystore.properties` সেটআপ (recommended)

`android/keystore.properties` ফাইল বানান (git-এ push করবেন না):

```properties
storeFile=/absolute/path/to/kejitbe-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=kejitbe
keyPassword=YOUR_KEY_PASSWORD
```

`android/app/build.gradle`-এ release signing config আছে কিনা নিশ্চিত করুন।

### সিকিউরিটি নোট
- `keystore.properties` + `.keystore` ফাইল কখনও public repo-তে তুলবেন না
- `.gitignore`-এ `android/keystore.properties` ও `*.keystore` আছে কিনা দেখুন

### কস্টিং
- **Direct cost**: নেই

---

## 3) Versioning rules (mandatory for every release)

`android/app/build.gradle`:

- `versionCode` = প্রতি release-এ **অবশ্যই +1**
- `versionName` = human-readable version (`1.0.0`, `1.0.1`, ...)

উদাহরণ:

```gradle
versionCode 2
versionName "1.0.1"
```

### Common error
- `versionCode` আগেরটার সমান থাকলে Play Console upload reject করবে

### কস্টিং
- **Direct cost**: নেই

---

## 4) Production env + web build + capacitor sync

Project root থেকে চালান:

```bash
cd /Users/abirazimbadhon/Documents/code/CTrend_frontend
npm run build
npx cap sync android
```

### কী হচ্ছে এখানে
- `npm run build` -> production web assets তৈরি
- `npx cap sync android` -> নতুন web assets + plugins Android project-এ sync

### কস্টিং
- **Direct cost**: নেই
- **Optional**: CI/CD runner বা paid build infrastructure

---

## 5) Release AAB build (Play Store-এর জন্য)

```bash
cd android
./gradlew bundleRelease
```

Output path:

`android/app/build/outputs/bundle/release/app-release.aab`

### কেন AAB
- Play Store এখন APK-এর চেয়ে AAB prefer/require করে (dynamic delivery সুবিধা)

### যদি build fail করে
- Java/Android SDK version check করুন
- signing config/keystore path check করুন
- `versionCode`/gradle sync error log দেখুন

### কস্টিং
- **Direct cost**: নেই

---

## 6) Google Play Console account + app setup (first time)

1. [Play Console](https://play.google.com/console) এ login
2. Developer account না থাকলে create করুন
3. **One-time developer registration fee: USD 25** pay করুন
4. **Create app** করুন
5. Store listing পূরণ করুন:
   - App name: `Ke Jitbe`
   - Short description
   - Full description
   - Icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (phone, কমপক্ষে 2+)
6. Privacy policy URL দিন
7. Content rating questionnaire পূরণ করুন
8. Data safety + App content policies পূরণ করুন
9. Internal testing track configure করুন

### কস্টিং
- **Mandatory**: Google Play developer fee **USD 25 (one-time)**
- **Optional**:
  - asset design cost
  - privacy policy hosting/domain
  - legal/policy consultation (যদি প্রয়োজন হয়)

---

## 7) প্রথম release upload (Internal testing -> Production)

Play Console flow:

1. **Testing > Internal testing**
2. **Create new release**
3. `app-release.aab` upload
4. Release notes লিখুন
5. Save -> Review -> Rollout to internal
6. Internal testing pass হলে stage-wise এগোন:
   - Internal -> Closed -> Open -> Production

### কেন staged rollout
- crash বা login issue থাকলে limited user-এ ধরা পড়ে
- full production impact কমে

### কস্টিং
- **Direct cost**: নেই
- **Optional**: টেস্টার incentive/QA পরিচালনা খরচ

---

## 8) পরের সব update release workflow

প্রতি update-এ same pattern follow করুন:

1. Code change শেষ করুন
2. `versionCode` +1 এবং `versionName` update করুন
3. Build + sync:
   ```bash
   npm run build
   npx cap sync android
   ```
4. নতুন AAB build:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
5. Play Console -> existing app -> Create new release
6. নতুন AAB upload
7. Release notes -> review -> rollout

> Update কাজ করতে **same package name + same release keystore** রাখতে হবে।

### কস্টিং
- **Google Play update fee**: নেই
- **Optional**: QA/monitoring/bugfix operations cost

---

## 9) Google Login update checklist (খুব গুরুত্বপূর্ণ)

Google sign-in stable রাখতে:

- Google Cloud Console-এ Android OAuth client-এ package: `com.ctrend.app`
- Debug SHA-1 add (dev/testing)
- Release SHA-1 add (production signing)
- `.env.production`/env-এ Web client ID (`VITE_GOOGLE_CLIENT_ID`) ঠিক আছে
- Play App Signing certificate fingerprint লাগলে সেটাও verify করুন

### Common issue
- SHA mismatch হলে production-এ Google login fail করতে পারে

### কস্টিং
- **Direct cost**: নেই

---

## 10) Release-এর আগে final checklist (প্রতি বার)

- [ ] `versionCode` incremented
- [ ] `versionName` updated
- [ ] `npm run build` success
- [ ] `npx cap sync android` success
- [ ] `./gradlew bundleRelease` success
- [ ] `app-release.aab` generated
- [ ] Same keystore used as previous release
- [ ] Feed/login/Google login smoke test done
- [ ] Play Console release notes written
- [ ] Data safety/policy impact check (feature change হলে)

### কস্টিং
- **Direct cost**: নেই
- **Optional**: regression testing time/device cost

---

## Quick command block (copy-paste)

```bash
cd /Users/abirazimbadhon/Documents/code/CTrend_frontend
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

---

## Recommended budget planning (practical)

- **One-time mandatory**: USD 25 (Play Console developer registration)
- **Per release mandatory**: USD 0 (Google Play side)
- **Real-world monthly optional budget**:
  - QA/testing: project অনুযায়ী
  - asset update/design: প্রয়োজন অনুযায়ী
  - privacy policy hosting/domain: provider অনুযায়ী

এভাবে plan করলে বুঝতে সুবিধা হবে: Play Store update নিজে free, কিন্তু quality release maintain করতে operational cost থাকতে পারে।

