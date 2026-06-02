# Vote end notifications + winner claim flow + filter UX polish

**Date:** 2026-06-02  
**Web files changed:**
- `src/components/NotificationBell.tsx`
- `src/components/ProfileCompareCard.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/FeedPage.tsx`
- `src/graphql/feed.ts`
- `src/graphql/profile.ts`
- `src/graphql/admin.ts`
- `src/lib/mapGqlPostToFeedView.ts`
- `src/types/feed.ts`
- `src/index.css`

**Backend files changed (CTrend):**
- `src/posts/post.schema.ts`
- `src/posts/graphql/post.types.ts`
- `src/posts/posts.service.ts`
- `src/posts/posts.resolver.ts`
- `src/posts/posts.module.ts`
- `src/notifications/notification.schema.ts`
- `src/votes/votes.service.ts`
- `src/messages/messages.service.ts`

## What changed on web

### 1) Vote end + winner notification UX

- Notification bell now supports new vote lifecycle notification types:
  - `VOTE_ENDED`
  - `VOTE_WINNER`
  - `VOTE_PRIZE_CLAIMED`
- Winner notifications render a **Claim prize** action.

### 2) Winner claim action from notification

- Added claim mutation usage from bell:
  - `claimPostVotePrize(postId)`
- On successful claim:
  - Notification text updates to submitted/acknowledged state.
  - User gets moderator-style acknowledgement flow (backend auto-message).

### 3) Admin + user visibility

- Admin post table now shows:
  - winner identity
  - prize claimed status/time
- User drops cards now show winner/claim badges:
  - winner identity
  - prize claimed
  - claimable hint (when applicable)

### 4) Filter feed UX polish

- `Filter feed` trigger now has stronger information hierarchy:
  - kicker + active value
- Added helper text and improved spacing/readability.
- Dark mode contrast improved for filter controls.

## Backend behavior implemented

### 1) Vote end fan-out notifications

- Winner draw flow now triggers one-time vote-end fanout:
  - creator + participants get: **Vote has ended. Check out the winner.**
  - friend-post winner gets dedicated winner notification
- One-time dispatch is guarded by `voteEndedNotifiedAt`.

### 2) Winner claim domain model

- Added post fields:
  - `voteEndedNotifiedAt`
  - `votePrizeClaimedAt`
  - `votePrizeClaimedByUserId`
- Added `PostGql` flags:
  - `isPrizeClaimed`
  - `votePrizeClaimedAt`
  - `canClaimPrize`

### 3) Claim mutation + automation

- New mutation:
  - `claimPostVotePrize(postId: ID!): PostGql!`
- Enforced constraints:
  - only winner can claim
  - only friend-post context allows claim
  - idempotent for repeated claim attempts
- On claim:
  - admins receive claim notification
  - winner receives automated moderator acknowledgement message

## Mobile implementation instructions

1. Add the new notification types to mobile bell mapping (`VOTE_ENDED`, `VOTE_WINNER`, `VOTE_PRIZE_CLAIMED`).
2. Add claim action button for winner notifications and wire mutation call.
3. Update mobile profile drops cards to render winner + claim state badges.
4. Mirror filter trigger hierarchy improvements (title + selected value) for feed campaign filter UI.

## Notes / gotchas

- Claim is disabled for non-eligible post types; currently eligible for `USER` (friend flow) and `SYSTEM` (platform-wide admin flow).
- Winner claim state should be treated as server source-of-truth (avoid local-only toggles).
- Existing lint warnings remain unrelated; no new lint errors introduced.

## Follow-up fixes (same day)

### 1) Platform-wide post winner claim eligibility

- Updated backend prize-claim gate to allow claim for:
  - friend posts (`USER`)
  - platform-wide admin posts (`SYSTEM`)
- Updated winner notification copy logic to show claim-intent wording for both eligible contexts.

### 2) Claim button state after submit

- Web bell UI now hides the **Claim prize** button once claim is submitted and the row text is switched to:
  - `Prize claim submitted`
  - `Your claim is received. A moderator will connect with you soon.`
- This prevents duplicate claim clicks from the same notification row after success.

### 3) Scheduled publish + websocket resilience hardening

- Scheduler no longer hard-skips due-post publish solely because `Mongo readyState !== 1`; it logs warning and still attempts publish flow.
- PubSub publish wrapper now absorbs transient socket write failures (`EPIPE`, `ECONNRESET`) so notification/subscription transport issues do not break core publish flow.

