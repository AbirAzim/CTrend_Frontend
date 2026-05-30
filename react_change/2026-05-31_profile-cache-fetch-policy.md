# Profile Page — Cache-First Fetch Policy

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/ProfilePage.tsx`

## What changed on web

All Apollo queries on the profile page switched from `fetchPolicy: "network-only"` (which always blanks the UI and waits for the network round-trip) to `fetchPolicy: "cache-and-network"` with `nextFetchPolicy: "cache-first"`.

**Affected queries:**
- `ME` — user profile
- `USER_POSTS` — drops grid
- `MY_FRIENDS` — friends list
- `FRIEND_REQUESTS` — incoming/sent requests
- `FRIEND_SUGGESTIONS` — suggestions list
- `MY_SAVED_POSTS` — kept posts (already was cache-and-network, just added `nextFetchPolicy`)

### How it behaves now
1. **First visit** — fires the network request, shows loading state, populates cache.
2. **Subsequent navigations to profile** — instantly renders from cache (no spinner), then fires a background network request and updates the UI if data changed.
3. **`nextFetchPolicy: "cache-first"`** — after the initial fetch resolves, any subsequent same-component re-render serves from cache only (no extra network calls unless the user explicitly refetches via mutations).

The result: navigating to the profile feels instant on the second visit and onwards. Drops grid no longer flashes empty for a second while the network round-trip happens.

## Mobile implementation instructions

1. In the equivalent ProfileScreen, change all `useQuery` calls from `network-only` to `cache-and-network` + `nextFetchPolicy: "cache-first"`.
2. The mutations that affect these queries (`addFriend`, `respondFriendRequest`, `unfriend`, `cancelFriendRequest`, `extendPostVoting`, `updatePost`) already either call `refetchQueries` or use explicit `refetch()` calls — those continue to bypass the cache and force a fresh fetch.
3. Verify the kept tab still gets fresh data after a `Keep` toggle on FeedPostCard — the `cache-and-network` policy plus the optimistic cache update in `setPostKeepMut` should be enough.

## Notes / gotchas
- **Don't downgrade to `cache-first` as the primary policy** — that would *only* hit cache and never refresh, so changes from other tabs / devices wouldn't show up. `cache-and-network` shows the cached value instantly AND refreshes in the background, which is the sweet spot for a profile screen.
- **`nextFetchPolicy: "cache-first"`** matters: without it, every re-render of the component fires a new network request. With it, only the first render does so per session.
- If the user reports stale data on the profile, the explicit `refetch*` callbacks in the action handlers will still force a fresh fetch — nothing changes there.
