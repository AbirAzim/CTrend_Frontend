# Campaign System — Implementation Plan

**Date:** 2026-06-12  
**Scope:** Private vs. Public campaign types · Reward system per campaign · World Cup auto-scheduling · Draw option ·
Automated winner announcement pipeline · Match lifecycle UI (web + mobile)

---

## Current State

| Area | What exists |
|---|---|
| Campaign schema | `name`, `slug`, `isActive`, `isDefault`, `fixturesEnabled`, `prizePerWinner`, `rules` — no `isPublic`, no `hasRewards` |
| Post schema | `campaignId?: ObjectId`, `endingSoonLeadMinutes: number` |
| Fixture sync | Manual admin button; produces 2-option compare post (Home vs Away only) |
| Winner selection | `processMatchResult` — admin-triggered, immediate; DRAW = random from ALL voters |
| Auto-scheduling | Does not exist |
| Draw option | Does not exist (3rd compare option) |
| Winner countdown | Does not exist |

---

## Decisions locked in

- **Winner selection and monetary reward are two separate things**:
  - `hasWinner: boolean` — whether the campaign announces a winner. Allowed on both public and private campaigns.
  - `hasRewards: boolean` — whether the winner receives a cash prize (৳). Only allowed on **private** campaigns; public campaigns are forced to `false`.
- **Winner is only selected on posts that have a `votingEndsAt` deadline**. A post in a `hasWinner=true` campaign with no deadline is treated as a regular post — no countdown, no winner. This is a post-level gate, checked before the campaign-level `hasWinner` flag.
- **Public campaign with winner, no prize**: `isPublic=true, hasWinner=true` — anyone tags their post; posts with a deadline get a winner announced, no money.
- **Private campaign options**: admin can combine freely — winner + prize, winner without prize, or neither.
- **Rules are per-campaign**: Each campaign has its own `rules` (English) and `rulesBn` (Bengali) text. Already exists on the schema; no schema change needed. Admin writes different rules for each campaign in the create/edit form.
- **Match posts are POLL format, not compare**: Auto-scheduled posts use `format: poll`. Each option has the team's flag as its image and the country name as its label. For group stage the 3rd option (Draw) uses the existing draw icon already hosted at the platform (extracted from `https://kejitbe.app/post/6a2ab11ac1de3e8d7d7fdeb7`), with label `"Draw 🤝"`. Knockout posts have 2 options only.
- **Draw image**: Reuse the draw icon URL already used in the existing draw post above. Store in an env var `DRAW_OPTION_IMAGE_URL` so it can be swapped without a deploy.
- **Draw option winner**: Users who voted option index 2 (Draw) are the eligible pool when the match result is `DRAW`.
- **Winner countdown timer**: Uses the post's own `endingSoonLeadMinutes` setting (already on the Post schema). After the match ends the UI counts down that many minutes; when it hits zero the winner is revealed. Auto-created posts default to **5 minutes**; admin can edit per post before kickoff.
- **Postponed matches**: If the fixtures sync detects a kickoff change after a post is already created, the system automatically recalculates `scheduledAt = newKickoff − 24h` and `votingEndsAt = newKickoff` on the associated post, and sends admin a platform notification.
- **Public campaign**: Regular users can tag their own post to any public campaign from the Create Post screen.
- **Existing World Cup campaign**: set to `isPublic = false`, `hasRewards = true` as migration step.

---

## ✅ Phase 0 — Backend: Campaign `isPublic` + `hasRewards` + Post Tagging Gate

**Repo:** `~/Documents/projects/CTrend`

### 0-A. Campaign schema

```
src/campaigns/campaign.schema.ts
```

Add three fields:

```typescript
/** false (default) = admin-only posts; true = any user can tag their post */
@Prop({ default: false })
isPublic: boolean;

/** Whether the system picks and announces a winner after voting ends.
 *  Allowed on both public and private campaigns. */
@Prop({ default: false })
hasWinner: boolean;

/** Whether the winner receives a monetary prize (৳).
 *  MUST be false when isPublic=true — enforced at the service layer. */
@Prop({ default: false })
hasRewards: boolean;
```

