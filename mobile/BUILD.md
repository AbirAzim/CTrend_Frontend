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

### Method 2 — `npm run device` (Gradle debug APK + adb install)

From `mobile/`:

```bash
npm run device
```

Runs `assembleDebug` then `adb install -r` on the connected device. Good when you don't need Metro attached and want the same standalone debug APK the release pipeline uses. Cold build ~8–9 min; incremental faster.

### Method 3 — safe build script (low-RAM / clean rebuild)

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
versionCode 39          ← increment by 1
versionName "1.11.1"   ← bump semver (major.minor.patch)
```

**`mobile/app.json`**
```json
"version": "1.11.1",
"android": {
  "versionCode": 39
}
```

**`packages/shared/src/lib/appUpdate.ts`**
```ts
export const BUNDLED_ANDROID_VERSION_CODE = 39;
```

> All three must have the **same** versionCode. The build script checks this and exits immediately if they don't match. If the numbers drifted (happens when builds are done on different machines), set all three to the same value before building.

Current version after 1.16.5 release: **versionCode 50** across all three files.

---

### Step 1.5 — Enable R8/minify (MUST for the next build)

Play Console flagged this on the 1.16.5 (50) upload:

> ⚠️ **1 Warning — 1 message for version code 50**
> There is no deobfuscation file associated with this App Bundle. If you use obfuscated
> code (R8/proguard), uploading a deobfuscation file will make crashes and ANRs easier
> to analyze and debug. Using R8/proguard can help reduce app size.

`minifyEnabled`/R8 is currently **off** (`android.enableMinifyInReleaseBuilds` isn't set in `mobile/android/gradle.properties`, so it falls back to `false` in `app/build.gradle`). Turn it on for the next release:

**`mobile/android/gradle.properties`** — add:
```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

Then rebuild with `./scripts/build-mobile-aab-release.sh` as usual — `bundleRelease` will now run R8 and produce a `mapping.txt` deobfuscation file at:
```
mobile/android/app/build/outputs/mapping/release/mapping.txt
```
Upload this alongside the AAB in Play Console (**Create release → App bundle → Upload deobfuscation file**, or it may prompt automatically) — this silences the warning and makes future crash reports readable.

