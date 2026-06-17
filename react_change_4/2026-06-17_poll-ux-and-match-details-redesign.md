# 2026-06-17 — Full Session Design Sync (Web → Mobile)

> **Web confirmed working:** 2026-06-17  
> **Phases covered:** 38 · 39 · 40 · 41 · 42 · 43  
> **Workflow:** implement → APK build → device test → you confirm → mark ✅ COMPLETE

---

## Summary of all web changes this session

| # | Change | Mobile work needed |
|---|--------|--------------------|
| 1 | Post card: `margin 12px`, `border-radius 22px`, soft border, no hover stripe | Verify / tweak border |
| 2 | Campaign ribbon → neutral single-line pill matching mobile design | Verify mobile already matches |
| 3 | Vote hints removed everywhere (inline + details panel) | Remove any static hint text |
| 4 | Voted poll option: `2px` border at `0.75` opacity | Change `borderWidth: 1.5 → 2` |
| 5 | Winner poll option: soft amber `0.35` border, no inset ring, `0.10` fill | Add `pollRowWinner` style |
| 6 | WorldCupFloating card rows redesigned: teams left / time right (upcoming), centered score grid (results), winner bright / loser dimmed | Redesign WorldCup screen rows |
| 7 | Match score chip in post header → tappable when `fixtureId` present | Make `matchScoreBadge` a Pressable |
| 8 | New separator row "⚽ Full match report & lineups ›" in post body | Add below winner banner |
| 9 | New `MatchDetailPage` — 3 tabs: Overview (events), Lineups (pitch), Stats (bars) | New screen `world-cup/match/[id]` |
| 10 | WorldCupPage fixtures clickable → match detail; tab param `?tab=results` | Make fixture rows tappable |
| 11 | New `WorldCupBanner` in feed — live/upcoming/recent match, dismissable | Add to FlatList header |

---

## Phase 38 — Post Card Visual Polish (verify & apply)

**Source:** `src/index.css` `.ig-feed`, `.ig-post`

### Web final values

```css
.ig-feed { padding: 0 0 14px; }   /* no horizontal padding — cards have their own margin */

.ig-post {
  border-radius: 22px;
  margin: 0 12px 14px;
  border: 1px solid rgb(var(--cx-ink-rgb) / 0.08);   /* very soft neutral hairline */
}
/* NO ::before left accent stripe — removed entirely */
```

### Mobile (FeedPostCard.tsx) — verify then apply

Check current `card` style in `FeedPostCard.tsx`. It should already have `borderRadius: 22` and `marginHorizontal: 12` from earlier work. **Add the soft border** if not present:

```ts
card: {
  borderRadius: 22,
  marginHorizontal: 12,
  marginBottom: 14,
  borderWidth: 1,
  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  // ... existing shadow/elevation
},
```

No hover stripe exists on mobile — nothing to remove.

### Test cases
1. Cards have visible but subtle `1px` border outline — not harsh, not invisible.
2. Cards have `12px` margin on each side — breathing room between card and screen edge.
3. No accent stripe or highlight appears when pressing a card.

---

## Phase 39 — Campaign Ribbon: Verify Mobile Matches New Web Design

**Source:** `src/components/PostCampaignBadge.tsx`, `src/index.css`

### Web new design (flat single-line pill)

```
[ 🎯  Campaign  World Cup Fever 2026  · 100 BDT  › ]
```

- `border-radius: 999px` — full pill
- Neutral background: `rgba(ink, 0.04)` — not gold, not gradient
- Neutral border: `rgba(ink, 0.10)`
- Single flex row: `🎯` · `Campaign` kicker · name · prize · `›` chevron
- No banner image bg

### Mobile (PostCampaignBadge.tsx) — verify

The mobile was built to this design already (this is what the web was updated to MATCH). Open the existing `mobile/components/PostCampaignBadge.tsx` and confirm it renders a single-line pill row. If it still has a card/gradient style update it to:

```tsx
<Pressable
  style={styles.pill}
  onPress={() => router.push(`/campaign/${campaign.slug}` as any)}
>
  <Text style={styles.emoji}>🎯</Text>
  <Text style={styles.kicker}>Campaign</Text>
  <Text style={styles.name} numberOfLines={1}>{campaign.name}</Text>
  {campaign.prizePerWinner > 0 && (
    <Text style={styles.prize}>· {campaign.prizePerWinner} BDT</Text>
  )}
  <Text style={styles.chevron}>›</Text>
</Pressable>
```

