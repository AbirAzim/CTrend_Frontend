# Coins / Gamification — mobile implementation guide

**Date:** 2026-06-21
**Status:** Backend ✅ done · Web ✅ done · **Mobile ✅ done**

Earn coins for interactions, see a live coin counter in the top bar with a
fly-up animation on every reward, browse a public coin history + leaderboard,
and claim a daily streak bonus. This doc lists **everything** the mobile app must
implement to reach parity with the web version.

---

## Backend (CTrend) — already done, no mobile-specific work

All awards happen server-side and are idempotent (unique ledger index
`(userId, type, refId)`), so the client only needs to mirror them optimistically.

| Action | Coins | Where awarded |
|---|---|---|
| Hype a post | +5 actor · +2 author | `posts.service.setReaction` (active) |
| **Un**-hype | −5 actor · −2 author | `posts.service.setReaction` (inactive) → `CoinsService.revoke` |
| Create a post | +20 | `posts.service.create` (system/admin posts excluded) |
| Vote (first vote on a post) | +10 voter · +2 author | `votes.service` |
| Make a prediction | +15 | `match-predictions.service.submit` |
| Correct prediction | +25 | `fixtures.service` on FINISHED → `awardWinners` |
| Campaign winner (drawn from voters) | +25 | `world-cup-campaign.service.processMatchResult` |
| Post vote-draw winner | +15 | `posts.service` vote-close draw |
| Comment / reply | +3 | `comments.service.create` |
| Daily streak | +5 | `claimDailyCoins` mutation |
| Friend invite accepted | +50 | `invitations.service.markAccepted` |

Key rules to mirror in the UI:
- **Earn once per target.** Re-voting / switching options / editing a prediction
  does **not** re-award. Only the *first* vote and *first* prediction pay out.
- **Hype is symmetric.** Hype = +5, un-hype = −5 (balance clamped at 0, never
  negative). Re-hyping pays again — but toggling can never accumulate past +5.
- **Author rewards are passive** (POST_HYPED/POST_VOTED, +2). They land on the
  *other* user, so there's no animation for the author; their counter just
  reflects it on next load/refresh.

### GraphQL (server schema — already deployed)

```graphql
type Query {
  myCoins: Int!                                            # auth required
  coinHistory(userId: ID, skip: Int, take: Int): [CoinHistoryItem!]!   # public; defaults to viewer
  coinLeaderboard(take: Int): [CoinLeaderboardEntry!]!
}
type Mutation {
  claimDailyCoins: DailyStreak!                            # auth required
}
type CoinHistoryItem { id: ID!  type: String!  amount: Int!  createdAt: DateTime! }
type CoinLeaderboardEntry { rank: Int!  coins: Int!  user: User }
type DailyStreak { awarded: Int!  balance: Int!  streakDays: Int! }
# User gained a new field:  coins: Int
```

`coinHistory` with no `userId` returns the viewer's own history (wrapped in
`OptionalJwtGqlGuard`); pass a `userId` to view someone else's (public).

---

## Web reference files (source of truth for behaviour)

Port the **behaviour** of these, not the DOM:

- `src/graphql/coins.ts` — `MY_COINS`, `COIN_HISTORY`, `COIN_LEADERBOARD`, `CLAIM_DAILY_COINS`
- `src/lib/coins.ts` — `COIN_AMOUNTS`, `COIN_META`, event dispatchers
- `src/context/CoinsContext.tsx` — balance state, fly animation, pulse/drop, reconcile
- `src/components/CoinCounter.tsx` — top-bar pill
- `src/pages/CoinsPage.tsx` — history / leaderboard / how-to-earn / daily claim
- `src/components/FeedPostCard.tsx` — award dispatch on hype/unhype + vote
- `src/components/MatchPrediction.tsx` — award on first prediction
- `src/components/PostCommentsPanel.tsx` — award on comment/reply
- `src/pages/CreatePostPage.tsx` — award on post create
- `src/pages/UserProfilePage.tsx` — `¢ coins` stat linking to `/coins/:userId`
- `src/index.css` — `.cx-coin-*` / `.cx-coins-*` styles + keyframes

---

## Mobile files to add / change

GraphQL ops live in the **shared package** (`@ctrend/shared/graphql/...`) that
mobile already imports from. Add coins there so both apps share one definition.

**Add:**
- `packages/shared/src/graphql/coins.ts` — copy the 4 ops from `src/graphql/coins.ts` (already valid GraphQL, framework-agnostic).
- `packages/shared/src/lib/coins.ts` — `COIN_AMOUNTS` + `COIN_META` (the platform-agnostic constants only — **not** the `window.dispatchEvent` helpers; those are web-only). Mobile already imports other helpers from `@ctrend/shared/lib/...`.
- `mobile/context/CoinsContext.tsx` — RN port of the provider (balance + event bus + Animated fly overlay).
- `mobile/components/CoinCounter.tsx` — the top-bar pill.
- `mobile/app/coins/index.tsx` and `mobile/app/coins/[userId].tsx` — the coins hub screen (expo-router).