**Constraint**: `isPublic = true` → `hasRewards` is forced to `false`. `hasWinner` is unrestricted. Enforce in `create()` and `update()` service methods.

Run a one-time migration / rely on default: existing World Cup campaign gets `isPublic: false`, `hasRewards: true`.

### 0-B. Campaign GQL types + inputs

```
src/campaigns/graphql/campaign.types.ts
```

- `CampaignGql`: add `@Field() isPublic: boolean`, `@Field() hasWinner: boolean`, `@Field() hasRewards: boolean`
- `CreateCampaignInput`: add all three as `@IsBoolean() @IsOptional()` fields
- `UpdateCampaignInput`: same

### 0-C. Campaigns service

`campaigns.service.ts`:
- `create()` and `update()` pass all three fields through.
- Enforce: `if (input.isPublic) { data.hasRewards = false; }` — `hasWinner` is not restricted.
- Add query method:

```typescript
async findAllPublic(): Promise<CampaignDocument[]>   // isPublic:true, isActive:true
```

### 0-D. Campaigns resolver

- Add `@Query(() => [CampaignGql]) publicCampaigns()` — no auth guard, returns active public campaigns. Used by the Create Post screen.

### 0-E. Post creation gate

`src/posts/posts.service.ts` — `createPost` input already accepts `campaignId`. Add validation:
- If `campaignId` is set, fetch the campaign.
- If `campaign.isPublic = false` and caller is not ADMIN → throw `ForbiddenException`.
- If campaign does not exist → throw `BadRequestException`.

**Deliverable:** `isPublic` and `hasRewards` fields live; private campaigns can't be tagged by regular users; public campaigns are always reward-free.

---

## ✅ Phase 1 — Backend: Auto-Schedule Match Posts (24h cron)

### 1-A. Fixture schema — add Draw option flag + auto-schedule marker

```
src/fixtures/fixture.schema.ts
```

```typescript
/** True when the post was auto-scheduled (not manually created by admin) */
@Prop({ default: false })
autoScheduled: boolean;

/** True when this fixture's post has a 3rd "Draw" option */
@Prop({ default: false })
hasDrawOption: boolean;
```

### 1-B. Caption generator utility

New file: `src/fixtures/caption-templates.ts`

Generate a creative caption for a fixture. Templates should vary by stage. Examples:

```typescript
export function generateMatchCaption(
  homeTeam: string,
  awayTeam: string,
  stage: string,
  kickoff: Date,
  hasDrawOption: boolean,
): string
```

Template pool (rotate by `fixture.externalId % templates.length` for determinism):

- *"🔥 {home} vs {away} — who claims the victory? Vote before kickoff and you could WIN 100 BDT! ⚽"*
- *"⚡ {stage} showdown! {home} goes head-to-head with {away}. Back your side — the clock is ticking! 🏆"*
- *"🎯 Prediction time! Will {home} hold their nerve or does {away} cause the upset? Cast your vote and win! 👑"*
- *"🌍 Football fever is here! {home} vs {away} — who walks away with the 3 points? Vote now! 🔥"*
- *"💥 {away} take on {home} in what promises to be a cracker! Who do you back? Vote before it kicks off!"*
- *(Draw variants for group stage)*: append *" · Think it'll end level? Back the Draw!"*

### 1-C. Auto-schedule cron service

New file: `src/fixtures/fixtures-auto-schedule.service.ts`

**Admin user**: All auto-created posts are attributed to `badhonkhanbk007@gmail.com`.
Look up this user by email once at service startup (cached in memory); if not found, log an error and skip scheduling.

**Two separate windows — creation vs. visibility:**

