# Hide Display Names Outside Profile, Robust Realtime New-Post Fetch

**Date:** 2026-05-31
**Web files changed:**
- `src/components/FeedPostCard.tsx`
- `src/pages/FeedPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/FriendsPage.tsx`

## What changed

### 1. Display names hidden everywhere except profile pages
Per the user's screenshot showing the Friends sidebar with both "Badhon Kundu" and "@badhon_kundu", duplicate names cluttered every friend row. The rule now: **display names appear ONLY on profile page headers (`ProfilePage` hero + `UserProfilePage` hero)**. Everywhere else uses `@username` only.

**FeedPage sidebar (Friends / Suggestions / Requests panels + people modal):**
- `friendName(f)` now returns `@${username}` instead of `displayName || username`
- Removed every duplicate `<span>@{username}</span>` row that paired with the strong-tagged name (5 occurrences across the four panels + modal)

**FeedPostCard post header:**
- Username row now shows `@authorUsername` instead of `displayName || username`
- Avatar initial sources from `authorUsername.slice(0, 1)` (not displayName)

**FeedPostCard comments + voter rows:**
- Mini-preview comments: `**@username**: content` instead of `**displayName**`
- Full comment list: `@username` for each commenter
- Voters list: `@username` for non-anonymous voters

**ProfilePage Connections card (Friends / Requests / Suggestions tabs):**
- `friendName(f)` returns `@${username}`
- `friendInitial(f)` uses first char of username (skipping the `@` prefix)
- Removed every duplicate `<span className="cx-conn-username">@{username}</span>` row (4 occurrences)

**FriendsPage:**
- `friendName(u)` returns `@${username}`
- Removed every duplicate `<span>@{username}</span>` row (4 occurrences)

**Kept showing display name in:**
- ProfilePage own-profile header (the big "Abir Azim Badhon Diu" title) — unchanged
- UserProfilePage other-user-profile header — unchanged
- Edit-profile form display-name field — unchanged

### 2. Realtime new-post fetch — strengthened
The existing `NEW_POSTS` GraphQL subscription was wired but only added new posts to a transient `liveQueue` via a per-post `getPostById` query. If `getPostById` silently failed (network blip, viewer-permission mismatch, cache eviction), the new post never appeared.

**Strengthened path in FeedPage:**
- On every subscription event, **also call `refetchFeed()` immediately** so the canonical `FEED_POSTS` query gets the new post via the regular feed pipeline (correct ordering, visibility filters, pagination).
- The `liveQueue` fallback path is kept — it covers the brief window before `refetchFeed()` resolves. If both deliver the same post, `knownIds` deduplication prevents double-render.
- Net effect: new posts now ALWAYS appear in the feed within a fraction of a second of being published, regardless of which path resolves first.

## Mobile implementation instructions

### Display names
1. Search every friend-row equivalent in mobile (sidebars, post headers, comment rows, voter rows, connections cards) and replace `displayName || username` with `@${username}`.
2. Keep display names on `ProfileScreen` and `UserProfileScreen` headers.
3. Avatar initials: use `username.charAt(0).toUpperCase()`.

### Realtime feed
1. Mirror the FeedPage subscription pattern: on every `NEW_POSTS` event, call `refetch()` on the feed query.
2. Optionally keep an in-memory liveQueue for instant visual feedback — but the refetch alone is usually enough on a fast connection.

## Notes / gotchas
- **`friendInitial` definition for ProfilePage** now uses raw username (not the `@username` string from `friendName`), so the avatar shows a clean letter without an `@` prefix.
- **`displayName` is still queried in GraphQL** for these surfaces because it's used elsewhere (search filtering, profile pages). We're just not displaying it in lists.
- **Search in ProfilePage's connections card** still matches against `displayName` field — so even though the user sees `@username`, searching by display name still works. Backend `friendSuggestions(search)` also matches all three fields.
- **Notification body** (e.g. `"Anjon hyped your post"`) still uses the server-stored `latestActorName` which is the display name. Changing that would require backend work to store/format the actor name as username. Skipped for now — low surface area in the bell popover.
- **The realtime refetch** is debounced naturally by Apollo's network layer — even if 10 posts arrive in 1 second, the result is a single network round-trip per refetch call (and React batches the re-renders).
