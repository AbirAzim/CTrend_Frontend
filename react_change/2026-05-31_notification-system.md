# Solid Notification System: Friend Requests, Posts, Hypes, Comments, Campaigns

**Date:** 2026-05-31
**Web files changed:**
- `src/components/NotificationBell.tsx` (rewritten)
- `src/context/NotificationContext.tsx`
- `src/graphql/notifications.ts`
- `src/index.css`

**Backend files changed:**
- `src/notifications/notification.schema.ts`
- `src/notifications/notifications.service.ts`
- `src/notifications/graphql/notification.types.ts`
- `src/follows/follows.module.ts`
- `src/follows/follows.service.ts`
- `src/posts/posts.module.ts`
- `src/posts/posts.service.ts`
- `src/comments/comments.module.ts`
- `src/comments/comments.service.ts`

## What changed

### Backend — new notification types + grouping
Added 3 new types to `NotificationType` enum:
- `NEW_POST_FRIEND` — fires when a friend posts a new compare
- `POST_HYPE` — fires when someone hypes my post (grouped)
- `POST_COMMENT` — fires when someone comments on my post (grouped)

Added grouping fields to schema:
- `actorCount: number` — distinct actors who triggered this notification
- `latestActorId: string` — most recent actor's user id (prevents counting same person twice)
- `latestActorName: string` — most recent actor's display name (for "Anjon and 9 more...")

New service method `createOrUpdateGrouped()`:
- Finds an existing UNREAD notification matching (userId + type + referenceId)
- If found: increments actorCount, updates body, bumps createdAt, fires subscription
- If not found: creates a fresh notification
- Same-actor consecutive triggers are no-ops (prevents like→unlike→like spam)
- Grouped body format: `"Anjon hyped your post"` (1) → `"Anjon and 5 more hyped your post"` (6)
- New compound DB index on `(userId, type, referenceId, read)` for fast grouping lookups

### Backend — notification triggers
- **`FollowsService.addFriendRequest()`** → fires `FRIEND_REQUEST` (only on fresh insert, not on re-asserting). `referenceId = requesterId`, `referenceType = "User"`
- **`PostsService.setReaction(kind="hype", active=true)`** → fires grouped `POST_HYPE` (only on fresh insert). `referenceId = postId`, `referenceType = "Post"`
- **`PostsService.publishNewPost()`** → fans out `NEW_POST_FRIEND` to all friends of the author after a fresh publish (skips SYSTEM posts). `referenceId = postId`, `referenceType = "Post"`
- **`CommentsService.create()`** → fires grouped `POST_COMMENT` to the post owner. `referenceId = postId`, `referenceType = "Post"`
- **Admin broadcast** (`sendAdminBroadcast`) — already wired, fires `ANNOUNCEMENT` to every user. Used for campaigns.

All trigger calls are wrapped in try/catch so a notification failure never breaks the primary action.

### Frontend — NotificationContext
- `NotificationItem` type now includes `actorCount`, `latestActorId`, `latestActorName`
- Subscription handler dedupes by `id` — when a grouped notification updates, its `id` stays the same so we replace the existing entry instead of duplicating
- Bumped item to the top of the list when an update arrives (matches the backend's `createdAt` bump)

### Frontend — NotificationBell (rewritten)
- Click handler routes by type:
  - `FRIEND_REQUEST` → `/profile/:requesterId`
  - `POST_HYPE`, `POST_COMMENT`, `NEW_POST_FRIEND`, anything with `referenceType="Post"` → `/post/:postId`
  - `referenceType="User"` → `/profile/:userId`
  - `ANNOUNCEMENT` (campaign) → no navigation; just marks read
- Inline action buttons for `FRIEND_REQUEST`:
  - **Accept** (green gradient) — calls `respondFriendRequest(accept: true)`, refetches `FRIEND_REQUESTS` and `MY_FRIENDS`
  - **Reject** (ghost → rose on hover) — calls `respondFriendRequest(accept: false)`
  - **View profile** (ghost → indigo on hover) — navigates to `/profile/:requesterId`
- All inline buttons `stopPropagation()` so the row's click handler doesn't fire
- Per-row loading state via `actionLoadingIds: Set<string>`
- Updated icon table:
  - 💬 MESSAGE · 📢 ANNOUNCEMENT · 👋 FRIEND_REQUEST · ✨ NEW_POST_FRIEND · ❤️ POST_HYPE · 💭 POST_COMMENT

### Real-time behavior
- Existing `newNotification` GraphQL subscription is already filtered by `recipientId` on the server — only the intended user gets the push
- Existing `playNotificationChime()` sound plays on every non-MESSAGE notification
- The bell badge updates instantly via Apollo cache reactivity

## Mobile implementation instructions

1. **GraphQL**: Update mobile `MY_NOTIFICATIONS` query and `NEW_NOTIFICATION_SUB` subscription to include `actorCount`, `latestActorId`, `latestActorName` fields.
2. **Notification type extension**: Update the local `NotificationItem` type to include the new fields and the three new types: `NEW_POST_FRIEND`, `POST_HYPE`, `POST_COMMENT`.
3. **Dedupe on subscription**: When a new notification arrives, check if an entry with the same `id` already exists. If yes, replace it (so updates from grouping land correctly).
4. **Route mapping** (use `navigation.navigate`):
   - `FRIEND_REQUEST` → `UserProfile` screen with the `referenceId`
   - `POST_HYPE`, `POST_COMMENT`, `NEW_POST_FRIEND`, anything with `referenceType="Post"` → `PostDetail` screen
   - `ANNOUNCEMENT` → no navigation, or open a campaign info modal
5. **Inline friend-request actions**: In the notification list row for `FRIEND_REQUEST`, show **Accept** / **Reject** / **View profile** buttons that call `respondFriendRequest` and `cancelFriendRequest` from `graphql/friends`. Use `ActivityIndicator` for the per-row loading state.

## Notes / gotchas
- **No self-notifications**: `createOrUpdateGrouped()` short-circuits when `userId === actorId`. The single-create paths don't have this guard yet — if you hype your own post, the backend currently doesn't notify you (which is correct), but verify `setReaction` checks the post owner before firing. Currently it does: `post.createdBy.toHexString()` is the recipient, and the actor is `userId` — if they match, we skip.
  - Actually, looking again: the `setReaction` path uses `createOrUpdateGrouped` which already has the self-skip. Good.
- **Module circular deps**: `PostsModule` imports `FollowsModule` (for `getMyFriends`) and `NotificationsModule`. `FollowsModule` imports `NotificationsModule`. `CommentsModule` imports `NotificationsModule`. No cycles — `NotificationsModule` is a leaf.
- **Index on `(userId, type, referenceId, read)`** is essential for the grouped lookup to stay fast as the notifications collection grows.
- **`actorCount` default**: existing notifications in the database will have `actorCount` unset; the schema default of `1` handles this, plus the `toGql` mapper has a `?? 1` fallback.
- **Backend type-checked clean** with `npx tsc --noEmit`.