| | Admin can see & edit | Public can see & vote |
|---|---|---|
| Created at | Up to 3 days before kickoff | — |
| Goes live at | Immediately on creation | `kickoff − 24h` (post `scheduledAt`) |
| Voting closes at | — | `kickoff` (`votingEndsAt`) |

**Rolling 3-day creation window**: The cron looks for fixtures kicking off within the next **72 hours** that have no `campaignPostId`. This window rolls forward each run, so matches naturally enter it ~3 days out and get their post created then. Already-scheduled fixtures are skipped (idempotent: `campaignPostId != null`).

**Post visibility gating via the existing scheduled-post system**: Each auto-created post is stored with:
- `status: PostStatus.SCHEDULED`
- `scheduledAt: kickoff - 24h` ← this is when it becomes publicly visible

The existing `post-scheduler.service.ts` cron (already runs every minute) calls `publishScheduledPosts()` which flips any `SCHEDULED` post whose `scheduledAt <= now` to `PUBLISHED`. **No new plumbing needed** — the 24h public gate is free.

**Admin visibility**: The existing admin "Scheduled" tab already lists all `SCHEDULED` posts. Admin sees every match post the moment it's created (up to 3 days before public). Admin can edit caption, option labels, images, `scheduledAt` (go-live time), `votingEndsAt`, and `endingSoonLeadMinutes` at any point before the match kicks off using the existing edit-post flow.

Cron runs every **4 hours** via `@Cron('0 0 */4 * * *')`.

```typescript
async scheduleUpcomingFixtures(): Promise<void> {
  const windowEnd = new Date(Date.now() + 72 * 60 * 60 * 1000); // now + 3 days

  const fixtures = await fixtureModel.find({
    kickoff: { $gt: new Date(), $lte: windowEnd },
    campaignPostId: null,
  }).exec();

  if (!fixtures.length) return;

  const admin = await usersService.findByEmail('badhonkhanbk007@gmail.com');
  if (!admin) {
    this.logger.error('Auto-schedule admin user not found — skipping');
    return;
  }

  for (const fixture of fixtures) {
    try {
      // scheduledAt = kickoff - 24h → post stays hidden until then
      const scheduledAt = new Date(fixture.kickoff.getTime() - 24 * 60 * 60 * 1000);
      await fixturesService.createCampaignPost(fixture._id, admin._id, {
        hasDrawOption: fixture.stage === 'GROUP_STAGE',
        autoScheduled: true,
        scheduledAt,              // public go-live
        votingEndsAt: fixture.kickoff, // voting closes at kickoff
      });
    } catch (err) {
      this.logger.error(`Failed to schedule fixture ${fixture._id}: ${err.message}`);
    }
  }
}
```

**On server startup** — `onModuleInit()` triggers one immediate pass so a fresh deploy picks up fixtures already in the 3-day window without waiting for the next 4-hour tick.

### 1-D. Update `createCampaignPost` in FixturesService

Accept `{ hasDrawOption?: boolean; autoScheduled?: boolean; scheduledAt?: Date; votingEndsAt?: Date }` options.

**Post format**: `format: 'poll'` (not `compare`). Poll options carry both an image and a label.

Option structure:
```
Option 0: image = fixture.homeTeam.crest,  label = fixture.homeTeam.name  (e.g. "Argentina")
Option 1: image = fixture.awayTeam.crest,  label = fixture.awayTeam.name  (e.g. "France")
Option 2: image = process.env.DRAW_OPTION_IMAGE_URL,  label = "Draw 🤝"   (group stage only)
```

Post fields set on creation:
- `format: 'poll'`
- `status: PostStatus.SCHEDULED`
- `scheduledAt: kickoff − 24h` (public go-live)
- `votingEndsAt: kickoff`
- `endingSoonLeadMinutes: 5` (default; admin can edit)
- `campaignId`: the World Cup campaign ObjectId (looked up by slug `'world-cup-2026'` once at startup, cached)