**Edit:**
- `mobile/app/_layout.tsx` — wrap the tree in `<CoinsProvider>` (alongside the other providers).
- `mobile/app/tabs/index.tsx` — render `<CoinCounter />` in `FeedTopBar` (between the bell and logout, see line ~95).
- `mobile/components/FeedPostCard.tsx` — dispatch earn on hype, spend on un-hype, earn on first vote.
- `mobile/components/MatchPrediction.tsx` — dispatch earn on first prediction.
- `mobile/components/FeedInlineComments.tsx` (and the `app/comments/[postId].tsx` composer) — dispatch earn on comment/reply.
- `mobile/app/tabs/create.tsx` — dispatch earn on successful post create.
- `mobile/app/profile/[userId].tsx` — add a `¢ coins` stat that routes to `/coins/[userId]`.

---

## 1. Coins constants (`@ctrend/shared/lib/coins.ts`)

```ts
export const COIN_AMOUNTS = {
  HYPE: 5, VOTE: 10, PREDICTION: 15, POST: 20, COMMENT: 3,
  POST_HYPED: 2, POST_VOTED: 2, PREDICTION_CORRECT: 25,
  CAMPAIGN_WINNER: 25, VOTE_WINNER: 15, DAILY_STREAK: 5, INVITE: 50,
} as const;
export type CoinType = keyof typeof COIN_AMOUNTS;

export const COIN_META: Record<CoinType, { label: string; icon: string }> = {
  HYPE: { label: "Hyped a post", icon: "🔥" },
  VOTE: { label: "Voted", icon: "🗳️" },
  PREDICTION: { label: "Made a prediction", icon: "🎯" },
  POST: { label: "Created a post", icon: "✨" },
  COMMENT: { label: "Commented", icon: "💬" },
  POST_HYPED: { label: "Your post got hyped", icon: "🔥" },
  POST_VOTED: { label: "Your post got a vote", icon: "🗳️" },
  PREDICTION_CORRECT: { label: "Nailed a prediction", icon: "🏆" },
  CAMPAIGN_WINNER: { label: "Won a campaign", icon: "👑" },
  VOTE_WINNER: { label: "Won a vote draw", icon: "🎁" },
  DAILY_STREAK: { label: "Daily streak bonus", icon: "📅" },
  INVITE: { label: "Friend joined", icon: "🤝" },
};
```

> `CAMPAIGN_WINNER` and `VOTE_WINNER` are **passive** (awarded server-side when a
> winner is drawn) — no fly animation; the counter reflects them on next refresh,
> and they appear in History.

## 2. CoinsContext (mobile) — `mobile/context/CoinsContext.tsx`

React Native has **no `window` / DOM / CustomEvent**, so replace the web's
`window.dispatchEvent(...)` bus with a tiny in-module emitter exported from the
context module. Everything else mirrors `src/context/CoinsContext.tsx`.

Responsibilities:
- Query `MY_COINS` (skip when signed out), keep `balance` in state, expose
  `refresh()`. `cache-and-network`.
- Expose `awardCoins(amount, fromXY?)` and `spendCoins(amount)` methods (the
  RN equivalent of the web `dispatchCoinEarned` / `dispatchCoinSpent`).
- On `awardCoins`: **trigger haptic** (`expo-haptics` `Haptics.notificationAsync(Success)` or `Vibration.vibrate(8)` to match existing card haptics), spawn 3–6 `Animated` coin sprites that travel from the action point to the counter, bump `balance` (+amount) as they land with a pulse, then debounce a `refetch()` (~2.5 s) to reconcile.
- On `spendCoins`: decrement `balance` (clamp ≥ 0), play a "drop" pulse + light
  haptic, debounce `refetch()`.
- Register the counter's screen position via `measureInWindow` (RN has no
  `getBoundingClientRect`); store `{x, y}` so sprites know the target.

Animation: use `Animated.Value`s + `Animated.timing` with `translateX/translateY`
interpolations and a `rotateY` flip (or scale-flip on `transform: [{ scaleX }]`
since RN `rotateY` perspective is limited). Render sprites in an absolutely-
positioned, `pointerEvents="none"` overlay near the provider root. The arc can be
two sequenced timings (up then to-counter) to match the web's mid-bounce.

Expose via `useCoins()`: `{ balance, awardCoins, spendCoins, refresh, registerCounter }`.

> Provider order in `app/_layout.tsx`: put `<CoinsProvider>` **inside** Auth +
> Apollo so it can query and read auth, same as web (`main.tsx`).

## 3. Coin counter (`mobile/components/CoinCounter.tsx`)

A golden pill: coin disc (`¢` in a radial-gold circle) + balance number.
- `measureInWindow` on mount/layout → `registerCounter({x,y})`.
- `onPress` → `router.push("/coins")`.
- Pulse (scale up, gold ring) when balance increases; drop (scale down, red
  ring) when it decreases. Drive these from `useCoins()` pulse/drop flags or a
  local `Animated` triggered by balance deltas.
