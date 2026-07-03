// Shared World Cup fixture helpers — pure functions over the `worldCupFixtures`
// API shape. Used by the World Cup page and the floating feed widget.

// Knockout placeholders (teams not yet decided) come back with null name/shortName
// and an empty crest — every consumer must treat these as optional.
export type WcTeam = { name: string | null; shortName: string | null; crest: string | null };
export type WcScore = { home: number | null; away: number | null; winner: string | null };

export type WcFixture = {
  id: string;
  externalId: number;
  homeTeam: WcTeam;
  awayTeam: WcTeam;
  kickoff: string;
  status: string;
  /** Provider's original status code (1H/2H/HT/ET/BT/P/PEN/FT/AET…) — needed to
   * tell extra time and penalties apart, since `status` collapses both into
   * IN_PLAY. */
  rawStatus?: string | null;
  /** Live match minute from the provider while IN_PLAY/PAUSED; null otherwise. */
  minute?: number | null;
  stage: string;
  group: string | null;
  matchday: number | null;
  // API returns null for matches that haven't produced a score yet (upcoming).
  score: WcScore | null;
  campaignPostId: string | null;
  autoScheduled?: boolean | null;
  hasDrawOption?: boolean | null;
  /** ISO string — set when the match is detected as FINISHED by syncLiveScores. */
  matchEndedAt?: string | null;
  /** ISO string — when the winner countdown ends and CampaignWinner is created. */
  winnerScheduledAt?: string | null;
};

export const WC_STAGE_ORDER: Record<string, number> = {
  GROUP_STAGE: 0,
  LAST_32: 1,
  LAST_16: 2,
  QUARTER_FINALS: 3,
  SEMI_FINALS: 4,
  THIRD_PLACE: 5,
  FINAL: 6,
};

export const WC_STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter Finals",
  SEMI_FINALS: "Semi Finals",
  THIRD_PLACE: "Third Place",
  FINAL: "Final",
};

// Covers 90' + half-time + stoppage + extra time + penalties, with buffer.
const LIVE_WINDOW_MS = 150 * 60 * 1000;

export function isLive(f: WcFixture): boolean {
  // ET and penalties are both reported as IN_PLAY (see liveBadgeLabel) — no
  // separate status values to check here.
  if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
  if (f.status === "FINISHED") return false;
  // The provider's status often lags (free-tier sync delay), leaving a kicked-off
  // match stuck on TIMED. Without this, such a match is neither "upcoming"
  // (kickoff passed) nor "live" nor "finished" — so it vanishes from every
  // section. Treat "kicked off, not finished, still within the match window" as
  // live so it shows up instead of disappearing.
  const ko = new Date(f.kickoff).getTime();
  if (Number.isNaN(ko)) return false;
  const now = Date.now();
  return ko <= now && now < ko + LIVE_WINDOW_MS;
}

export function isFinished(f: WcFixture): boolean {
  return f.status === "FINISHED";
}

/** Not yet kicked off (scheduled/timed and in the future), and not live/finished. */
export function isUpcoming(f: WcFixture): boolean {
  return !isLive(f) && !isFinished(f) && new Date(f.kickoff).getTime() > Date.now();
}

export function involvesTeam(f: WcFixture, teamName: string | null): boolean {
  if (!teamName) return true;
  return f.homeTeam.name === teamName || f.awayTeam.name === teamName;
}