```ts
pill: {
  flexDirection: 'row', alignItems: 'center', gap: 6,
  marginHorizontal: 14, marginBottom: 10,
  paddingHorizontal: 10, paddingVertical: 7,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
},
emoji: { fontSize: 12 },
kicker: { fontSize: 9.5, fontWeight: '800', color: c.subtext, letterSpacing: 0.8, textTransform: 'uppercase' },
name: { flex: 1, fontSize: 12.5, fontWeight: '600', color: c.text },
prize: { fontSize: 11.5, fontWeight: '500', color: c.subtext },
chevron: { fontSize: 14, color: c.subtext, opacity: 0.5 },
```

### Test cases
1. Campaign badge on a post is a single horizontal pill — not a card, no gold gradient.
2. Name truncates with `…` if too long.
3. Prize amount shows when > 0; hidden otherwise.
4. Tap navigates to the campaign screen.

---

## Phase 40 — Poll UX Polish (hints + border tuning)

**Source:** `src/components/FeedPostCard.tsx`, `src/index.css`

### Web changes

**A. Vote hints removed:**
- `cx-tap-to-vote-hint` element deleted from poll options section (showed "Tap an option to cast your vote" / "Vote recorded")
- Same element deleted from compare images section
- In the post footer details panel, the pre-close hints removed ("Tap a side to vote — switch anytime"). Only the post-close lines kept ("Final: X wins" / "Voting closed")

**B. Voted option border more prominent:**
```css
.cx-poll-option--picked {
  border-color: rgb(var(--cx-opt-rgb) / 0.75);
  border-width: 2px;    /* was 1.5px */
}
```

**C. Winner option softer:**
```css
.cx-poll-option--winner {
  border-color: rgba(245, 158, 11, 0.35);   /* was #f59e0b full saturation */
  /* removed: box-shadow: 0 0 0 1px #f59e0b inset */
}
.cx-poll-option--winner .cx-poll-option-fill {
  background: linear-gradient(90deg, rgba(245,158,11,0.10), rgba(245,158,11,0.05));
  /* was 0.26 → 0.14 */
}
```

### Mobile changes (FeedPostCard.tsx)

**A. Remove static hint text** — search for any `<Text>` elements containing "tap", "vote", "switch", "anytime" near the poll options or compare images that are static (not the animated `VoteCoachmark`). The `VoteCoachmark` animation (first-run gesture demo) is **fine to keep**. Only remove persistent text labels.

**B. Picked option border:**
```ts
// Change:
pollRowPicked: { borderColor: c.accent, borderWidth: 1.5 },
// To:
pollRowPicked: { borderColor: c.accent, borderWidth: 2 },
```

**C. Winner option — new style:**

In `makeStyles` / inline styles, add:
```ts
pollRowWinner: {
  borderColor: 'rgba(245, 158, 11, 0.35)',
  borderWidth: 1.5,
},
```

Update the fill logic in the poll row render (around line 2405):
```tsx
{pollShowResults && leadColor ? (
  <View
    pointerEvents='none'
    style={[
      st.pollFill,
      isWinner
        ? { width: `${pct}%`, backgroundColor: 'rgba(245,158,11,0.10)' }
        : { width: `${pct}%`, backgroundColor: leadColor, opacity: 0.2 },
    ]}
  />
) : null}
```

And in the `<Pressable>` style array:
```tsx
<Pressable
  style={[
    st.pollRow,
    isLoser && st.pollRowLoser,
    picked && st.pollRowPicked,
    isWinner && !picked && st.pollRowWinner,
  ]}
  ...
>
```

> When `isWinner && picked` (user voted for the winning option), `pollRowPicked` takes priority — shows accent border, not amber.

### Test cases
1. No "Tap to vote" text anywhere in feed (VoteCoachmark first-run animation still works).
2. Voted option row has a clearly visible `2px` accent border — noticeably thicker than unvoted rows.
3. Winner option (finished match) has a soft amber border — readable, not harsh.
4. Fill bar on winner row is a faint amber wash, not a bright orange block.
5. Voted+winner row shows accent border (not amber) — user's pick is highlighted.

---

## Phase 41 — Match Details Entry Points in FeedPostCard

**Source:** `src/components/FeedPostCard.tsx`, `src/graphql/feed.ts`, `src/types/feed.ts`, `src/lib/mapGqlPostToFeedView.ts`

