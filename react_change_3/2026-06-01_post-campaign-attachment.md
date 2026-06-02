# Post ↔ campaign attachment

**Date:** 2026-06-01

## Summary

Any compare post (user, org, or admin system post) can optionally link to an existing
**Campaign** via `campaignId` on `CreatePostInput`. Linked posts show a gold campaign
ribbon on the feed and post detail.

## Backend

- `Post.campaignId` → `Campaign` ref
- Validated on create (`create`, `createSystemPost`, `createOrgPost`)
- `PostGql.campaign` → `PostCampaignSummaryGql` (id, name, slug, bannerText, bannerImageUrl, prizePerWinner)

## Web

| File | Role |
|------|------|
| `CreatePostPage.tsx` | Optional campaign dropdown (active campaigns for users; all campaigns for admin) |
| `PostCampaignBadge.tsx` | Ribbon linking to `/campaign/:slug` |
| `FeedPostCard.tsx` | `ig-post--campaign` + ribbon under header |
| `graphql/feed.ts` | `campaign { … }` on feed queries |

## Manual test

1. Admin: create or pick a campaign in `/admin` → Campaigns.
2. Create post → choose campaign → publish.
3. Feed: post has gold border + campaign ribbon; tap ribbon → campaign page.
4. Create without campaign → no ribbon.