### 1-E. Admin edit capability

No new work needed — the existing edit-post flow already lets admin edit `contentText`, option labels, images, `votingEndsAt`, `endingSoonLeadMinutes`.

**Deliverable:** Posts auto-appear 24h before every match with creative captions; group stage posts have a Draw option; admin can refine before kickoff.

---

## ✅ Phase 2 — Backend: Match Lifecycle & Automated Winner Announcement

### 2-A. Fixture schema — lifecycle timestamps

```
src/fixtures/fixture.schema.ts
```

```typescript
/** Set when fixtures-sync first sees status=FINISHED */
@Prop({ type: Date, default: null })
matchEndedAt: Date | null;

/** matchEndedAt + post.endingSoonLeadMinutes — computed and stored for
    easy querying by the winner-announcement cron */
@Prop({ type: Date, default: null })
winnerScheduledAt: Date | null;
```

### 2-B. Fixtures sync — detect FINISHED, set lifecycle timestamps

`src/fixtures/fixtures-sync.service.ts` — in the status-update path, when a fixture transitions to `FINISHED`:

```typescript
if (newStatus === 'FINISHED' && !fixture.matchEndedAt) {
  fixture.matchEndedAt = new Date();

  if (fixture.campaignPostId) {
    const post = await postModel.findById(fixture.campaignPostId).lean();

    // Only schedule winner announcement for campaigns that pick a winner.
    const campaign = post?.campaignId
      ? await campaignModel.findById(post.campaignId).lean()
      : null;

    // Winner only scheduled when campaign hasWinner=true AND the post has a votingEndsAt deadline.
    if (campaign?.hasWinner && post?.votingEndsAt) {
      const delayMs = (post?.endingSoonLeadMinutes ?? 5) * 60 * 1000;
      fixture.winnerScheduledAt = new Date(Date.now() + delayMs);
    }
    // winnerScheduledAt stays null if hasWinner=false or post has no deadline.
  }

  // Always fire POST_UPDATED so the UI transitions from "LIVE" to
  // "Match ended" (for reward campaigns: "winner in X min"; for others: just results).
  await pubSub.publish('POST_UPDATED', { postUpdated: postPayload });
}
```

### 2-C. Winner-announcement cron

New file: `src/world-cup-campaign/winner-announcement.service.ts`

Runs every **1 minute** via `@Cron('* * * * *')`.

Logic:
1. Query fixtures where `winnerScheduledAt <= now` AND `matchEndedAt IS NOT NULL` AND `campaignPostId IS NOT NULL`.
2. For each: verify campaign `hasWinner = true` AND post `votingEndsAt` is set (belt-and-suspenders) AND no `CampaignWinner` record exists yet.
3. Call `WorldCupCampaignService.processMatchResult(fixtureId)`.
4. Publish `POST_UPDATED` subscription with the winner embedded → frontend reveals winner.

### 2-D. Fix Draw winner logic for 3-option posts

`src/world-cup-campaign/world-cup-campaign.service.ts` — `processMatchResult`:

Current DRAW path picks from ALL voters. New logic:

```typescript
if (apiWinner === 'DRAW') {
  // Group stage post has Draw as option index 2.
  // Knockout posts never have a draw result, but if somehow triggered, fall back to all voters.
  const drawOptionIndex = fixture.hasDrawOption ? 2 : null;
  const query = drawOptionIndex !== null
    ? { postId, selectedOptionIndex: drawOptionIndex, anonymous: { $ne: true } }
    : { postId, anonymous: { $ne: true } };
  const drawVotes = await this.voteModel.find(query).lean().exec();
  // pick random winner from drawVotes, same as current logic...
}
```

### 2-E. Expose winner on CampaignWinner schema

Add `winnerAnnouncedAt: Date` (set = createdAt, already there via timestamps).
Add `winningOptionIndex?: number` (already exists as `winningOption`). No schema change needed; just alias in toGql.

