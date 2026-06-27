# Backend: Match prediction scoring (90 + extra time)

Frontend expects this behaviour for **score predictions** on fixture-linked posts.

## Rules (product)

1. **Knockout (and any match with extra time):** if level after 90 minutes, 30 minutes of extra time is played.
2. **Prediction scoring:** compare `homeScore` / `awayScore` to the **final score after extra time**, immediately **before** any penalty shootout.
3. **Not** compared to: penalty shootout tally, or 90-minute-only score if the match went to ET.
4. **Campaign / vote winner:** picked only after the **full match ends** (including ET and penalties). Existing `processMatchResult` + `winnerScheduledAt` flow — no change to vote option logic.

## GraphQL — extend `MatchPredictionState`

```graphql
type MatchPredictionState {
  count: Int!
  predictionsOpen: Boolean!
  predictionsResolved: Boolean!
  fixtureStage: String
  predictionsPendingResult: Boolean!   # true during ET / live shootout until 90+ET score is final
  wentToExtraTime: Boolean
  wentToPenalties: Boolean
  myPrediction: MatchPrediction
}
```

### `predictionsPendingResult`

Set `true` when:

- Fixture status is `EXTRA_TIME`, `ET`, `PEN`, `PENALTY`, or equivalent live ET/shootout state, **or**
- Match finished but resolver has not yet run against the stored **90+ET** score.

Set `false` when predictions are resolved (exact match on 90+ET score).

Do **not** resolve predictions or grant prediction coins while `predictionsPendingResult === true`.

### Score source

Store on fixture or derive from API-Football:

- `scoreAfterExtraTime: { home, away }` — used for prediction winners.
- Ignore shootout goals in prediction comparison.

## Campaign winner timing

- Continue to run `processMatchResult` only when the fixture is **fully finished** (API winner known, including after penalties).
- `winnerScheduledAt` cron unchanged — random voter who picked the **winning team** (home/away), not a penalty option.

## Feed post (optional)

```graphql
fixtureStage: String
```

Already requested on `FeedPost` for knockout round badges.
