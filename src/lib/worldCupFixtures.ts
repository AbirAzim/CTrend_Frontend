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
  stage: string;
  group: string | null;
  matchday: number | null;
  // API returns null for matches that haven't produced a score yet (upcoming).
  score: WcScore | null;
  campaignPostId: string | null;
};

export const WC_STAGE_ORDER: Record<string, number> = {
  GROUP_STAGE: 0,
  LAST_16: 1,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 3,
  THIRD_PLACE: 4,
  FINAL: 5,
};

export const WC_STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter Finals",
  SEMI_FINALS: "Semi Finals",
  THIRD_PLACE: "Third Place",
  FINAL: "Final",
};

export function isLive(f: WcFixture): boolean {
  return f.status === "IN_PLAY" || f.status === "PAUSED";
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

/** Short countdown to kickoff: "in 2h 15m", "in 3d", "in 45m", or "Kicking off". */
export function countdownToKickoff(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Kicking off";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

/** Rough elapsed minutes for a live match (no real clock from the API). */
export function liveMinute(iso: string): number {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return Math.max(1, Math.min(mins, 130));
}
