# Platform brand avatar + announcement navigation

**Date:** 2026-06-02  
**Web files changed:**
- `src/lib/moderatorBrand.ts`
- `src/components/FeedPostCard.tsx`
- `src/components/NotificationBell.tsx`

**Backend files changed (CTrend):**
- _None required (UI-only interpretation of existing notifications/posts)._

## What changed

Two small UX fixes to make “official / platform” content feel consistent:

- Platform-authored content uses a consistent brand logo avatar.
- Announcement notifications that reference a post now navigate to that post when tapped.

## Web

### Brand logo constant

- `moderatorBrand.ts` adds `PLATFORM_BRAND_LOGO_URL = "/logo.png"`.

### Feed post header (platform/system posts)

- `FeedPostCard.tsx` uses `PLATFORM_BRAND_LOGO_URL` instead of a hardcoded `/logo.png` string.

### Notifications

- `NotificationBell.tsx`
  - `ANNOUNCEMENT` notifications now navigate to `/post/:id` when `postId` or `referenceId` is present.
  - For platform announcements, avatar uses `PLATFORM_BRAND_LOGO_URL` instead of actor avatar (so broadcasts look official).

## Manual test

1. Create/trigger an `ANNOUNCEMENT` notification with a `postId`.
2. Tap it in the notification list → should open the post.
3. Check avatar:
   - For platform announcements: shows the brand logo.
   - For normal notifications: behavior unchanged.

