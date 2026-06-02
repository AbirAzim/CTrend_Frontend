# Poll ending soon banner + admin-configurable threshold

**Date:** 2026-06-02  
**Web files changed:**
- `src/components/FeedPostCard.tsx`
- `src/components/EditPostModal.tsx`
- `src/pages/AdminPage.tsx`
- `src/graphql/feed.ts`
- `src/graphql/admin.ts`
- `src/lib/mapGqlPostToFeedView.ts`
- `src/types/feed.ts`
- `src/index.css`

**Backend files changed (CTrend):**
- `src/posts/post.schema.ts` — `endingSoonLeadMinutes` (default `5`)
- `src/posts/dto/update-post.input.ts` — `endingSoonLeadMinutes?: Int`
- `src/posts/graphql/post.types.ts` — expose `endingSoonLeadMinutes` on `PostGql`
- `src/posts/posts.service.ts` — create defaults + update save + gql mapping

## What changed

We added a per-post **ending soon alert threshold** so urgency can be controlled by admin for each post.

- Default behavior: show alert when vote end is within **5 minutes**.
- Admin can change threshold per post (min `1`, max `1440` minutes).
- Feed card shows a top banner: **"Poll ending soon, vote now!"** when remaining time is inside the configured range.

## Web

### Feed post urgency banner

- `FeedPostCard.tsx` now computes remaining voting time.
- If voting is still open and remaining time `<= endingSoonLeadMinutes`, a top warning banner appears.
- Dark mode styling was added for readability.

### Admin post edit control

- `EditPostModal.tsx` has new admin-only number input:
  - **Ending-soon alert lead time (minutes)**
- Save sends `endingSoonLeadMinutes` in `UPDATE_POST` mutation input.
- `AdminPage.tsx` passes the field into `EditPostModal` edit payload.

### GraphQL + mapping

- Feed and admin post queries now request `endingSoonLeadMinutes`.
- `FeedPostView` and `mapGqlPostToFeedView` map this field for rendering logic.

## Manual test

1. Admin opens post edit modal and sets ending-soon threshold to `5`.
2. Set voting deadline so remaining time is within 5 minutes.
3. Feed shows top "Poll ending soon, vote now!" banner.
4. Change threshold to `30`; banner should appear earlier accordingly.
5. When voting closes, ending-soon banner no longer shows.