### 2-F. GraphQL — expose lifecycle fields on Fixture type

`src/fixtures/graphql/fixture.types.ts` — add:

```typescript
@Field(() => Date, { nullable: true }) matchEndedAt?: Date;
@Field(() => Date, { nullable: true }) winnerScheduledAt?: Date;
@Field(() => Boolean) autoScheduled: boolean;
@Field(() => Boolean) hasDrawOption: boolean;
```

Expose on `FixtureGql`. Update `toGql()` in `FixturesService`.

### 2-G. GraphQL — post carries winner when announced

`src/posts/graphql/post.types.ts` — add nullable `campaignWinner` field (resolver-populated from CampaignWinner collection when `campaignId` is set and a winner exists):

```typescript
@Field(() => CampaignWinnerGql, { nullable: true })
campaignWinner?: CampaignWinnerGql;
```

Wire in `PostsResolver` / `PostsService.toGql()`.

### 2-H. Auto-update post timing when kickoff changes

`src/fixtures/fixtures-sync.service.ts` — in the per-fixture update path, after writing the new kickoff:

```typescript
if (existingKickoff.getTime() !== newKickoff.getTime() && fixture.campaignPostId) {
  const newScheduledAt = new Date(newKickoff.getTime() - 24 * 60 * 60 * 1000);
  await postModel.updateOne(
    { _id: fixture.campaignPostId, status: PostStatus.SCHEDULED },
    { $set: { scheduledAt: newScheduledAt, votingEndsAt: newKickoff } },
  );
  // Send admin a platform notification
  await notificationsService.notifyAdmins({
    title: 'Match rescheduled',
    body: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} moved to ${newKickoff.toISOString()}. Post timing updated automatically.`,
  });
}
```

Guard: only update if the post is still `SCHEDULED` (not yet published). If it's already `PUBLISHED` (within the 24h window), skip the auto-update and send admin a higher-priority notification to handle manually.

**Deliverable:** When a match ends, the system automatically counts down and picks a winner without any admin action. `POST_UPDATED` subscription pushes changes to all connected clients. Kickoff reschedules are handled automatically while the post is still in draft; admin is notified either way.

---

## ✅ Phase 3 — Frontend Web: Match Lifecycle UI

**Repo:** `~/Documents/projects/CTrend_Frontend`  
Files involved: `src/graphql/worldcup.ts`, `src/lib/worldCupFixtures.ts`, `src/pages/WorldCupPage.tsx`, `src/components/FeedPostCard.tsx`, `src/index.css`

### 3-A. GQL updates

`src/graphql/worldcup.ts` — add to `WORLD_CUP_FIXTURES` fragment:

```graphql
matchEndedAt
winnerScheduledAt
autoScheduled
hasDrawOption
```

Add new query `FIXTURE_FOR_POST` — given a `campaignPostId`, return the linked fixture. Used by the post detail page to get match metadata without fetching all fixtures.

### 3-B. Fixture type + helpers

`src/lib/worldCupFixtures.ts`:

```typescript
// Add to WcFixture type
matchEndedAt?: string | null;
winnerScheduledAt?: string | null;
hasDrawOption?: boolean;
autoScheduled?: boolean;

// New helpers
export function isWaitingForResult(f: WcFixture): boolean
// true when match ended but winnerScheduledAt is in the future

export function isWinnerReady(f: WcFixture): boolean
// true when winnerScheduledAt <= now

