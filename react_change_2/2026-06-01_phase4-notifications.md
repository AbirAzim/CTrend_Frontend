# Phase 4 — Notifications (avatars, resurface, friend actions, comment deep-links)

**Date:** 2026-06-01

**Web files changed:**
- `src/graphql/notifications.ts`
- `src/context/NotificationContext.tsx`
- `src/components/NotificationBell.tsx`
- `src/pages/PostDetailPage.tsx`
- `src/components/FeedPostCard.tsx`
- `src/components/PostCommentsPanel.tsx`
- `src/index.css`

**Backend files changed:**
- `src/notifications/notification.schema.ts` — `commentId`
- `src/notifications/graphql/notification.types.ts` — `commentId`
- `src/notifications/notifications.service.ts` — grouped bump: `read=false`, `commentId`, comment types re-bump
- `src/comments/comments.service.ts` — pass `commentId` on POST_COMMENT / COMMENT_REPLY / COMMENT_REACTION
- `src/schema.gql`

---

## What changed

### #10 Actor avatar in bell

- Query/subscription request `latestActorAvatar` (GraphQL field resolver on backend).
- `NotificationBell` shows a **36px round avatar** when URL exists; falls back to type emoji.

### #1 Grouped notification resurfaces

- Backend `createOrUpdateGrouped` on update: sets `read: false`, bumps `createdAt`, updates body/actors.
- `POST_COMMENT` / `COMMENT_REPLY` always bump even when the same actor posts again.
- Frontend subscription merges by id and moves row to top with fresh `createdAt` / `read`.

### #6 Friend request Accept / Reject feedback

- Local `friendReqStatus` map — after success shows **Accepted ✓** or **Rejected** (no spinner-only / no immediate refetch that hides the row).
- Still marks notification read; friend lists refetch via mutation `refetchQueries`.

### #7 Comment deep-link

- Backend stores `commentId` on comment-related notifications.
- Tap navigates to `/post/:postId#comment-:commentId`.
- `PostDetailPage` parses hash → `FeedPostCard` opens comments → `PostCommentsPanel` scrolls + highlights target row (`id="comment-{id}"`).

---

## Mobile port notes

1. **Avatar** — `Image` 36×36 `borderRadius: 18` or shared `Avatar` component; use `latestActorAvatar` from query/sub.
2. **Grouped updates** — merge notification list by `id` on realtime event; move to index 0; set `read: false`.
3. **Friend actions** — optimistic UI state on the row (`accepted` | `rejected`) before/after mutation.
4. **Deep link** — React Navigation: `navigation.navigate('Post', { postId, commentId })`; scroll `FlatList` to comment index or `scrollToIndex` after load.

---

## Verification

- [ ] Bell shows profile photo for hype/comment/friend notifications with `latestActorId`
- [ ] Second hype/comment on same post moves item to top, unread dot returns, time updates
- [ ] Accept friend → row shows "Accepted ✓"; Reject → "Rejected"
- [ ] Tap comment notification → post opens, comments expanded, target comment highlighted
