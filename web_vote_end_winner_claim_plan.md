# Web Plan: Vote End Notifications, Winner Claim Flow, and Filter UX Polish

**Date:** 2026-06-02  
**Scope:** Web only (`CTrend_frontend`)  
**Status:** Planning document (no new implementation in this file)

## Goal

Deliver a complete web experience where:

1. After voting ends, creator and participants are notified to check winner.
2. Winner receives a high-priority notification with a **Claim Prize** action.
3. Claim flow is enabled only for friend-post context (per requirement).
4. Admin can see winner and claim status from admin post area.
5. User can see winner/claim status in drops section.
6. Feed filter UI/UX is improved (especially dark mode + visual hierarchy).

## Phase 1 — Vote End Notification UX (Web)

### Functional requirements

- When voting closes:
  - Notify post creator.
  - Notify all users who participated in voting.
  - Notification text:
    - **Creator/participants:** `Vote has ended. Check out the winner.`
    - **Winner:** strong/powerful winner copy (final copy to be approved).

### Web deliverables

- Notification list item design variants:
  - normal ended-notification
  - winner notification (highlighted)
- CTA slot for winner notification (reserved for Phase 2 button).
- Proper navigation from notification to post detail.

### Files likely to touch

- `src/components/NotificationBell.tsx`
- `src/context/NotificationContext.tsx`
- `src/graphql/...` (notification query fields if needed)
- `src/index.css` (winner notification emphasis)

## Phase 2 — Winner Claim Flow (Web)

### Functional requirements

- Winner notification includes CTA:
  - `Claim Prize` (or `Claim Winner`, final text to lock).
- On click:
  - Trigger claim mutation.
  - Mark claim as submitted (no double-claim).
  - Show success feedback:
    - `A moderator will connect with you soon.`

### Automation chain (web-visible behavior)

- Claim button action triggers backend workflow:
  - Admin receives claim-intent message/notification.
  - Winner gets automated acknowledgment message.

### Files likely to touch

- `src/components/NotificationBell.tsx`
- `src/pages/...` winner/drops related page(s)
- `src/graphql/...` (`claim` mutation + status fields)
- `src/types/...` (claim status types)

## Phase 3 — Friend-post Rule Enforcement (Web)

### Requirement

- If the post is **not** friend-post context:
  - Do **not** show claim CTA.
  - Show winner only (read-only outcome).

### Web deliverables

- Conditional CTA rendering based on claim-eligibility flag.
- Clear microcopy when claim is unavailable.

### Files likely to touch

- Notification card renderer
- Winner/drops card renderer
- GraphQL selection sets for eligibility flag

## Phase 4 — Admin + User Visibility (Web)

### Admin visibility

- In admin post management:
  - winner identity
  - claim status (`unclaimed`, `claimed`, `processing`, etc.)
  - claimed timestamp (if available)

### User visibility

- In drops/winner section:
  - won post list
  - claim status
  - claim history/confirmation

### Files likely to touch

- `src/pages/AdminPage.tsx`
- `src/graphql/admin.ts`
- user drops page/component(s)
- shared type mappers (`src/types`, `src/lib/map...`)

## Phase 5 — Filter Feed UI/UX Polish (Web)

### UX issues to address

- Current filter dock visual balance/spacing is weak.
- Dark mode contrast and emphasis need refinement.
- Active/default chip hierarchy is not clear enough.

### Planned improvements

- Cleaner dock layout and spacing.
- Better type scale and control grouping.
- Stronger active/default chip visuals.
- Improved dark-mode contrast tokens.
- Mobile responsiveness and smoother open/close interaction.

### Files likely to touch

- `src/pages/FeedPage.tsx`
- `src/components/CampaignBanners.tsx` (if needed for visual alignment)
- `src/index.css`

## API/Data Contract Checklist (for implementation phase)

Before coding, confirm backend exposes:

- vote-ended notification payload
- winner identity + claim eligibility flag
- claim mutation + idempotent response
- admin claim-status fields
- user drops/wins fields

## QA Checklist (Web)

1. Vote closes -> creator + participants receive ended notification.
2. Winner gets highlighted notification with claim CTA (friend-post only).
3. Claim click updates UI state and blocks duplicate claim.
4. Admin sees claim request context from post/admin view.
5. User sees claim status in drops.
6. Non-friend post winner shows without claim CTA.
7. Filter feed UI looks correct in light/dark + mobile widths.

## Rollout Order (Web-first)

1. Phase 1 notifications
2. Phase 2 claim CTA/action
3. Phase 3 friend-post gating
4. Phase 4 admin + drops visibility
5. Phase 5 filter UX polish
6. Update `react_change_3` docs after each completed phase

