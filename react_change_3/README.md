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
| [vote-end-winner-claim-and-filter-ux.md](./2026-06-02_vote-end-winner-claim-and-filter-ux.md) | Vote-end notifications, winner claim flow, admin/drops visibility, and filter UX polish |
| [admin-post-delete-and-safari-chat-keyboard.md](./2026-06-02_admin-post-delete-and-safari-chat-keyboard.md) | Admin post delete action in post management + iOS Safari keyboard-safe messenger composer |
| [admin-post-management-ux-overhaul.md](./2026-06-02_admin-post-management-ux-overhaul.md) | Admin post table redesign: compare-in-post layout, grouped engagement, separate winner column, and clearer badges |
| [scheduled-time-and-brand-notification-fixes.md](./2026-06-02_scheduled-time-and-brand-notification-fixes.md) | Scheduled post time display fix, reliable scheduled platform notify, winner-specific notify, and brand-logo system notification avatars |

## Backend (CTrend repo)

- `posts/post.schema.ts` — `campaignId`, `voteWinnerUserId`, `voteWinnerOptionIndex`, `voteWinnerPickedAt`, `endingSoonLeadMinutes`
- `posts/post.schema.ts` — `voteEndedNotifiedAt`, `votePrizeClaimedAt`, `votePrizeClaimedByUserId`
- `posts/dto/create-post.input.ts` — `campaignId`
- `posts/dto/update-post.input.ts` — `endingSoonLeadMinutes`
- `posts/posts.service.ts` — attach campaign, `ensureVoteWinnerDrawn`
- `posts/posts.service.ts` — vote-end fanout, winner-claim domain logic
- `posts/posts.service.ts` — claim eligibility includes `USER` + `SYSTEM`; scheduled publish loop hardened
- `posts/posts.resolver.ts` — `claimPostVotePrize`
- `posts/graphql/post.types.ts` — `endingSoonLeadMinutes` on `PostGql`
- `posts/graphql/post.types.ts` — `isPrizeClaimed`, `votePrizeClaimedAt`, `canClaimPrize`
- `posts/posts.service.ts` — scheduled SYSTEM post fan-out awaited + winner-specific vote-end notification routing
- `votes/votes.service.ts` — `drawRandomEligibleVoter`
- `votes/votes.service.ts` — participant id aggregation
- `notifications/notification.schema.ts` — vote lifecycle notification types
- `messages/messages.service.ts` — system moderator auto-reply helper
- `posts/post-scheduler.service.ts` — avoid hard skip on transient Mongo ready-state mismatch
- `pubsub.ts` — guard transient websocket publish failures (`EPIPE` / `ECONNRESET`)
- `schema.gql` — `PostCampaignSummaryGql`, `PostVoteWinnerGql` on `PostGql`
- `posts/graphql/post.types.ts` — make `PostGql.authorEmail` nullable

## Web (this repo)

- `CreatePostPage.tsx` — campaign `<select>`
- `PostCampaignBadge.tsx`, `PostVoteWinnerBanner.tsx`, `FeedPostCard.tsx`
- `EditPostModal.tsx`, `AdminPage.tsx` — admin threshold control
- `AdminPage.tsx` — admin post delete action + confirmation flow
- `AdminPage.tsx` — post management UX redesign (compare preview, engagement grouping, separate winner column)
- `graphql/feed.ts` — `POST_CAMPAIGN_WINNER_FIELDS`
- `graphql/feed.ts` — include `scheduledAt` in feed and post detail selections
- `graphql/admin.ts` — include `endingSoonLeadMinutes` in platform post list
- `graphql/profile.ts` — winner/claim fields in drops + voted lists
- `NotificationBell.tsx` — claim prize action + brand logo avatar for system-generated notifications
- `NotificationBell.tsx` — hide claim button after successful claim state update
- `ProfileCompareCard.tsx`, `ProfilePage.tsx` — winner/claim visibility in drops
- `MessengerPanel.tsx` — mobile Safari visual viewport keyboard handling for chat composer
- `types/feed.ts`, `mapGqlPostToFeedView.ts`
- `index.css` — campaign/filter polish + winner/claim profile badges + vote winner UI + keyboard-safe messenger spacing + post management table redesign styles