### Web changes

**A. Shared data additions** (already in web):
```graphql
# In FEED_POSTS fragment:
fixtureId
lineupAvailable
```
```ts
// types/feed.ts:
fixtureId?: string | null;
lineupAvailable?: boolean | null;
// mapped in mapGqlPostToFeedView.ts
```

**B. Score chip → tappable when fixture available:**

When `post.fixtureId` exists and match has started (IN_PLAY, PAUSED, FT, AET, PEN, FINISHED), the score chip becomes a `<button>` that navigates to `/world-cup/match/${post.fixtureId}`. Otherwise stays as non-interactive `<span>`.

**C. Separator row in post body:**

Shown when: `isMatchPost && post.fixtureId && (isMatchFinished || isLiveMatch || post.lineupAvailable)`

```
  ─────────────────────────────────────
  ⚽  Full match report & lineups    ›
```

For live matches: "Live match stats & lineups"  
No border box, no background — just a full-width tap row with a hairline top divider.

### Mobile changes

**Step 1: Add to shared package**

In `packages/shared/src/graphql/feed.ts`, add to the feed post fragment:
```graphql
fixtureId
lineupAvailable
```

In `packages/shared/src/types/feed.ts` (or wherever `FeedPostView` is defined):
```ts
fixtureId?: string | null;
lineupAvailable?: boolean | null;
```

In `packages/shared/src/lib/mapGqlPostToFeedView.ts`:
```ts
fixtureId: p.fixtureId ?? null,
lineupAvailable: p.lineupAvailable ?? false,
```

**Step 2: Tappable score chip**

In `mobile/components/FeedPostCard.tsx`, find the `matchScoreBadge` View (around line 2310). Wrap it conditionally:

```tsx
const canOpenMatch =
  Boolean(post.fixtureId) && (isMatchFinished || isLiveMatch || post.lineupAvailable);

{post.matchScore && post.matchScore.status !== 'TIMED' ? (
  canOpenMatch ? (
    <Pressable
      style={st.matchScoreBadge}
      onPress={(e) => {
        e.stopPropagation?.();
        router.push(`/world-cup/match/${post.fixtureId}` as any);
      }}
      hitSlop={8}
    >
      {post.matchScore.status === 'IN_PLAY' ? <LiveDot /> : null}
      <Text style={st.matchScoreText}>
        {/* existing score text */}
      </Text>
    </Pressable>
  ) : (
    <View style={st.matchScoreBadge}>
      {/* same non-interactive content */}
    </View>
  )
) : null}
```

**Step 3: Separator row**

After the `showMatchCalculating` / `showMatchLive` / `showCampaignWinner` block and before the two-zone action rail, add:

```tsx
{isMatchPost && post.fixtureId && (isMatchFinished || isLiveMatch || post.lineupAvailable) ? (
  <Pressable
    style={({ pressed }) => [
      matchRowSt.row,
      pressed && matchRowSt.pressed,
    ]}
    onPress={() => router.push(`/world-cup/match/${post.fixtureId}` as any)}
  >
    <Text style={matchRowSt.icon}>⚽</Text>
    <Text style={matchRowSt.label}>
      {isLiveMatch ? 'Live match stats & lineups' : 'Full match report & lineups'}
    </Text>
    <Text style={matchRowSt.arrow}>›</Text>
  </Pressable>
) : null}
```

Styles (inside `makeStyles` with `isDark` and `c`):
```ts
matchRowSt = {
  row: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    backgroundColor: 'transparent',
  },
  pressed: { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
  icon: { fontSize: 16 },
  label: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: c.text },
  arrow: { fontSize: 18, fontWeight: '700' as const, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' },
};
```

### Test cases
1. A finished match post (e.g. FT 3–0) — the score chip "FT 3–0 X vs Y" in the header is tappable (responds to press, shows pressed state).
2. Tapping the score chip navigates to the match detail screen.
3. The "⚽ Full match report & lineups ›" row appears below the winner banner on finished posts.
4. Tapping the row navigates to the match detail screen.
5. On a live match post, the row shows "⚽ Live match stats & lineups ›".
6. A non-match post has no row and no tappable chip.
7. Tapping inside a list card does NOT also navigate to the post detail (stopPropagation).

---

## Phase 42 — Match Detail Screen (new)

**Source:** `src/pages/MatchDetailPage.tsx`, `src/graphql/worldcup.ts`

