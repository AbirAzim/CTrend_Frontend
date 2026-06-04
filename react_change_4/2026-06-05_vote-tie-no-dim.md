# Vote tie — don't dim options when they share the top result

**Date:** 2026-06-05
**Web files changed:**
- `src/components/FeedPostCard.tsx` — tie-aware winner predicates

**Backend files changed (CTrend):**
- _None._

## What changed

When a closed poll ended in a tie (e.g. 50% / 50%), **both** option images went dark
with the losing scrim — as if they'd both lost. They should be treated as joint
winners: nobody on the top result is a loser.

Root cause: winner detection only recognised a **single** leader.
- `binaryWinnerSide` → `null` when `up === down`.
- `multiWinnerIndex` → `null` when more than one option shared the top.

With `null`, every cell evaluated as `!isWinner` and received the `cx-loser-scrim`
dark overlay + `ig-compare-pct--loser` styling.

Fix — replaced both with **tie-aware predicates**:

- `isBinaryWinnerSide(side)` → `true` for **both** sides when `up === down`;
  otherwise the side with more votes.
- `isMultiWinnerIndex(idx)` → `true` for **every** option whose percentage equals the
  top percentage (covers ties for first place); genuinely lower options stay dimmed
  as real losers.

Now on a tie neither image darkens and both show the 👑 WINNER badge. Applied at all
three call sites: the binary image cells, the multi image cells, and the binary
details-breakdown row (`cx-pulse-row--final-winner` / `--final-loser`).

This is in `FeedPostCard`, which the post-detail view also reuses, so the feed and
the detail screen are both fixed.

## Manual test

1. Create a 2-option compare, get an even split, end voting → both images stay bright,
   both show 👑 WINNER, footer reads "Tie · 50% each".
2. Non-tie still works: the lower option darkens, the higher shows the crown.
3. Multi-option: two options tie for first → both bright/crowned, a lower third stays
   dimmed.
4. `npm run lint` (0 errors) + `npm run build` pass.

## Mobile app

<!-- Native UI may differ; port data model + API first. -->
`mobile/components/FeedPostCard.tsx` is a separate file — if the native app shows the
same tie-dimming, port the tie-aware winner predicates there too.
