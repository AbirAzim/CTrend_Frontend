# Scheduled Time + Brand Notification Fixes

**Date:** 2026-06-02
**Web files changed:**
- `src/graphql/feed.ts`
- `src/components/NotificationBell.tsx`

**Backend files changed (CTrend):**
- `src/posts/posts.service.ts`

## What changed

- Fixed feed post meta time for scheduled posts so it can use scheduled publish time (`scheduledAt`) in web feed mapping/queries.
- Tightened scheduled platform-post notification reliability by awaiting platform fan-out when a scheduled `SYSTEM` post is published.
- Updated vote-end fan-out logic so winner is always excluded from generic `VOTE_ENDED` recipients and receives a dedicated `VOTE_WINNER` notification.
- Winner notification copy now differs by post type:
  - Friend posts: claim-prize focused.
  - Non-friend posts: winner-celebration focused (no claim CTA intent).
- Updated notification avatar rendering so system-generated notification types use platform brand logo instead of generic emoji icon (e.g. clock icon for `VOTE_ENDED`).

## GraphQL

- Added `scheduledAt` to:
  - `FEED_POSTS`
  - `GET_POST_BY_ID`

No schema migration required (field already exists on backend output).

## Manual test

1. Create/schedule a system post and wait until publish time.
2. Verify feed card time reflects scheduled/go-live time.
3. Verify all users receive scheduled platform post announcement notification.
4. End a vote with a winner and verify:
   - Participants/creator receive `VOTE_ENDED`.
   - Winner receives `VOTE_WINNER` (different copy).
5. Open notification bell and verify system-generated notifications show brand logo avatar (not watch/emoji icon).

## Mobile app

- No native code changes applied.
- Mobile app should reuse backend notification behavior improvements once synced.