- Place in `FeedTopBar` (`app/tabs/index.tsx` ~line 95), signed-in only.

## 4. Coins hub screen (`mobile/app/coins/index.tsx` + `[userId].tsx`)

Mirror `src/pages/CoinsPage.tsx`:
- **Hero card**: big coin, "Your coins" + balance (self) or "Coins earned" +
  loaded-history total (other user). Self only: **📅 Claim daily bonus** button →
  `claimDailyCoins`; toast `+5 coins! N-day streak 🔥` or "Already claimed today".
- **Tabs**: History · 🏆 Leaderboard · How to earn (segmented control).
- **History** (`COIN_HISTORY`, `userId` from route param or null=self): list rows
  = `COIN_META[type].icon` + label + relative time + `+amount`. Paginate with
  `fetchMore` (PAGE = 30; "load more" when `length % 30 === 0`).
- **Leaderboard** (`COIN_LEADERBOARD`, take 50 — top 50 earners): rank/medal (🥇🥈🥉), avatar,
  name, `¢ coins`; highlight the signed-in user ("you"); each row routes to
  `/coins/[user.id]`.
- **How to earn**: static list of `COIN_META` + `COIN_AMOUNTS` (high → low) to
  motivate earning.

Use `FlatList`, `useTheme()` colors, and `normalizeProfileImageUrl` (already in
shared). Match the dark-theme styling already used by other mobile screens.

## 5. Award dispatch points (mirror web exactly)

**FeedPostCard hype/unhype** — only animate on the activating tap; spend on
un-hype:
```ts
// inside the hype toggle, after the mutation resolves:
if (nextActive) awardCoins(COIN_AMOUNTS.HYPE, hypeBtnXY); // + haptic inside awardCoins
else            spendCoins(COIN_AMOUNTS.HYPE);
```
Capture the button position with `measureInWindow` (or pass the touch event's
`pageX/pageY`) **before** the await.

**FeedPostCard vote** — award only the *first* vote on a post (binary + multi +
poll). Guard with "viewer had no prior vote" exactly like web
(`curVote === null` / `activeMySelectedOptionIndex === null`). Switching sides /
options must **not** award. Origin = the tapped option cell.

**MatchPrediction** — award `PREDICTION` only when `!mine` (first submission);
edits don't re-award.

**Comments** — award `COMMENT` on each successful top comment and reply.

**Create post** — award `POST` after a successful create (skip admin/system
posts, matching the web `!useSystemMutate` guard).

> All amounts are optimistic; the debounced `refetch()` of `MY_COINS` reconciles
> with the server, which is the source of truth (and enforces once-per-target).

## 6. Profile entry point

In `mobile/app/profile/[userId].tsx`, add a `¢ coins` stat (next to
compares/votes/friends) showing `profile.coins ?? 0`, routing to
`/coins/[profile.id]`. The `getUserProfile` query already returns `coins`
(field added server-side); add `coins` to the mobile profile query selection if
it isn't selected yet.

## 7. Haptics (mobile-specific, per original request)

- **Earn**: success haptic when coins fly (`Haptics.notificationAsync(Success)`
  or the existing `Vibration.vibrate(8)` used on vote).
- **Spend (un-hype)**: light/warning haptic.
- **Claim daily**: success haptic.
- The "see who hyped" long-press already uses `Vibration.vibrate(30)` — keep that
  pattern for consistency.

---

## Manual test (mobile)

1. Hype a post → coins fly to the counter, counter pops, haptic fires, balance +5.
2. Un-hype the same post → counter drops (red), balance −5 (never below 0).
3. Re-hype → +5 again; rapid toggle never accumulates past +5.
4. First vote on a post → +10, fly from the tapped option. Switch option → **no** extra coins.
5. Submit a prediction → +15. Edit it → **no** extra coins.
6. Comment / reply → +3 each.
7. Create a post → +20 (admin/system post → none).
8. Tap counter → coins hub. Claim daily → +5 + streak toast; claim again same day → "already claimed".
9. History shows your entries with correct icons/labels/amounts; pagination works.
10. Leaderboard ranks correctly, "you" highlighted, rows open that user's history.
11. Open another user's profile → `¢ coins` stat → their public history loads.
12. Author of a hyped/voted post sees +2 on next refresh (no animation — passive).

---

## Notes / gotchas

- **No `window` in RN** — use the context emitter, not `dispatchCoinEarned`.
- **Positions** — `measureInWindow((x,y,w,h) => ...)` instead of
  `getBoundingClientRect`; coordinates are already screen-space.
- **Reconcile** — never trust the optimistic number long-term; always
  `refetch(MY_COINS)` shortly after. The server clamps at 0 and dedupes.
- **expo-router** — the hub is `/coins` (self) and `/coins/[userId]` (others),
  mirroring the web routes.
- Keep `@ctrend/shared/graphql/coins.ts` the single source for the ops so web and
  mobile can't drift.
