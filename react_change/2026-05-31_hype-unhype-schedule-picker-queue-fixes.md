# Hype Notifications, Unhype Toggle, Schedule Picker, Queue Card, Go-Live Time

**Date:** 2026-05-31
**Web files changed:**
- `src/components/FeedPostCard.tsx`
- `src/pages/CreatePostPage.tsx`
- `src/pages/ScheduledPostsPage.tsx`
- `src/graphql/feed.ts`
- `src/types/feed.ts`
- `src/lib/mapGqlPostToFeedView.ts`
- `src/index.css`
- `packages/shared/src/graphql/feed.ts`

**Backend files changed:**
- `src/notifications/notifications.service.ts`
- `src/posts/posts.service.ts`
- `src/posts/graphql/post.types.ts`
- `src/schema.gql`

## What changed

### 1. Hype notifications fire again after unhype / re-hype
**Bug:** A user could hype once, unhype, then hype again — the post author/admin got no second notification because grouped notifications treated same-actor re-hype as a no-op on the existing unread row.

**Fix:** `createOrUpdateGrouped` now re-notifies for `POST_HYPE` even when the latest actor is the same user (bumps timestamp + publishes subscription). Other grouped types (likes/comments) still dedupe same-actor bounce.

### 2. Unhype toggle works end-to-end
**Bug:** Frontend always initialized hype button as inactive (`liked = false`) because the API never exposed whether the viewer had hyped.

**Fix:**
- Backend adds `viewerHasHyped: Boolean!` on `PostGql` (mirrors `viewerHasSaved`).
- `FeedPostCard` reads `post.viewerHasHyped`, toggles `active: true/false` via existing `setPostHype` mutation, and labels the control **Hype / Unhype**.

### 3. DateTimePicker UI — complete fix
**Bug:** Popover clipped behind form buttons/cards; min-date disabled wrong days; calendar view didn’t track selected value.

**Fix:**
- Popover renders via `createPortal(..., document.body)` with fixed positioning from trigger `getBoundingClientRect`.
- Reposition on scroll/resize; Escape closes; outside-click aware of portal node.
- Disabled-day logic uses full datetime (`minDateMs`), not date-only comparison.
- Calendar month/year syncs when value changes.
- Form + schedule wrapper use `overflow: visible`; portal popover gets max-height + scroll on small screens.

### 4. Scheduled queue card redesign
**Bug:** Cards could show blank media (only `imageUrls`, not option images), weak layout, unclear timing copy.

**Fix on `/profile/scheduled`:**
- Images resolve from `imageUrls` **or** `options[].imageUrl` fallback.
- Option label chips, placeholder when no preview, responsive side-by-side layout on wider screens.
- Countdown copy: **"Goes live in …"** + **"Goes live at [date]"** (never relative createdAt like "7 minutes ago").
- Live countdown refresh every 30s.

### 5. Scheduled posts show go-live time in feed (not draft creation time)
**Bug:** When a scheduled post published, feed showed `createdAt` from when the user drafted it (e.g. "7 minutes ago") instead of the scheduled publish moment.

**Fix:**
- Backend `publishScheduledPosts()` sets `createdAt = scheduledAt` at go-live.
- Frontend `FeedPostCard` displays `scheduledAt ?? createdAt` for post time labels when `scheduledAt` is present.

## Mobile implementation instructions

1. **Hype / unhype:** Add `viewerHasHyped` to feed/post queries in `packages/shared` (already updated). Drive hype button pressed state from this field; call `setPostHype(postId, active: !viewerHasHyped)`.
2. **Notifications:** Backend-only — no mobile change needed for re-hype notification fix.
3. **DateTimePicker:** Keep native `@react-native-community/datetimepicker` or similar; portal fix is web-specific. Ensure future-date validation matches web.
4. **Scheduled queue:** Mirror image fallback (`imageUrls` then `options[].imageUrl`), option chips, and **"Goes live at …"** copy. Do not show `createdAt` as relative time in queue.
5. **Feed timestamp:** Prefer `scheduledAt` over `createdAt` when rendering post age for posts that were scheduled.

## Notes / gotchas

- **`viewerHasHyped` is required** in GraphQL schema — regenerate mobile types after pulling backend schema.
- **Existing published scheduled posts** keep old `createdAt` until republished; only newly cron-published posts get the corrected timestamp.
- **Hype notification grouping** still merges different users into one unread row (actor count increments). Same user re-hype after unhype now re-alerts instead of silently no-oping.
- **Backend restart required** for schema + notification + publish-time changes to take effect.