### What the web screen shows

**Route:** `/world-cup/match/:id`  
**Data:** `WORLD_CUP_FIXTURE_DETAILS` query — `worldCupFixture(id)` returns:
- Team info (name, shortName, crest), kickoff, status, minute, stage, group
- Score (home, away, winner), venue, campaignPostId
- `events[]` — Goals, Cards, Substitutions, VAR with time + player + assist
- `lineups[]` — per team: formation string, startXI (name, number, pos, grid, photo), substitutes, coach
- `stats[]` — type + home + away values (e.g. "Ball Possession 55% / 45%")
- `playerRatings[]` — playerId, name, team, rating (float string), photo

**3 tabs:**

**Overview tab:**
- Match events listed newest-first (reverse chronological): minute label + event icon + player name + assist
- Event icons: ⚽ goal / colored card rectangle / ▲▼ substitution / VAR chip
- Own goals labelled "(OG)", penalty goals "(P)"
- Half-time score derived from events at minute ≤ 45
- If no events and live: "Syncing live events…" spinner
- If no events and finished: "No event data available."

**Line-up tab:**
- Per team: formation (e.g. 4-3-3) + coach name
- Pitch grid: parse `grid` field (e.g. "1:1") → row:col position; players drawn as name pills on a green pitch
- Player rating badge (colored dot) on pitch if rating available
- Bench: list of substitutes with number, name, position, rating badge
- Man of the Match: highest-rated player shown in an amber card (photo, name, team, rating)

**Stats tab:**
- For each stat: home value on left, stat name centered, away value on right
- Winner side shown as colored pill (green bg), loser side as plain muted text
- Stats include: Ball Possession, Total Shots, Shots on Goal, Corner Kicks, Fouls, Yellow Cards, Red Cards, Offsides, etc.

**Header (all tabs):**
- Team crests + names + final score large, centered
- Goal scorers listed below each team name (e.g. "Messi 12', 34'")
- FT/Live badge + minute for live

### Mobile: new screen `mobile/app/world-cup/match/[id].tsx`

**Add to shared package first:**