export function msUntilWinnerReveal(f: WcFixture): number
// ms until winnerScheduledAt (negative if past)
```

### 3-C. Post card — match lifecycle phases

`src/components/FeedPostCard.tsx` — a match campaign post passes through these visible states. The post already carries `votingEndsAt`, and the new fixture data comes through via a new `FeedPostView.fixture?` field (populated by the feed query when `campaignId` matches a fixture).

**State machine:**

**Gate 1 (post-level)**: does this post have a `votingEndsAt`? If no → render as a normal post forever, no lifecycle states below apply.

**Gate 2 (campaign-level)**: does the campaign have `hasWinner=true`? Controls whether countdown + winner card appear.

| State | Condition | UI |
|---|---|---|
| **Vote open** | `now < votingEndsAt` | Normal poll card + "Voting closes at kickoff" note |
| **In progress** | `votingEndsAt past` + `!matchEndedAt` | "⚽ MATCH IN PROGRESS" banner + live score chip + percentages frozen |
| **Counting down** | `matchEndedAt set` + `winnerScheduledAt > now` + `hasWinner=true` | Final score · "🏆 Winner revealed in X:XX" live countdown |
| **Match ended, no winner** | `matchEndedAt set` + (`hasWinner=false` OR no `votingEndsAt`) | Final score + frozen percentages only — no countdown, no card |
| **Winner revealed** | `winnerScheduledAt ≤ now` + `campaignWinner` set + `hasWinner=true` | Celebratory winner card — with prize line if `hasRewards=true`, without if not |
| **No correct voters** | `campaignWinner.note` set, no userId + `hasWinner=true` | "No one voted for the right side — no winner this match" |

Implementation notes:
- Vote controls are hidden once `votingEndsAt` has passed; live percentage bars stay visible throughout.
- The countdown `X:XX` is a client-side `useEffect`/`setInterval` counting down from `msUntilWinnerReveal`.
- The post GQL response must include `campaign.hasWinner` and `campaign.hasRewards`.

### 3-D. Winner reveal card (hasWinner=true campaigns)

Render when `post.campaign.hasWinner = true` and `campaignWinner.userId` is set.

```
┌─────────────────────────────────────────┐
│  🎉  WINNER ANNOUNCED                   │
│  ─────────────────────────────────────  │
│  [avatar]  @username                    │
│  Voted: Argentina                       │
│  Prize: ৳100          ← only if hasRewards=true
└─────────────────────────────────────────┘
```

- When `hasRewards = true` → show prize line ("Prize: ৳100")
- When `hasRewards = false` → winner card shown but no prize line — just the celebration and the username

For campaigns where `hasWinner = false`, after `matchEndedAt` just show final score + frozen vote percentages. No countdown, no winner card.

CSS: add `.cx-campaign-winner-reveal` with a green gradient, confetti animation via `@keyframes` (no library needed — 10 coloured `::before`/`::after` pseudo divs burst out), fade-in on mount.

### 3-E. World Cup page — live score + post link

`src/pages/WorldCupPage.tsx`:
- Live fixtures: already shown. Add `matchEndedAt` / `winnerScheduledAt` display.
- Finished fixtures: show final score + a link to the post if `campaignPostId` is set + winner username if `CampaignWinner` exists (requires adding `campaignWinner` to the `worldCupFixtures` response — see Phase 2-G).

### 3-F. CSS additions

`src/index.css`:
- `.cx-match-inprogress-banner` — pulsing green/amber banner
- `.cx-winner-countdown` — large mono countdown chip
- `.cx-campaign-winner-reveal` — green gradient card with confetti keyframe
- `.cx-match-score-pill` — inline score badge on compare image (Home 2 : 1 Away)

---

## ✅ Phase 4 — Frontend Mobile: Match Lifecycle UI

**Repo:** `~/Documents/projects/CTrend_Frontend/mobile`  
Files: `mobile/lib/worldCupFixtures.ts`, `mobile/components/FeedPostCard.tsx`, `mobile/app/world-cup.tsx`

### 4-A. GQL fragment update

`packages/shared/src/graphql/worldcup.ts` — add same fields as Phase 3-A.

### 4-B. worldCupFixtures helpers

`mobile/lib/worldCupFixtures.ts` — add `matchEndedAt`, `winnerScheduledAt`, `hasDrawOption` to `WcFixture` type and the same helper functions as Phase 3-B.

### 4-C. FeedPostCard — match lifecycle phases

`mobile/components/FeedPostCard.tsx` — same state machine as Phase 3-C:
- `hasWinner=false`: after `matchEndedAt`, show final score + results only, no countdown, no winner card.
- `hasWinner=true`: show countdown → winner reveal card.
- `hasRewards=true`: show prize line inside the winner card. `hasRewards=false`: winner card shown, prize line hidden.

Implement with:
- A `useEffect` countdown interval updating `msRemaining` state
- Conditional render blocks below the compare images (replace `voteHintRow` when post is in these states)

Style guide (React Native):
- "In progress" banner: `backgroundColor: '#f59e0b'`, `borderRadius: 8`, bold text, ⚽ icon
- Countdown pill: monospaced large text, dark background, green glow border
- Winner card: `backgroundColor: 'rgba(16,185,129,0.15)'`, `borderColor: '#34d399'`, `borderWidth: 1.5`, animated scale-in using `Animated.spring`

### 4-D. Winner reveal animation

Use `Animated.sequence` + `Animated.spring` for the winner card entrance.
Add a brief confetti burst using `react-native-reanimated` worklets (already in the project) — 8 small coloured circles fly out from centre and fade.

### 4-E. World Cup screen

`mobile/app/world-cup.tsx`:
- Finished matches: show score, winner username, link to post.
- Post-in-progress matches: live score from `fixture.score`.

---

## Phase 5 — Frontend Web + Mobile: Public Campaign Tagging (Create Post)

### 5-A. GQL

New query: `PUBLIC_CAMPAIGNS` → calls `publicCampaigns` (Phase 0-D).

### 5-B. Web Create Post page

`src/pages/CreatePostPage.tsx`:
- Below the post-type selector, add a **"Campaign (optional)"** dropdown.
- Fetch `publicCampaigns` on mount.
- If user is ADMIN, also fetch all active campaigns (private + public).
- Selected campaign ID is sent as `campaignId` in `createPost` mutation input.
- Show small badge preview: the campaign name chip (same style as existing category chips).

### 5-C. Mobile Create Post screen

`mobile/app/tabs/create.tsx` (or wherever create-post lives):
- Same logic as 5-B.
- Use a `BottomSheet` picker or a `Picker` component for the campaign list.
- Only show when campaigns are available (no picker if list is empty).

### 5-D. Feed post card — campaign badge

Both web and mobile `FeedPostCard`:
- If `post.campaignId` is set and `post.campaignName` is returned in feed GQL, show a campaign chip (similar to category chip, colour: `#6366f1` indigo).
- Web: `<span className="cx-campaign-badge">{campaignName}</span>` next to category chips.
- Mobile: similar `View`/`Text` badge.