/** Unique teams across all fixtures, sorted by name. */
export function fixtureTeams(fixtures: WcFixture[]): WcTeam[] {
  const map = new Map<string, WcTeam>();
  for (const f of fixtures) {
    for (const t of [f.homeTeam, f.awayTeam]) {
      if (t?.name && !map.has(t.name)) map.set(t.name, t);
    }
  }
  return [...map.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export function byKickoffAsc(a: WcFixture, b: WcFixture): number {
  return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
}

export function liveFixtures(fixtures: WcFixture[]): WcFixture[] {
  return fixtures.filter(isLive).sort(byKickoffAsc);
}

export function upcomingFixtures(fixtures: WcFixture[]): WcFixture[] {
  return fixtures.filter(isUpcoming).sort(byKickoffAsc);
}

/** The next N upcoming fixtures (soonest first). */
export function nextUpcoming(fixtures: WcFixture[], n: number): WcFixture[] {
  return upcomingFixtures(fixtures).slice(0, n);
}

export type WcDayGroup = { key: string; label: string; fixtures: WcFixture[] };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Today / Tomorrow / "Fri, Jun 13" — relative to the device's local day. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = dayKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const k = dayKey(d);
  if (k === today) return "Today";
  if (k === dayKey(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Group fixtures by local day, ordered chronologically. */
export function groupByDay(fixtures: WcFixture[]): WcDayGroup[] {
  const groups = new Map<string, WcDayGroup>();
  for (const f of [...fixtures].sort(byKickoffAsc)) {
    const d = new Date(f.kickoff);
    const k = dayKey(d);
    if (!groups.has(k)) groups.set(k, { key: k, label: dayLabel(f.kickoff), fixtures: [] });
    groups.get(k)!.fixtures.push(f);
  }
  return [...groups.values()];
}

/** Local time, e.g. "9:00 PM". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Local day + time, e.g. "Fri, Jun 13 · 9:00 PM". */
export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(iso)}`;
}

/** Short countdown to kickoff — shows seconds when < 60 s remain. */
export function countdownToKickoff(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Kicking off";
  if (ms < 60_000) return `in ${Math.floor(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

/** True if any upcoming fixture is within 60 s — caller should tick every second. */
export function needsSecondTick(fixtures: WcFixture[]): boolean {
  return fixtures.some((f) => {
    const ms = new Date(f.kickoff).getTime() - Date.now();
    return ms > 0 && ms < 60_000;
  });
}

/** Finished fixtures sorted most-recent first. */
export function finishedFixtures(fixtures: WcFixture[]): WcFixture[] {
  return fixtures.filter(isFinished).sort(
    (a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime(),
  );
}

/**
 * Human-readable badge for a live fixture: "HT", "ET 93'", "PENS", "45'" etc.
 *
 * `status` only ever comes back as TIMED/IN_PLAY/PAUSED/FINISHED — extra time
 * and penalties both collapse into IN_PLAY there, so ET/penalty detection has
 * to go through the provider's original code (`rawStatus`: 1H/2H/HT/ET/BT/P/
 * PEN/FT/AET) instead, same as `formatKnockoutLivePrefix` in matchScoreCopy.ts.
 */
export function liveBadgeLabel(f: WcFixture): string {
  const raw = (f.rawStatus ?? "").toUpperCase();
  if (raw === "P" || raw === "PEN") return "PENS";
  if (raw === "ET" || raw === "BT") return f.minute != null ? `ET ${f.minute}'` : "ET";
  if (f.status === "PAUSED") return "HT";
  return f.minute != null ? `${f.minute}'` : "LIVE";
}

/** True when the fixture's campaign post should be visible (published ~24h before kickoff). */
export function canVoteOnFixture(f: WcFixture): boolean {
  if (!f.campaignPostId) return false;
  if (!isUpcoming(f)) return false;
  return new Date(f.kickoff).getTime() - Date.now() < 25 * 60 * 60 * 1000;
}

/** Rough elapsed minutes for a live match (no real clock from the API). */
export function liveMinute(iso: string): number {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return Math.max(1, Math.min(mins, 130));
}

// ─── Campaign post lifecycle helpers ──────────────────────────────────────────

export type CampaignPostState =
  | "vote_open"      // voting still accepting entries
  | "in_progress"    // match is live (or between voting close and match end)
  | "counting_down"  // match ended, winner countdown running
  | "winner_revealed"; // CampaignWinner exists

/**
 * Derive the lifecycle state of a campaign post from the post's fields.
 * All date strings should be ISO strings from the API.
 */
export function getCampaignPostState(opts: {
  isVotingOpen?: boolean | null;
  votingEndsAt?: string | null;
  winnerScheduledAt?: string | null;
  hasWinner?: boolean | null;
  campaignWinnerExists: boolean;
}): CampaignPostState {
  if (opts.campaignWinnerExists) return "winner_revealed";
  if (opts.isVotingOpen) return "vote_open";
  if (!opts.hasWinner) return "in_progress";
  if (opts.winnerScheduledAt && new Date(opts.winnerScheduledAt).getTime() > Date.now()) {
    return "counting_down";
  }
  return "in_progress";
}

/** Countdown string "4:32" for the winner reveal timer. */
export function winnerCountdown(winnerScheduledAt: string): string {
  const ms = Math.max(0, new Date(winnerScheduledAt).getTime() - Date.now());
  const totalSecs = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
