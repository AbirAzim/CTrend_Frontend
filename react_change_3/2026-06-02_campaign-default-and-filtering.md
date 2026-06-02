# Campaigns: default + “see other campaigns” + campaign filter

**Date:** 2026-06-02  
**Web files changed:**
- `src/pages/CreatePostPage.tsx`
- `src/components/PostCampaignBadge.tsx`
- `src/pages/FeedPage.tsx`
- `src/graphql/campaigns.ts` (new, or extend `feed.ts`)
- `src/graphql/feed.ts`
- `src/types/feed.ts`
- `src/index.css`

**Backend files changed (CTrend):**
- `src/campaigns/campaign.schema.ts` — `isDefault`
- `src/campaigns/campaigns.service.ts` — single-default enforcement + active/default ordering
- `src/campaigns/campaigns.resolver.ts` — active/admin campaign reads + update support
- `src/feed/feed.resolver.ts` / `src/feed/feed.service.ts` — optional `campaignId: ID` filter
- `src/campaigns/graphql/campaign.types.ts` — expose `isDefault` on gql types/inputs

## What we want

1. **Multiple active campaigns at once** — admin can mark one as **default**.
2. On the feed **campaign ribbon**, users can:
   - See the default campaign first.
   - Tap **“See other campaigns”** to open the full list of active campaigns.
3. Users can **filter the home feed by campaign** (e.g. “All compares”, “Eid offer”, “World Cup”, …).

## Implemented backend shape

- `Campaign` model has `isDefault: boolean` (service enforces only one default).
- Query:
  - `activeCampaigns: [Campaign!]!` returns **active** campaigns, default first.
- Feed filter:
  - `feedPosts(campaignId: ID)` added.
  - When set, only posts matching `campaignId` are returned.

## Web UX

### 1) Create post — campaign select ordering

- Campaign `<select>` shows:
  - Default campaign first (with `(default)` hint).
  - Admin also sees inactive campaigns flagged as `(inactive)`.

### 2) Campaign ribbon — “See other campaigns”

- In `PostCampaignBadge`:
  - Current campaign badge remains visible on the post.
  - Added **“See other campaigns”** action from ribbon area.
  - Selecting another campaign applies feed filter.

### 3) Feed filter — campaign-wise posts

- On `FeedPage`:
  - Feed filter is now a toggleable dock (`Filter feed`) instead of always-open chips.
  - Dock stays hidden by default; opens on click.
  - On scroll down, filter panel auto-hides.
  - Active campaign remains visible as a compact summary line when panel is closed.
  - Feed query sends `campaignId` when selected.

## Manual test (end state)

1. Admin marks two+ campaigns active and one as default.
2. Web feed:
   - Campaign filter chips show “All compares” + each active campaign.
   - Default campaign chip appears first / visually emphasized.
3. Tap a campaign chip:
   - Only posts tagged with that campaign appear.
4. Open a post with a campaign:
   - Ribbon shows “See other campaigns”; tapping it opens the list.
5. From the campaign list, pick another campaign:
   - Feed reloads with that campaign filter applied.

## Mobile app

- Mirror the same concepts:
  - Top chips for feed campaign filters.
  - “See other campaigns” entry from the campaign ribbon, adapted to mobile sheet / screen.

