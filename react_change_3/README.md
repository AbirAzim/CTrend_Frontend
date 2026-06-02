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

## Index — 2026-06-02

| Doc | Topic |
|-----|--------|
| [post-author-email-nullable.md](./2026-06-02_post-author-email-nullable.md) | Make `PostGql.authorEmail` nullable for `SYSTEM` posts |
| [image-focal-position-editor.md](./2026-06-02_image-focal-position-editor.md) | Per-option `imageFocalX/Y` + position editor on create post |
| [comment-reactions-fb-style.md](./2026-06-02_comment-reactions-fb-style.md) | Facebook-style comment reactions tray + bubble summary |
| [platform-brand-avatar-and-announcement-nav.md](./2026-06-02_platform-brand-avatar-and-announcement-nav.md) | Brand logo avatar + announcement notification navigation |
| [campaign-default-and-filtering.md](./2026-06-02_campaign-default-and-filtering.md) | Multiple active campaigns, default campaign, “See other campaigns”, and campaign-wise feed filters |
| [poll-ending-soon-configurable-threshold.md](./2026-06-02_poll-ending-soon-configurable-threshold.md) | Per-post ending-soon threshold + top urgency banner + admin control |

## Backend (CTrend repo)

- `posts/post.schema.ts` — `campaignId`, `voteWinnerUserId`, `voteWinnerOptionIndex`, `voteWinnerPickedAt`, `endingSoonLeadMinutes`
- `posts/dto/create-post.input.ts` — `campaignId`
- `posts/dto/update-post.input.ts` — `endingSoonLeadMinutes`
- `posts/posts.service.ts` — attach campaign, `ensureVoteWinnerDrawn`
- `posts/graphql/post.types.ts` — `endingSoonLeadMinutes` on `PostGql`
- `votes/votes.service.ts` — `drawRandomEligibleVoter`
- `schema.gql` — `PostCampaignSummaryGql`, `PostVoteWinnerGql` on `PostGql`
- `posts/graphql/post.types.ts` — make `PostGql.authorEmail` nullable

## Web (this repo)

- `CreatePostPage.tsx` — campaign `<select>`
- `PostCampaignBadge.tsx`, `PostVoteWinnerBanner.tsx`, `FeedPostCard.tsx`
- `EditPostModal.tsx`, `AdminPage.tsx` — admin threshold control
- `graphql/feed.ts` — `POST_CAMPAIGN_WINNER_FIELDS`
- `graphql/admin.ts` — include `endingSoonLeadMinutes` in platform post list
- `types/feed.ts`, `mapGqlPostToFeedView.ts`
- `index.css` — `.ig-post--campaign`, `.cx-post-campaign-ribbon`, `.cx-post-vote-winner`
