# Profile — Persistent Cache Bump + Skeleton Loader for Drops

**Date:** 2026-05-31
**Web files changed:**
- `src/lib/apolloClient.ts`
- `src/pages/ProfilePage.tsx`
- `src/index.css`

## What changed on web

### 1. Persistent cache cap: 1 MB → 5 MB
`apollo3-cache-persist` was capped at 1 MB. Drops (USER_POSTS) + saved posts (MY_SAVED_POSTS) include full image URLs, votes, options, comments, etc. — easy to exceed 1 MB with a few dozen posts. When the cap is hit, `apollo3-cache-persist` evicts the oldest cached queries, so drops can disappear from cache between page refreshes.

Bumped to 5 MB. Still well within localStorage's typical 5–10 MB per-origin limit, but big enough that drops and saved posts won't get evicted by routine activity.

### 2. Skeleton loader for drops on cold load
Old: `"Loading your compares…"` text — bare, jarring, page looks empty for 200–800 ms.

New: 3 fake `cx-drop-item` rows with shimmering `cx-skeleton` placeholders for the thumbnails and text. This is only shown when `postsLoading && gridPosts.length === 0` — so on the second visit (cache hit), the real list renders immediately with no skeleton flash.

CSS classes:
- `.cx-skeleton` — animated gradient pulse (1.2s loop)
- `.cx-skeleton-line` — text-line variant
- `.cx-drop-list--skeleton` — wraps the fake rows; suppresses `background-image` on thumbs

### How drops loading works now
1. **First-ever load** (no cache): skeleton flickers for the network round-trip, then real data renders.
2. **Cache-warm load**: real data renders instantly from `apollo3-cache-persist`-backed `InMemoryCache`. Background refetch happens silently via `fetchPolicy: "cache-and-network"`.
3. **Subsequent navigations to /profile in the same session**: `nextFetchPolicy: "cache-first"` returns from memory cache without even firing a background fetch.

## Mobile implementation instructions

1. If using `apollo3-cache-persist` (or `@apollo/client3` cache persist on RN), bump the cap to 5 MB.
2. Replace any "Loading…" text on the drops/profile screens with skeleton `View`s using `Animated.View` with an opacity loop (RN has no CSS animation, but `Animated.loop(Animated.sequence(...))` works).
3. Use the same `cache-and-network` + `nextFetchPolicy: "cache-first"` pattern from yesterday's change.

## Notes / gotchas
- **localStorage write throttling**: `apollo3-cache-persist` debounces writes by default (1 s), so frequent mutations don't hammer storage.
- **Cache invalidation on logout**: if you change accounts, you'd want to call `apolloClient.clearStore()` to evict the previous user's cached posts. (Check the logout flow if cross-account data leakage is observed.)
- **The skeleton suppresses thumb backgrounds via `.cx-drop-list--skeleton .cx-drop-thumb { background-image: none }`** — so the inline `style={{ backgroundImage: url(...) }}` from the real rows doesn't accidentally light up empty rows.
