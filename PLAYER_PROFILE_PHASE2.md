# Phase 2 — Full Player Profile

Status: **PLANNED (not started).** Phase 1 (per-match player stat card) is done.
Reference design: OneFootball player page (photo header, club, career history, national team, tabs).

---

## Goal

From the Phase-1 player match card, a **"View player"** button opens a full player
profile page (web + mobile) showing:

- Header: large photo, name, current club + crest, position, nationality, age, shirt no.
- **Career history**: club-by-club rows with date ranges + appearances / goals.
- **National team**: senior + youth caps / goals.
- (Optional later) current-season stat summary; recent form.

Out of scope (OneFootball-proprietary, no data source): Followers, News, FanShop.

---

## Data source — API-Football

We use API-Football (direct, `x-apisports-key`). Relevant endpoints:

| Endpoint | Gives | Notes |
|---|---|---|
| `/players/profiles?player={id}` | name, photo, birth, nationality, height/weight, position | One call, lightweight. |
| `/players?id={id}&season={year}` | per-season stats **per team** (apps, goals, rating, etc.) | One call **per season**. Career history = aggregate across seasons. |
| `/players/teams?player={id}` | list of teams the player has played for (+ seasons) | Good index for which seasons to query. |
| `/transfers?player={id}` | transfer history (clubs + dates) | Club dates, but **no** apps/goals. |

### Career-history strategy
1. `/players/teams?player={id}` → list of `{ team, seasons[] }`.
2. For each team, sum apps/goals from `/players?id&season` across that team's seasons,
   OR (cheaper) show team + season range + last-season stats only.
3. National team rows come from the same data where `team` is a national side, or from `/players/profiles` nationality + a national-team query.

**Cost warning:** full club-by-club apps/goals can be many calls per player
(one per season). Mitigations:
- **Cache aggressively** in Mongo (a `PlayerProfile` collection) with a TTL
  (e.g. refresh weekly). Career history barely changes mid-tournament.
- Lazy-load: only fetch when a profile is first opened; serve from cache after.
- Consider capping to the last N seasons or showing per-club totals only.

---

## Backend (CTrend)

1. **Schema:** new `PlayerProfile` collection — `playerId`, `name`, `photo`,
   `birthDate`, `nationality`, `position`, `height`, `weight`, `currentTeam`,
   `careerHistory: [{ teamId, teamName, crest, from, to, apps, goals, national }]`,
   `fetchedAt`.
2. **Service:** `getPlayerProfile(playerId)`:
   - Return cached if `fetchedAt` fresh (e.g. < 7 days).
   - Else fetch from API-Football (profiles + teams + per-season), assemble,
     upsert cache, return.
   - Rate-limit / batch season calls; tolerate partial data.
3. **GraphQL:** `PlayerProfileGql` type + `playerProfile(playerId: Int!): PlayerProfileGql` query.

## Frontend

### Shared / web GraphQL
- `PLAYER_PROFILE` query in `packages/shared/src/graphql/` (+ web `src/graphql/`).

### Web (`src/`)
- Route `/player/:id` → `PlayerProfilePage.tsx`.
- Header (photo, name, club, meta), Career history list, National team list.
- Dark/light via existing `--ig-*` / `--cx-ink-rgb` tokens (same as Phase-1 card).

### Mobile (`mobile/`)
- Route `app/player/[id].tsx`.
- Same sections; themed via `useTheme()` `isDark`.

### Wire up
- Add a **"View player"** button to the Phase-1 `PlayerMatchCard` (web + mobile)
  → navigates to the profile route with the `playerId`.

---

## Open questions for when we start
- Depth confirmed = **full career history** (user chose this). Re-confirm cost is OK.
- Cache TTL value?
- Show per-club totals only, or full season-by-season breakdown under each club?
- Any tabs (Overview / Stats / Career) or a single scroll page to start?

---

## Phase 1 recap (done, for context)
- Backend parses full per-player stats from the existing `/fixtures/players` call
  into `Fixture.playerMatchStats[]`; exposed on the fixture GraphQL query.
- Web `MatchDetailPage` + mobile `app/world-cup/match/[id]`: tap a pitch player →
  `PlayerMatchCard` (rating, minutes/goals/assists tiles + key stats), dark/light.
- Omitted (not in API-Football): xG, touches in opponent's box, heatmap.
- Backfill: existing finished fixtures need a one-time `playerMatchStats` backfill
  (already run on local DB; **production needs it after deploy** — re-run the
  `/fixtures/players` backfill script or add a self-healing re-sync).