**Test the release APK carefully after enabling this** — R8 can occasionally strip something needed at runtime (reflection-based code, dynamically-referenced classes) if `proguard-rules.pro` is missing a `-keep` rule for it. Do a full manual pass (login, feed, create post, chat, World Cup) on the release build before uploading, since this project skipped R8 for 1.16.4/1.16.5 specifically to isolate this risk from those releases.

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
| 1.16.5 | 50 | 2026-07-04 | Same fixes as 1.16.4 (superseded — bundled image assets losslessly recompressed ~23% smaller, addressing Play Console's bitmap optimization recommendation); requires a new Android OAuth client in Google Cloud Console for the release-key SHA-1 for Google Sign-In to work on this signed build |
| 1.16.4 | 49 | 2026-07-04 | "My Activity" pagination reliability + scroll/footer smoothness fixes; World Cup match details live score/minute/stats fixes; penalty shootout premature-winner fix; duplicate match-event cleanup |
| 1.16.3 | 48 | 2026-07-03 | Crisp light-theme header wordmark (Caveat vector text); guest feed Log in top-right + scroll tagline animation; light header polish |
| 1.16.2 | 47 | — | (unreleased) Light-theme header + guest feed fixes — superseded by 1.16.3 |
| 1.16.1 | 46 | 2026-07-02 | Feed infinite scroll prefetch — next page loads before you reach the bottom (matches web); includes all 1.16.0 features |
| 1.16.0 | 45 | 2026-07-01 | Stacked compare layout when creating posts; refreshed Ke Jitbe header with scroll-aware tagline; feed top bar + filter chrome polish; profile rewards & search UI improvements |
| 1.15.0 | 44 | 2026-07-01 | Profile rewards 3-column layout + podium badges on mobile; Android 15 edge-to-edge (`react-native-edge-to-edge`, `SystemBars`); World Cup campaign rules refresh (tiered prizes, draw/score-prediction rules — backend) |
| 1.14.0 | 43 | 2026-06-30 | Feed/match UX polish — campaign chip, knockout round + anonymous vote row, prediction winners CTA, penalty shootout overview, pens on feed cards |
| 1.13.0 | 42 | 2026-06-29 | World Cup knockout road map (in-app rotate fix), 3-item compare overlay parity, bracket live updates |
| 1.12.1 | 41 | 2026-06-28 | Prediction score input polish (visible boxes, focus, Cancel button), includes all 1.12.0 live match UX |
| 1.12.0 | 40 | 2026-06-27 | Live match scoreboard UI, knockout ET/pen scores, prediction UX, splash/sound launch fixes, Best Player So Far label |
| 1.11.1 | 39 | 2026-06-27 | Chat composer redesign, animated send button, Gboard GIF/emoji keyboard support, image attach fixes |
| 1.11.0 | 38 | 2026-06-27 | Admin overview redesign (stats, charts, online users), platform settings UX, notifications page, profile/rewards polish |
| 1.10.0 | 37 | 2026-06-26 | Referral admin toggle, leaderboard rank on profile, notification fixes (background + no duplicates), branded splash, rewards UI polish, launch sound fix |
| 1.9.0 | 36 | 2026-06-25 | Compact compare cells for 5–6 image posts, silent sound option, announcement edit fix |
| 1.8.0 | 35 | — | World Cup tab, campaign features |

### Play Console copy — 1.16.5 (50)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.5 — My Activity & live match fixes
```

**What's new** (user-facing release notes)
```
• Faster, more reliable "My Activity" page — fixed pagination sometimes getting stuck, smoother scrolling

• Fixed live match scores, timers, and stats not updating correctly on match details

• Fixed penalty shootouts showing a winner before the shootout was finished

• Cleaned up duplicate entries in the match events timeline

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Same app changes as 1.16.4 (never rolled out). Adds: bundled PNG assets losslessly
recompressed with oxipng (~23% smaller, addresses Play Console bitmap-optimization
recommendation). Requires a second Android OAuth client (same package name, release-key
SHA-1: B0:77:73:F8:4C:06:A1:0D:0B:FE:5A:E8:7B:14:5E:0E:6A:9C:3D:71) in Google Cloud
Console for Google Sign-In to work on this signed build — debug SHA-1 client is unchanged.
```

### Play Console copy — 1.16.4 (49)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.4 — My Activity & live match fixes
```

**What's new** (user-facing release notes)
```
• Faster, more reliable "My Activity" page — fixed pagination sometimes getting stuck, smoother scrolling

• Fixed live match scores, timers, and stats not updating correctly on match details

• Fixed penalty shootouts showing a winner before the shootout was finished

• Cleaned up duplicate entries in the match events timeline

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Apollo cache keyArgs fix for mySavedPosts/myScheduledPosts pagination collisions with
standalone Keeps/Scheduled screens. FixtureGql keyFields:false to stop background list
polls clobbering the open match detail query. knockoutMainDisplayScore flat home/away
shim fix (was always showing 0-0 live). Penalty shootout winner now gated on FINISHED
status. New Post index (createdBy, status, createdAt) for My Activity query performance.
```

### Play Console copy — 1.16.3 (48)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.3 — Crisp header & guest feed polish
```

**What's new** (user-facing release notes)
```
• Sharper header on light theme — the Ke Jitbe logo is smooth, solid, and easy to read on white backgrounds

• Guest feed polish — Log in sits neatly on the top right when you're not signed in

• Smoother home feed header — the tagline animates on scroll whether you're logged in or not

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Light-theme HeaderWordmark: Caveat vector text (web + mobile), replaces low-res PNG filter/tint.
FeedTopBar guest CTA spacer + unified Animated tagline collapse. @expo-google-fonts/caveat.
Includes 1.16.1 feed prefetch.
```

### Play Console copy — 1.16.2 (47)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.2 — Header polish & guest feed fixes
```

**What's new** (user-facing release notes)
```
• Clearer header on light theme — the Ke Jitbe logo is easier to read on white backgrounds

• Guest feed polish — Log in sits neatly on the top right when you're not signed in

• Smoother home feed header — the tagline animates on scroll whether you're logged in or not

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Light-theme header: indigo wordmark tint (web CSS filter + mobile tintColor), simplified
brand bar/tag colors. FeedTopBar: flex spacer + marginLeft auto for guest Log in CTA;
unified Animated tagline collapse for logged-out users. Includes 1.16.1 feed prefetch.
```

### Play Console copy — 1.16.1 (46)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.1 — Smoother feed scrolling
```

**What's new** (user-facing release notes)
```
• Faster feed scrolling — the next posts load before you reach the bottom, so you rarely wait at the end of the list

• Create stacked compares — choose Stacked layout when posting so images show full-width, one above the other

• Refreshed feed header — new Ke Jitbe branding with scroll-aware tagline on the home feed

• Feed polish — cleaner top bar, search pill, and filter bar when scrolling

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Feed prefetch parity with web: auto-fetch page 2 after page 1, onViewableItemsChanged
(PREFETCH_ITEMS_AHEAD=8), onEndReachedThreshold=3, drawDistance=1600. Includes 1.16.0
stacked compare layout, FeedTopBar, profile/search polish.
```

### Play Console copy — 1.16.0 (45)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.16.0 — Stacked compares & feed polish
```

**What's new** (user-facing release notes)
```
• Create stacked compares — choose Stacked layout when posting so images show full-width, one above the other (great for landscape photos)

• Refreshed feed header — new Ke Jitbe branding with a smoother scroll experience on the home feed

• Feed polish — cleaner top bar, search pill, and filter bar when scrolling

• Profile rewards and search UI improvements

• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
CompareLayout STACKED/SIDE_BY_SIDE on create/edit (16:9 crop for stacked binary).
FeedTopBar scroll-linked tagline + FeedNavSearch. Feed filter chrome Reanimated fixes.
ProfileEngagementPanel + MonthlyPodiumBadge polish. Header logo/branding refresh.
```

### Play Console copy — 1.15.0 (44)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.15.0 — Profile rewards & Android 15 polish
```

**What's new** (user-facing release notes)
```
• Profile rewards — Coins, Wins, and Referral cards now sit side-by-side on all screen sizes, matching the web layout. Monthly podium badges (🥇🥈🥉) are easier to read on mobile.

• World Cup Fever 2026 — Updated campaign rules: tiered bKash prizes (100–1,000 BDT), correct draw/outcome eligibility, and score-prediction priority in the prize draw.

• Android 15 ready — Improved edge-to-edge display using modern system bar APIs (addresses Play Console recommendations).

• General stability and UI polish across the profile and feed.
```

**Short description** (optional internal note for reviewers — not shown to users)
```
ProfileEngagementPanel 3-column grid parity with web; MonthlyPodiumBadge grid layout.
react-native-edge-to-edge + SystemBars (replaces expo-status-bar); Theme.EdgeToEdge.Material3
in styles.xml. Backend: World Cup campaign rules/prizes seed (tiered BDT, draw + prediction
priority text). Requires backend restart for campaign rule text in API.
```

### Play Console copy — 1.14.0 (43)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.14.0 (43)
```

**What's new** (user-facing release notes)
```
• Cleaner feed cards — collapsible campaign tag, knockout round badge beside anonymous voting
• Match predictions — clearer “View prediction winners” button and less clutter during extra time
• Penalty shootouts — see who scored or missed on the match details screen; pens result on feed cards
• Coin leaderboard fairness — platform admins no longer appear on the public engagement rankings
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
PostCampaignBadge collapsible chip parity. Round-of-32 + anonymous vote meta row. Prediction
winners crown CTA. PenaltyShootoutSection on match detail. Feed pens subline. Removed ET vote
banner and prediction hint noise. Backend: exclude admins from coinLeaderboard.
```

### Play Console copy — 1.13.0 (42)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.13.0 (42)
```

**What's new** (user-facing release notes)
```
• World Cup knockout road map — full bracket from Round of 32 to the Final with live score updates
• Rotate the bracket in-app for a wider landscape view without turning your phone
• 3-image compare posts now show the same clean vote overlay as 2-image posts
• Bracket fills the screen correctly after rotate; pinch to zoom and drag to pan
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
World Cup knockout bracket screen + in-app rotation centering fix (BracketZoomViewport absolute
positioning). Mobile 3-item compare slim overlay (binaryOverlay parity). Bracket placeholder
fixtures, adaptive polling, projected winners. Road map tab entry.
```

### Play Console copy — 1.12.1 (41)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.12.1 (41)
```

**What's new** (user-facing release notes)
```
• Live match scoreboard — clearer scores, animated Match center, and knockout extra-time/penalty results
• Easier match predictions — visible score boxes, clearer team names, and a proper Cancel button when editing
• Match details show "Best Player So Far" during live games; Man of the Match after full time
• Smoother app launch — no white flash on startup and quieter open experience
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Includes 1.12.0 World Cup live UX plus prediction polish: scoreBox card styling, focus states,
middle score separator, larger Cancel pill, compact inline predict row. LiveMatchPanel, ET/pen
scores, matchTopPlayerLabel, splash gate, notification sound gate on cold start.
```

### Play Console copy — 1.12.0 (40)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.12.0 (40)
```

**What's new** (user-facing release notes)
```
• Live match scoreboard — clearer scores, animated Match center, and knockout extra-time/penalty results
• Smarter match predictions — cleaner score entry and full team names on posts
• Match details show "Best Player So Far" during live games; Man of the Match after full time
• Smoother app launch — no white flash on startup and quieter open experience
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
World Cup live UX: LiveMatchPanel scoreboard, violet live card border, ET/pen score display,
MatchPrediction inline layout + empty score placeholders, matchTopPlayerLabel for live vs FT,
splash gate + dark stack backgrounds, notification sound gate on cold start.
```

### Play Console copy — 1.11.1 (39)

Use when creating the closed-testing (or production) release in Play Console.

**Release name**
```
1.11.1 (39)
```

**What's new** (user-facing release notes)
```
• Redesigned chat composer — cleaner message box and animated send button
• Send GIFs from your keyboard (Gboard) or attach from gallery
• Emoji picker fixes — tap emoji once, send reliably
• Admin chat gets the same messaging improvements
• Bug fixes and stability improvements
```

**Short description** (optional internal note for reviewers — not shown to users)
```
Chat UX release: ChatComposer pill UI, AnimatedSendButton, expo-paste-input + RN patch for
Gboard GIF commitContent, emoji textRef sync fix, presigned GIF upload MIME fix.
```

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
| Enable `minifyEnabled` (R8) — **required for the build after 1.16.5** | See [Step 1.5](#step-15--enable-r8minify-must-for-the-next-build). Play flagged the missing deobfuscation file on 1.16.5 (50); reduces AAB size too |
| `build-mobile-aab-release.sh` uses `grep -E` not `grep -P` | macOS BSD grep has no `-P` flag — PCRE patterns will break on Mac, use `-E` |
| Use `react-native-edge-to-edge` + `SystemBars` for status/nav bar styling on Android | `expo-status-bar` uses deprecated edge-to-edge APIs on Android 15+; Play Console may flag it |
| `AppTheme` parent must be `Theme.EdgeToEdge.Material3` (no `statusBarColor` / `navigationBarColor` in `styles.xml`) | Deprecated theme attrs trigger Play Console edge-to-edge warnings |

---

## Android edge-to-edge (Android 15+)

Google Play may recommend: *"Your app uses deprecated APIs or parameters for edge-to-edge"* when targeting API 35+.

**What we use (since 1.15.0):**

| Piece | Location |
|-------|----------|
| `react-native-edge-to-edge` dependency | `mobile/package.json` |
| Expo config plugin | `mobile/app.json` → `plugins` → `react-native-edge-to-edge` with `parentTheme: Material3`, `enforceNavigationBarContrast: false` |
| Native theme | `mobile/android/app/src/main/res/values/styles.xml` → `AppTheme` parent `Theme.EdgeToEdge.Material3` (no manual `android:statusBarColor` / `android:navigationBarColor`) |
| JS system bars | `mobile/app/_layout.tsx` → `<SystemBars style={{ statusBar, navigationBar }} />` (replaces `expo-status-bar`) |
| RN Gradle flag | `mobile/android/gradle.properties` → `edgeToEdgeEnabled=true` |
| Themed root background | `ThemedRoot` in `_layout.tsx` — paints `colors.bg` so the nav bar area isn't white on dark theme |

**Removed:** direct `expo-status-bar` dependency (was wrapping RN `StatusBar` with deprecated Android APIs).

After changing theme/plugin config, rebuild native (`npm run device` or `bundleRelease`) — JS-only reload is not enough.

---

## Quick reference

```bash
# Debug install on Pixel 6 (from mobile/) — Gradle + adb
npm run device
# equivalent: npm run apk && npm run adb-install

# Debug install — expo run (from mobile/)
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
| Current version | 1.16.5 (versionCode 50) |

---

*For Play Store listing, assets, legal, and track promotion — see [`GOOGLE_PLAY_STORE_GUIDE.md`](GOOGLE_PLAY_STORE_GUIDE.md).*
