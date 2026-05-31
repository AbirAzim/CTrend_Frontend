# Lazy feed comments + backend compile fixes

**Date:** 2026-05-31

**Web files changed:**
- `src/graphql/feed.ts`
- `src/components/FeedPostCard.tsx`
- `src/lib/mapGqlPostToFeedView.ts`

**Backend files changed (`CTrend`):**
- `src/posts/posts.service.ts`
- `src/notifications/notification.schema.ts`
- `src/users/users.service.ts`

## What changed on web

Feed posts no longer fetch or show comment previews on load.

- Removed `recentComments` from `FEED_POSTS`, `GET_POST_BY_ID`, and `MY_SAVED_POSTS` GraphQL selections.
- Feed cards keep `commentCount` only; the **Discuss** chip shows the count (e.g. `Discuss 3`).
- Comment preview block under the action rail was removed.
- Comments load only when the user taps **Discuss** — `PostCommentsPanel` already uses `useLazyQuery(COMMENTS_BY_POST)` on mount when opened.
- `mapGqlPostToFeedView` always maps `recentComments: []` (type kept optional for compatibility).

## Backend fixes (same session)

These were blocking `tsc` on the API:

| Area | Fix |
|------|-----|
| Notifications | Added `postId` to schema; enum includes `COMMENT_REPLY`, `COMMENT_REACTION` |
| Posts `toGql` | Restored `viewerHasHyped`, `myVoteAnonymous`; stopped calling `listMostRecentByPost` — returns `recentComments: []` |
| Users admin list | Restored `buildListQuery` + `ListUsersQuery` API; `toGql` returns `emailVerified`, `createdAt` |

Restart the backend after pulling these changes.

## Mobile implementation instructions

1. **Post list query:** Request `commentCount` on feed/post cards; do **not** request `recentComments` in the initial post query.
2. **Discuss action:** Show comment count on the Discuss button/chip from `commentCount`.
3. **Lazy load:** When Discuss is tapped, fetch `commentsByPost(postId)` (same as web `COMMENTS_BY_POST`). Mount the comments UI only after tap — do not prefetch on scroll.
4. **No inline preview:** Do not render the latest 1–2 comments under the post until Discuss is open (matches web).
5. **Notifications:** If mobile deep-links from bell items, use `postId` on notification payload when present (backend now persists it).

## Relevant web code snippets

```tsx
// FeedPostCard — count on chip, panel only when open
<span className="cx-action-chip-label">
  Discuss{commentCount > 0 ? ` ${commentCount}` : ""}
</span>

{commentsOpen ? (
  <PostCommentsPanel postId={post.id} ... />
) : null}
```

```tsx
// PostCommentsPanel — fetch on mount (when panel opens)
const [fetchComments, { data, loading }] =
  useLazyQuery(COMMENTS_BY_POST, { fetchPolicy: "network-only" });

useEffect(() => {
  if (voteMode === "api") {
    void fetchComments({ variables: { postId } });
  }
}, [voteMode, postId, fetchComments]);
```

## Notes / gotchas

- `recentComments` remains on the GraphQL `PostGql` type but the API always returns `[]` — mobile should not rely on it for feed rendering.
- Post detail page (`/post/:id`) uses the same query shape; comments still lazy via Discuss unless you add a separate “always open comments” layout on mobile post screen.
- `PostCommentsPanel` still shows only 2 top-level threads initially with “Show more” — that behavior is unchanged; only the **feed-level preview** was removed.