In `packages/shared/src/graphql/worldcup.ts` (create if doesn't exist, else in the shared worldcup file):
```graphql
export const WORLD_CUP_FIXTURE_DETAILS = gql`
  query WorldCupFixtureDetails($id: ID!) {
    worldCupFixture(id: $id) {
      id
      homeTeam { name shortName crest }
      awayTeam { name shortName crest }
      kickoff status minute stage group
      score { home away winner }
      venue { name city }
      campaignPostId hasDrawOption matchEndedAt
      events {
        time timeExtra team type detail
        player { id name }
        assist { id name }
      }
      lineups {
        team formation
        startXI { id name number pos grid photo }
        substitutes { id name number pos grid photo }
        coach { id name photo }
      }
      stats { type home away }
      playerRatings { playerId name team rating photo }
      detailsSyncedAt
    }
  }
`;
```

**Screen structure (mobile/app/world-cup/match/[id].tsx):**

```
┌─────────────────────────────────┐
│ ← Back           FT            │  ← header with back + status
│                                 │
│  🇦🇷 Argentina  3 — 0  Algeria 🇩🇿 │  ← team crests + big score
│  Messi 12' 45'      —          │  ← goal scorers
│  San Juan Stadium, San Juan     │  ← venue
│─────────────────────────────────│
│  Overview │ Lineups │  Stats   │  ← tab row
│─────────────────────────────────│
│  [tab content scrollable]       │
└─────────────────────────────────┘
```

**Overview tab** (simplest — implement this first):
- FlatList of events sorted newest-first
- Each row: `[minute]  [event icon]  [player name]` — right-aligned for away team events
- Goal icon: ⚽ or ⚽ OG or ⚽ P
- Card: colored `View` rectangle (yellow/red)
- Sub: ▲ IN / ▼ OUT with names

**Lineups tab** (medium complexity):
- Skip the pitch grid on mobile (too complex for first version) — use simple FlatList per team
- Show: formation label, then each startXI player (number + name + position + rating), then "Subs:" header, then bench players
- Coach row at bottom
- Man of the Match amber card at top if ratings exist

**Stats tab** (simplest — do this last):
- ScrollView of stat rows
- Each row: home value · stat label · away value
- Winner side text colored green, loser text muted gray
- Possession shown as a split bar

**Navigation to this screen:**
- From `FeedPostCard` separator row or score chip (Phase 41)
- From `WorldCupPage` fixture rows (Phase 43)
- From notification `LINEUP_AVAILABLE` type — already handled in `NotificationBell` on web; mobile notification screen should navigate here for `LINEUP_AVAILABLE` type

**In `mobile/app/notifications/index.tsx`** — add handling:
```ts
// Add LINEUP_AVAILABLE to POST_NOTIF_TYPES or handle separately:
if (n.type === 'LINEUP_AVAILABLE' && n.referenceId) {
  router.push(`/world-cup/match/${n.referenceId}?tab=lineup` as any);
  return;
}
```
Also add icon: `case 'LINEUP_AVAILABLE': return '⚽';`

### Test cases
1. Tap "Full match report & lineups" row on a finished match post → Match Detail screen opens.
2. Screen shows correct team names, crests, and final score at the top.
3. Overview tab shows match events in reverse order (last event first).
4. Goals show ⚽ + player name + minute; own goals show (OG).
5. Yellow card shows yellow rectangle; red card shows red rectangle.
6. Lineups tab shows starting XI per team with numbers and positions.
7. Stats tab shows head-to-head values; possession winner is highlighted.
8. Tapping a `LINEUP_AVAILABLE` notification navigates to this screen (Lineup tab).

---

## Phase 43 — World Cup Screen: Redesigned Rows + Clickable Fixtures

**Source:** `src/pages/WorldCupPage.tsx`, `src/components/WorldCupFloating.tsx`

### Web changes

**WorldCupPage:** Live and finished fixtures are now clickable — `onClick={() => navigate('/world-cup/match/${fixture.id}')}`; they get `cursor: pointer` and a hover highlight.

**WorldCupFloating card row redesign:**

*Upcoming rows:*
```
[ 🇦🇷  Argentina  v  Algeria  🇩🇿 ]    [ 18:00  in 2h ]  [ Vote ]
^── wc-fr-teams (flex: 1) ──────────^    ^── time block ──^
```

*Results rows (1fr auto 1fr grid):*
```
[ 🇦🇷  Argentina ]    [  3 – 0  ]    [ Algeria  🇩🇿 ]
  winner = bright         FT          loser = dimmed
```
- Winner team name: full brightness (`#ffffff` or `#f1f5f9`)
- Loser team name: dimmed (`#4b5563`)
- FT label centered below the score
- Score styled large and hero

*Live rows:*
```
[ 🇦🇷  Argentina  v  Algeria  🇩🇿 ]    [ LIVE 67' ]   [ 2–1 ]
```

### Mobile changes (world-cup.tsx)

**A. Make live/finished rows tappable:**
```tsx
// Finished/live fixture rows:
<Pressable
  style={[styles.fixtureRow, (live || finished) && styles.fixtureRowTappable]}
  onPress={() => (live || finished) && router.push(`/world-cup/match/${fixture.id}` as any)}
  disabled={!live && !finished}
>
```

**B. Redesign upcoming fixture rows:**
```tsx
// Upcoming row layout:
<View style={styles.frTeams}>
  {homeTeam.crest && <Image source={{ uri: homeTeam.crest }} style={styles.frFlag} />}
  <Text style={styles.frName}>{homeTeam.shortName}</Text>
  <Text style={styles.frVs}>v</Text>
  <Text style={styles.frName}>{awayTeam.shortName}</Text>
  {awayTeam.crest && <Image source={{ uri: awayTeam.crest }} style={styles.frFlag} />}
</View>
<View style={styles.frTimeBlock}>
  <Text style={styles.frTime}>{formatTime(kickoff)}</Text>
  <Text style={styles.frCd}>{countdownToKickoff(kickoff)}</Text>
</View>
{canVote && <Text style={styles.frVote}>Vote</Text>}
```

Styles:
```ts
frTeams: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
frFlag: { width: 18, height: 18, borderRadius: 3 },
frName: { fontSize: 12, fontWeight: '600', color: c.text },
frVs: { fontSize: 10, color: c.subtext, fontWeight: '500' },
frTimeBlock: { alignItems: 'flex-end', gap: 2 },
frTime: { fontSize: 11.5, fontWeight: '700', color: c.text },
frCd: { fontSize: 9.5, color: c.subtext },
frVote: { fontSize: 10, fontWeight: '800', color: c.accent, borderWidth: 1, borderColor: c.accent, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 2 },
```

**C. Redesign results rows (3-column layout):**
```tsx
// Results row — use flex with equal-width home/away:
<View style={styles.frResultRow}>
  <View style={styles.frHome}>
    {homeTeam.crest && <Image source={{ uri: homeTeam.crest }} style={styles.frFlag} />}
    <Text style={[styles.frName, score?.winner === 'HOME_TEAM' ? styles.frNameWin : styles.frNameLoss]}>
      {homeTeam.shortName}
    </Text>
  </View>
  <View style={styles.frScoreBlock}>
    <Text style={styles.frScore}>{score?.home ?? '–'} – {score?.away ?? '–'}</Text>
    <Text style={styles.frFT}>FT</Text>
  </View>
  <View style={styles.frAway}>
    <Text style={[styles.frName, score?.winner === 'AWAY_TEAM' ? styles.frNameWin : styles.frNameLoss]}>
      {awayTeam.shortName}
    </Text>
    {awayTeam.crest && <Image source={{ uri: awayTeam.crest }} style={styles.frFlag} />}
  </View>
</View>
```

Styles:
```ts
frResultRow: { flexDirection: 'row', alignItems: 'center' },
frHome: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
frAway: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'flex-end' },
frScoreBlock: { alignItems: 'center', paddingHorizontal: 10 },
frScore: { fontSize: 13, fontWeight: '900', color: c.text },
frFT: { fontSize: 9, color: c.subtext, fontWeight: '600', marginTop: 1 },
frNameWin: { color: c.text, fontWeight: '700' },
frNameLoss: { color: c.subtext, fontWeight: '500', opacity: 0.65 },
```

**D. Tab param support:**
```tsx
// In world-cup.tsx:
const { tab } = useLocalSearchParams<{ tab?: string }>();
const [activeTab, setActiveTab] = useState<'fixtures' | 'results' | 'standings'>(
  tab === 'results' || tab === 'standings' ? tab : 'fixtures'
);
```

### Test cases
1. Tapping a live or finished fixture row on the World Cup screen → opens match detail screen.
2. Upcoming fixture rows show `[flag] Name v Name [flag]` on left, time+countdown on right.
3. Results rows show score centered, home on left, away on right, winner bright, loser dimmed.
4. FT label shows below the score in results rows.
5. Opening `/world-cup?tab=results` (e.g. from WorldCupBanner) defaults to the Results tab.

---

## Phase 44 — World Cup Feed Banner

**Source:** `src/components/WorldCupBanner.tsx`, `src/pages/FeedPage.tsx`

### What the web banner shows

A dismissable full-width card shown above the feed (inside the feed scroll, not fixed). Shows the most relevant match in priority order: **live match > next upcoming > most recent result**.

```
┌──────────────────────────────────────────┐
│  🏆  LIVE  [red dot]  Argentina v Algeria   Watch Live → [✕] │  ← live variant
│  🏆  Next Match  🇦🇷 Argentina  vs  Algeria 🇩🇿  18:00        View →   [✕] │  ← upcoming
│  🏆  Recent Result  🇦🇷 Argentina  3–0  Algeria 🇩🇿          See Result → [✕] │  ← result
└──────────────────────────────────────────┘
```

- Dark navy background + green border (red border when live)
- Left side: trophy img + label chip + match row (flags + teams + score/time)
- Right side: CTA text + dismiss ✕ button
- Dismissable per-session (localStorage / AsyncStorage)
- **Auto re-shows when a match goes live** even if previously dismissed

### Mobile: new `WorldCupBanner` component

**Create:** `mobile/components/WorldCupBanner.tsx`

```tsx
import { useState, useEffect } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useQuery } from '@apollo/client';
import { ACTIVE_CAMPAIGNS } from '@ctrend/shared/graphql/campaigns';
import { WORLD_CUP_FIXTURES } from '@ctrend/shared/graphql/worldcup';
import { useFollowedTeam } from '../lib/wcTeam';  // if exists
import { liveFixtures, nextUpcoming, finishedFixtures, liveBadgeLabel, formatTime, involvesTeam } from '../lib/worldCupFixtures';

const DISMISSED_KEY = 'ctrend_wc_banner_dismissed';

export function WorldCupBanner() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  // ... same logic as web: query campaigns + fixtures, derive live/next/recent
  // Auto-re-show on live match
  // Return null if no wcCampaign, no fixtures, or dismissed (unless live)
  
  // Render: View with dark bg + border, left info, right CTA + dismiss
}
```

**Add to feed ListHeaderComponent:**

In `mobile/app/tabs/index.tsx`, in the FlatList `ListHeaderComponent`:
```tsx
ListHeaderComponent={
  <>
    <FeedCampaignFilter ... />
    <WorldCupBanner />
  </>
}
```

**Styles:**
```ts
banner: {
  marginHorizontal: 12, marginBottom: 10,
  borderRadius: 14,
  backgroundColor: '#0b1120',
  borderWidth: 1,
  borderColor: 'rgba(34,197,94,0.3)',
  padding: 12,
  flexDirection: 'row', alignItems: 'center', gap: 10,
},
bannerLive: { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: '#1a0808' },
bannerLeft: { flex: 1, gap: 4 },
bannerLabel: { fontSize: 10, fontWeight: '800', color: '#22c55e', letterSpacing: 0.8, textTransform: 'uppercase' },
bannerLabelLive: { color: '#ef4444' },
bannerMatch: { flexDirection: 'row', alignItems: 'center', gap: 5 },
bannerFlag: { width: 16, height: 16, borderRadius: 2 },
bannerTeam: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
bannerScore: { fontSize: 13, fontWeight: '900', color: '#fff', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
bannerVs: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
bannerTime: { fontSize: 10.5, color: 'rgba(255,255,255,0.5)' },
bannerCta: { fontSize: 12, fontWeight: '700', color: '#22c55e' },
bannerCtaLive: { color: '#ef4444' },
bannerClose: { backgroundColor: 'rgba(255,255,255,0.08)', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
bannerCloseText: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
```

**Utility libs needed** — check if `mobile/lib/worldCupFixtures.ts` exists; if not, port the key functions from `src/lib/worldCupFixtures.ts`:
- `liveFixtures(fixtures)` — filter by IN_PLAY/PAUSED/HT
- `nextUpcoming(fixtures, n)` — next N upcoming by kickoff
- `finishedFixtures(fixtures)` — filter by FT/FINISHED/AET
- `formatTime(iso)` — local time string e.g. "18:00"
- `liveBadgeLabel(fixture)` — "LIVE 67'" or "HT"
- `involvesTeam(fixture, team)` — filter by followed team

### Test cases
1. Banner shows above the feed when a World Cup campaign is active.
2. Live match → dark red/crimson border, red LIVE label + pulse dot, current score, "Watch Live →".
3. Upcoming match → green border, "Next Match" label, team names + kickoff time, "View →".
4. Recent result → green border, "Recent Result" label, teams + score, "See Result →".
5. Tap banner body → navigates to World Cup screen (correct tab).
6. Tap ✕ → banner dismisses for the session.
7. If dismissed and a match goes live → banner reappears with live styling.
8. No banner when no World Cup campaign active, or no fixtures.

---

## Files to change — full summary

| File | Phase | Change |
|------|-------|--------|
| `mobile/components/FeedPostCard.tsx` | 38, 40, 41 | Card border, poll border tuning, winner style, tappable chip, separator row |
| `mobile/components/PostCampaignBadge.tsx` | 39 | Verify single-line neutral pill |
| `mobile/components/WorldCupBanner.tsx` | 44 | **New file** |
| `mobile/app/world-cup.tsx` | 43 | Tappable fixtures, redesigned rows, tab param |
| `mobile/app/world-cup/match/[id].tsx` | 42 | **New screen** |
| `mobile/app/notifications/index.tsx` | 42 | Handle `LINEUP_AVAILABLE` → match detail |
| `mobile/app/tabs/index.tsx` | 44 | Add `<WorldCupBanner />` to ListHeaderComponent |
| `mobile/lib/worldCupFixtures.ts` | 43, 44 | Port from `src/lib/worldCupFixtures.ts` if missing |
| `packages/shared/src/graphql/feed.ts` | 41 | Add `fixtureId`, `lineupAvailable` |
| `packages/shared/src/graphql/worldcup.ts` | 42 | Add `WORLD_CUP_FIXTURE_DETAILS` query |
| `packages/shared/src/types/feed.ts` | 41 | Add `fixtureId?`, `lineupAvailable?` |
| `packages/shared/src/lib/mapGqlPostToFeedView.ts` | 41 | Map `fixtureId` + `lineupAvailable` |
