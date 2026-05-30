# Friendly Network Error + Global Search Bar (People + Posts)

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/FeedPage.tsx`
- `src/layouts/AppShell.tsx`
- `src/components/GlobalSearch.tsx` (new)
- `src/graphql/search.ts` (new)
- `src/index.css`

**Backend files changed:**
- `src/app.module.ts`
- `src/search/search.module.ts` (new)
- `src/search/search.service.ts` (new)
- `src/search/search.resolver.ts` (new)
- `src/search/graphql/search.types.ts` (new)

## What changed

### 1. Network error message — friendly + retry button
Replaced the developer-facing `Could not load feed. Load failed feedPosts query (see backend_req.md).` banner with a user-facing one:

> **Couldn't reach the feed.** Check your internet connection and try again. \[Retry\]

The new **Retry** button is a small rose-tinted ghost button that calls `refetchFeed()` directly. Banner layout updated to flex-row with the button pushed to the right.

### 2. Global search — top-nav inline input + dropdown
A new `<GlobalSearch />` component lives between the brand and the action chips in `AppShell`'s top bar (auth-only). It searches **People** (friends prioritized) and **Posts** simultaneously, debounced 300 ms.

#### Backend — new `SearchModule`
- `globalSearch(query: String!, limit: Int): SearchResultGql` query (auth-optional via `OptionalJwtGqlGuard`)
- `SearchResultGql` contains:
  - `users: [SearchUserGql!]!` — each with `user: UserGql` and `isFriend: Boolean!`
  - `posts: [PostGql!]!`
- Service builds case-insensitive regex from a properly-escaped query and runs in parallel against:
  - **Users**: `displayName | username | email` match. Excludes the viewer. Pulls 2× the limit, then sorts (friends first via `followsService.getMyFriends`, then alphabetical), slices to `limit`.
  - **Posts**: `contentText | options.label` match, only PUBLISHED status, sorted by `createdAt` desc. Mapped through `postsService.toGql` so the viewer-specific fields (vote state, save state, etc.) are correct.
- `SearchModule` registers User + Post models and imports `UsersModule`, `PostsModule`, `FollowsModule`. Wired into `AppModule`.

#### Frontend — `GlobalSearch.tsx`
- Inline input shape: 38px tall pill with inline SVG magnifier (`background-image`), 460px max-width, themed for light + dark.
- Focus state: accent border + 4px translucent shadow ring.
- Live debounced query (300 ms) via `useLazyQuery` with `fetchPolicy: "no-cache"` so partial typed states don't pollute the cache.
- Dropdown opens on focus when query is non-empty; closes on outside click, Esc, or row selection.
- Result rows are a **single mixed list**:
  - Users come first (server pre-sorts friends to the top), then posts
  - User rows: avatar + display name + tiny "FRIEND" badge if `isFriend` + `@username` line
  - Post rows: first image thumbnail (or 📷 fallback) + caption + "Post by …" subline
- Click handlers: user → `/profile/:id`, post → `/post/:id`. State resets on navigate.
- **Mobile (`max-width: 720px`)**: inline input hides, a search icon appears in the action bar; tapping it opens a full-screen overlay with the same search input + scrollable result list.

## Mobile implementation instructions

1. Add the `GLOBAL_SEARCH` GraphQL query to the mobile codebase.
2. Build an equivalent `GlobalSearchScreen` (or modal) that mirrors the dropdown structure.
3. Use `react-native-debounce` or `useEffect`+`setTimeout` for 300 ms debouncing.
4. Reuse the same `users.user.profileImageUrl` and `posts.imageUrls[0]` paths for thumbnails.
5. Wire row taps to `navigation.navigate('UserProfile', { userId })` / `'PostDetail'`.

## Notes / gotchas
- **Backend type-checks clean** with `npx tsc --noEmit`.
- **Friends-priority** is implemented by pulling 2× the requested limit from Mongo first, marking each result with `isFriend` (set membership against `followsService.getMyFriends`), then sorting client-side in the service. This avoids a complex aggregation pipeline. For very large user bases, this could be refactored into a `$lookup` aggregation with `addFields` for sort key — for now (small platform) it's fine.
- **Posts search** uses the `options.label` dot-path on Mongo's embedded array — this works natively and the existing `feedPriority`/`voteCount` indexes mean the query stays fast.
- **`OptionalJwtGqlGuard`** means anonymous visitors can also search (results just won't have friend-priority). If you want auth-required, swap to `GqlAuthGuard`.
- **`fetchPolicy: "no-cache"`** on the frontend query — search results are intentionally never cached because the user's intent is "fresh data right now", and partial-query caches would waste memory.
- **Mobile overlay** uses `position: fixed; inset: 0` with `z-index: 500` so it sits above the nav and bottom tab bar.
- **Dark mode** overrides included for the search pill, dropdown, overlay, and row hover.
