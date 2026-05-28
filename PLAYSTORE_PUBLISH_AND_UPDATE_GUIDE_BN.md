# Ke Jitbe Android Play Store Guide (Bangla)

এই গাইডে ২টা জিনিস আছে:

1. **প্রথমবার Play Store-এ অ্যাপ publish করা**
2. **পরের ভার্সন/আপডেট কীভাবে publish করবেন**

---

## 0) Pre-check (একবার নিশ্চিত করুন)

- Android app build/run হচ্ছে
- Feed + login + Google login কাজ করছে
- Backend CORS-এ Android origin allow করা আছে
- App name, icon, splash ঠিক আছে

---

## 1) Release keystore তৈরি (শুধু একবার)

> এটা সবচেয়ে গুরুত্বপূর্ণ। **এই keystore হারালে একই app listing-এ update দিতে পারবেন না।**

```bash
keytool -genkey -v \
  -keystore kejitbe-release.keystore \
  -alias kejitbe \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

তারপর:
- `kejitbe-release.keystore` secure জায়গায় রাখুন (repo-র বাইরে)
- password/alias safely store করুন (password manager)

---

## 2) `keystore.properties` ব্যবহার (recommended)

`android/keystore.properties` (git-এ না তোলা ভালো):

```properties
storeFile=/absolute/path/to/kejitbe-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=kejitbe
keyPassword=YOUR_KEY_PASSWORD
```

`android/app/build.gradle`-এ release signing config যোগ করুন (যদি আগে না থাকে)।

---

## 3) Version update rules (mandatory)

`android/app/build.gradle` এ:

- `versionCode` = **প্রতি release-এ অবশ্যই +1**
- `versionName` = readable version (`1.0.0`, `1.0.1`, etc.)

উদাহরণ:

```gradle
versionCode 2
versionName "1.0.1"
```

---

## 4) Production env + build + sync

Project root থেকে:

```bash
cd /home/badhon/Documents/projects/CTrend_Frontend
npm run build
npx cap sync android
```

---

## 5) Release AAB build

টার্মিনাল থেকে:

```bash
cd android
./gradlew bundleRelease
```

output:

`android/app/build/outputs/bundle/release/app-release.aab`

---

## 6) Google Play Console-এ প্রথমবার publish

1. [Play Console](https://play.google.com/console) এ login
2. **Create app**
3. Store listing পূরণ করুন:
   - App name: `Ke Jitbe`
   - Short description
   - Full description
   - Icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (কমপক্ষে 2)
4. Privacy policy URL দিন
5. Content rating questionnaire পূরণ করুন
6. App content policies (data safety ইত্যাদি) পূরণ করুন
7. **Internal testing** track-এ প্রথম release দিন (production-এর আগে)

---

## 7) AAB upload + release create

Play Console:

1. **Testing > Internal testing**
2. **Create new release**
3. `app-release.aab` upload
4. Release notes লিখুন
5. Save > Review > Rollout

তারপর test pass হলে:
- Internal -> Closed -> Open -> Production

---

## 8) Update release workflow (পরের বার থেকে)

প্রতি update-এ একই flow:

1. code change
2. `versionCode` +1, `versionName` update
3. build/sync:
   ```bash
   npm run build
   npx cap sync android
   ```
4. নতুন AAB:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
5. Play Console-এ existing app-এ **Create new release**
6. নতুন AAB upload
7. rollout

> **Update কাজ করতে একই package name + একই release keystore ব্যবহার করতে হবে।**

---

## 9) Google Login update checklist

Google sign-in future-proof রাখতে:

- Google Cloud Console-এ Android OAuth client এ package `com.ctrend.app`
- debug SHA-1 (dev testing)
- release SHA-1 (play প্রকাশের আগে/পরে)
- `.env.production` এ Web client ID (`VITE_GOOGLE_CLIENT_ID`) ঠিক আছে

---

## 10) Final checklist before every release

- [ ] `versionCode` incremented
- [ ] `versionName` updated
- [ ] `npm run build` success
- [ ] `npx cap sync android` success
- [ ] `./gradlew bundleRelease` success
- [ ] `app-release.aab` generated
- [ ] keyystore same as previous release
- [ ] Feed/login/Google login smoke test done
- [ ] Play Console release notes written

---

## Quick command block (copy-paste)

```bash
cd /home/badhon/Documents/projects/CTrend_Frontend
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