Feed GQL query needs `campaignName` on `Post` — add resolver field that joins Campaign by ID (or denormalize `campaignName` on post at write time).

---

## Phase 6 — Admin UI: Campaign Management

### 6-A. Web admin — campaign create/edit

`src/pages/` (admin panel, wherever campaigns are managed):
- Add **"Anyone can tag posts"** toggle → `isPublic`. When enabled, automatically disables the prize toggle (but NOT the winner toggle).
- Add **"Announce a winner"** toggle → `hasWinner`. When enabled, shows the countdown config.
- Add **"Give a cash prize"** toggle → `hasRewards`. Only enabled when `hasWinner=true` AND `isPublic=false`. When enabled, show the `prizePerWinner` (৳) input.
- Display campaign type badge in the list (4 combinations):

```
isPublic=true,  hasWinner=true,  hasRewards=false  →  PUBLIC + 🏆       — open tagging, winner, no prize
isPublic=true,  hasWinner=false, hasRewards=false  →  PUBLIC             — open tagging, no winner
isPublic=false, hasWinner=true,  hasRewards=true   →  PRIVATE + 🏆 + ৳  — admin posts, winner + prize
isPublic=false, hasWinner=true,  hasRewards=false  →  PRIVATE + 🏆      — admin posts, winner, no prize
isPublic=false, hasWinner=false, hasRewards=false  →  PRIVATE            — admin posts, no winner
```

