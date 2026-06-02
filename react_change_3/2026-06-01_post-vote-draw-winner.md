# Random vote-draw winner (after voting ends)

**Date:** 2026-06-01

## Rules

| Case | Behaviour |
|------|-----------|
| Voting still open | No winner shown |
| Zero total votes | No winner (`voteWinnerPickedAt` set, no user) |
| Clear winning side | Random pick among **non-anonymous** voters on that side |
| Tie at max votes (e.g. 50/50) | Random pick among **non-anonymous** voters on **any** tied side |
| Only anonymous voters on winning side | No user winner |
| Draw runs once | `voteWinnerPickedAt` prevents re-roll |

## Backend

- Fields on `Post`: `voteWinnerUserId`, `voteWinnerOptionIndex`, `voteWinnerPickedAt`
- `PostsService.ensureVoteWinnerDrawn()` on `toGql` when `!isVotingOpen`
- `VotesService.drawRandomEligibleVoter(postId, winningOptionIndices)`
- `PostGql.voteWinner` → `PostVoteWinnerGql` with `user`, `selectedOptionIndex`, `pickedAt`

## Web

| File | Role |
|------|------|
| `PostVoteWinnerBanner.tsx` | Trophy card with winner profile link |
| `FeedPostCard.tsx` | Shown above action footer when closed + winner exists |
| `graphql/feed.ts` | `voteWinner { user { … } }` |

## Manual test

1. Create post with **voting deadline** in the near future; get 2+ users to vote (one anonymous, one not).
2. Wait until after deadline (or set short deadline).
3. Refresh feed: winner banner for identified voter on winning side only.
4. Post with no votes after close: no banner.
5. 50/50 tie: winner can be from either side (non-anonymous only).
