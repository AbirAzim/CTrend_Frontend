# React Change Log 3 — Campaign posts & vote-draw winners

Continuation of `react_change_2/`. Tracks **campaign-linked compares** and **random
prize-draw winners** after voting closes (web + backend).

Overall plan: [`../PHASES.md`](../PHASES.md).

## Workflow

1. Implement + verify on **web** and **CTrend backend**.
2. Add a dated entry here (use [`TEMPLATE.md`](./TEMPLATE.md)).
3. Deploy backend before frontend (new GraphQL fields).

## Index — 2026-06-01

| Doc | Topic |
|-----|--------|
| [post-campaign-attachment.md](./2026-06-01_post-campaign-attachment.md) | Optional `campaignId` on create post + feed UI ribbon |
| [post-vote-draw-winner.md](./2026-06-01_post-vote-draw-winner.md) | Random winner after voting ends (non-anonymous, winning side / tie) |

## Backend (CTrend repo)

- `posts/post.schema.ts` — `campaignId`, `voteWinnerUserId`, `voteWinnerOptionIndex`, `voteWinnerPickedAt`
- `posts/dto/create-post.input.ts` — `campaignId`
- `posts/posts.service.ts` — attach campaign, `ensureVoteWinnerDrawn`
- `votes/votes.service.ts` — `drawRandomEligibleVoter`
- `schema.gql` — `PostCampaignSummaryGql`, `PostVoteWinnerGql` on `PostGql`

## Web (this repo)

- `CreatePostPage.tsx` — campaign `<select>`
- `PostCampaignBadge.tsx`, `PostVoteWinnerBanner.tsx`, `FeedPostCard.tsx`
- `graphql/feed.ts` — `POST_CAMPAIGN_WINNER_FIELDS`
- `types/feed.ts`, `mapGqlPostToFeedView.ts`
- `index.css` — `.ig-post--campaign`, `.cx-post-campaign-ribbon`, `.cx-post-vote-winner`