- `rules` and `rulesBn` text areas are already in the form — each campaign has fully independent rule text.

### 6-B. Web admin — campaign winners list

`src/graphql/worldcup.ts` — `CAMPAIGN_WINNERS` query already exists.
Admin page: add "Fixture" column showing match name + score, "Winner Option" column (Home / Away / Draw), "Announced At" timestamp.

### 6-C. Mobile admin

`mobile/app/admin/` — same create/edit form updates as 6-A (`isPublic` toggle + `hasRewards` toggle that auto-disables when public is on + per-campaign rules text areas).

---

## Phase 7 — Polish & Edge Cases

- **Tie in votes**: If two options have the exact same percentage and both are "winners" per the match result (impossible — only one API winner) this can't happen. But if `correctVotes` is empty (nobody voted for the winning side), the existing `note: 'No users voted for the winning side'` path already handles it gracefully. UI should show "No winner for this match — nobody voted for the right side."
- **Knockout Draw**: `fixture.stage !== 'GROUP_STAGE'` so `hasDrawOption = false`. If for some reason the API returns `DRAW` for a knockout fixture (shouldn't happen), fall back to picking from all voters.
- **Admin override**: Keep the existing `processMatchResult` admin mutation so admin can manually force winner selection if the cron fails or a fixture is mis-classified.
- **Edit after auto-schedule**: Admin can always edit caption, option labels, `endingSoonLeadMinutes` on the auto-created post before kickoff. After kickoff, the post is locked for voting but admin can still edit caption/metadata.
- **Subscriptions**: The existing `POST_VOTE_UPDATED` subscription handles live percentage updates. For match lifecycle changes (match ended, winner revealed), re-use or extend `POST_UPDATED` subscription — send `{ type: 'MATCH_ENDED', fixture: {...} }` and `{ type: 'WINNER_ANNOUNCED', winner: {...} }` payloads.

---

## Suggested Implementation Order

```
Phase 0  →  Phase 1  →  Phase 2        (backend foundation first — unblocks all UI)
Phase 3  (web UI, can start in parallel with Phase 4 once Phase 2 backend is done)
Phase 4  (mobile UI)
Phase 5  →  Phase 6  →  Phase 7        (lower priority, can ship after core match lifecycle)
```

Estimated phase sizes:
- Phase 0: small (1–2 hours, mostly schema + types)
- Phase 1: medium (3–4 hours, cron + caption templates + draw option)
- Phase 2: medium-large (4–6 hours, lifecycle timestamps + auto winner cron)
- Phase 3: large (6–8 hours, web UI state machine + winner reveal)
- Phase 4: large (6–8 hours, mobile UI state machine + animations)
- Phase 5: small (2–3 hours, create post picker)
- Phase 6: small (1–2 hours, admin form field + badges)
- Phase 7: ongoing, woven into Phase 3/4

---

## All Decisions Resolved

| Question | Decision |
|---|---|
| Draw image | Reuse existing draw icon from the platform (env var `DRAW_OPTION_IMAGE_URL`) |
| Post format | **Poll** (not compare) — team flag as image, country name as label |
| System user | `badhonkhanbk007@gmail.com` |
| Winner selection | `hasWinner` — available on both public and private campaigns |
| Cash prize | `hasRewards` — private campaigns only; public always forced false |
| Winner delay | Post's own `endingSoonLeadMinutes` (default **5 min**, admin-editable) |
| Scheduling window | 72h rolling calendar window |
| Postponed matches | Auto-update `scheduledAt`/`votingEndsAt` while still SCHEDULED; notify admin |

No open questions remain. Ready to implement starting from Phase 0.
