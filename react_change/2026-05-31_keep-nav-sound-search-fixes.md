# Keep Nav Fix, Notification Sound Boost, Suggestions Search & Admin Inclusion

**Date:** 2026-05-31
**Web files changed:**
- `src/layouts/AppShell.tsx`
- `src/pages/ProfilePage.tsx`
- `src/lib/notificationSound.ts`
- `src/graphql/friends.ts`

**Backend files changed:**
- `src/follows/follows.resolver.ts`
- `src/follows/follows.service.ts`

## What changed

### 1. Keep nav button fixed
The bottom-nav Keep icon was linking to `/profile?view=keeps#saved-posts` which triggered a now-unused early-return code path in `ProfilePage`. The page rendered a stripped-down view that no longer matched the redesigned tabbed profile.

**Fix:**
- `AppShell` nav: `to="/profile?tab=kept"` (clean URL, no hash)
- `ProfilePage`: reads `tab` query param on mount AND on URL changes — if `tab=kept`, sets `profileContentTab` to `"kept"`. If `tab=drops`, sets it to `"drops"`. Works both on cold navigation and when clicking the Keep icon while already on `/profile`.
- Deleted the stale `keepsOnlyView` early-return block (~40 lines) and the orphaned `useEffect` that scrolled to `#saved-posts`.

### 2. Notification sound — louder and more distinct
The existing `playNotificationChime` had a peak gain of 0.2 (very quiet) with two sine tones. Boosted to:
- Three-note ascending arpeggio: A5 → E6 → A6 (880 → 1320 → 1760 Hz)
- Peak gains: 0.38 / 0.42 / 0.36 (≈2× louder)
- Total duration ≈500 ms (was 360 ms) — easier to hear over ambient noise

The chime was already wired in `NotificationContext.useSubscription.onData` so this fix flows through to every non-MESSAGE notification automatically. The Web Audio context warm-up handlers (click, touch, keydown, pointerdown, visibilitychange) keep the AudioContext "running" so the sound plays even when the tab regains focus.

### 3. Image compression to ≤400 KB — **already implemented**
Verified the backend `UploadsController.uploadImage` route at `POST /uploads/image` already pipes every upload through `UploadsService.compressImage()`, which:
- Rejects GIFs > 400 KB (lossless format, no in-place compress option)
- Iteratively tries WebP at quality levels 82 → 70 → 58 → 46 → 34 → 22
- If still over 400 KB, resizes to max 1280×1280 (longest side) and retries with quality 75 → 60 → 45 → 30
- Throws "Image could not be compressed below 400 KB" only if every strategy fails (extremely rare)
- Returns `{ publicUrl, key }` from R2

All frontend image uploads (profile avatar, post creation, edit post) use `useImageUpload` → POST `/uploads/image`, so they're all already compressed. **No code change needed.**

### 4. Suggestions: server-side search + admin inclusion
**Backend:**
- `friendSuggestions(limit, search?)` now accepts an optional `search: String` arg.
- Role filter expanded to include **anyone with role `admin` OR `user`** (in `roles` array OR legacy `role` field). Pure admin accounts now appear in suggestions per spec.
- Search: case-insensitive regex match across `displayName`, `username`, `email`. Regex is escaped to prevent injection.

**Frontend:**
- `FRIEND_SUGGESTIONS` GraphQL query updated with `$search: String` variable.
- `ProfilePage`: added `suggestionsSearchQuery` state, debounced 300 ms from `connectionsSearch` whenever the Suggestions tab is active. Triggers a fresh server-side query on each new search.
- Bumped default `limit` from 10 → 50 so the suggestion list shows more by default.
- Search query is cleared when leaving the Suggestions tab so the cached default 50 stays warm.

## Mobile implementation instructions

### Keep nav
On mobile, the equivalent bottom-nav Keep button should navigate to `Profile` with `params.tab = "kept"`, and `ProfileScreen` should default the content tab via React Navigation's `useFocusEffect` / `useRoute().params?.tab`.

### Notification sound
React Native should use `expo-av` or `react-native-sound` with a short notification audio asset. The bell subscription handler already triggers when a non-MESSAGE notification arrives — just wire that to `Audio.Sound.playAsync(notificationSound)`.

### Image compression
The mobile uploader already targets the same `/uploads/image` endpoint, so it inherits the same 400 KB compression server-side.

### Suggestions search
Mobile `useQuery(FRIEND_SUGGESTIONS, { variables: { limit, search } })` with a 300 ms debounced state, same pattern as web.

## Notes / gotchas
- **Server-side search bypasses client-side filtering on Suggestions tab.** The client-side `matchesSearch` filter is harmless — it produces the same result on the already-filtered server response — but is functionally a no-op now.
- **Backend type-checks clean** with `npx tsc --noEmit`.
- **The Web Audio warm-up handlers** in `notificationSound.ts` are the reason the chime works even when the tab is in the background. If users still report no sound, check: (a) system volume not muted, (b) browser tab permission for audio, (c) inspect `_ctx.state` in console — should be "running".
- **Search excludes ALL users with any follow doc** (friends + pending requests in either direction) by design. If a user has a pending request, they show up in the Requests tab, not Suggestions. Searching "abir" while "Abir" has a pending request from me will yield no result in Suggestions — by design.
