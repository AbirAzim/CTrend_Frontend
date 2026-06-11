// World Cup fixture helpers (mobile) — pure functions over the
// `worldCupFixtures` API shape. Mirrors the web copy in src/lib.

export type WcTeam = { name: string; shortName: string; crest: string };
export type WcScore = { home: number | null; away: number | null; winner: string | null };

export type WcFixture = {
  id: string;
  externalId: number;
  homeTeam: WcTeam;
  awayTeam: WcTeam;
  kickoff: string;
  status: string;
  /** Live match minute from the provider while IN_PLAY/PAUSED; null otherwise. */
  minute?: number | null;
  stage: string;
  group: string | null;
  matchday: number | null;
  score: WcScore;
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

// Covers 90' + half-time + stoppage + extra time + penalties, with buffer.
const LIVE_WINDOW_MS = 150 * 60 * 1000;

export function isLive(f: WcFixture): boolean {
  if (f.status === "IN_PLAY" || f.status === "PAUSED") return true;
  if (f.status === "FINISHED") return false;
  // Provider status can lag; treat a kicked-off, not-finished match within the
  // match window as live so it doesn't vanish from every section.
  const ko = new Date(f.kickoff).getTime();
  if (Number.isNaN(ko)) return false;
  const now = Date.now();
  return ko <= now && now < ko + LIVE_WINDOW_MS;
}

export function isFinished(f: WcFixture): boolean {
  return f.status === "FINISHED";
}

export function isUpcoming(f: WcFixture): boolean {
  return !isLive(f) && !isFinished(f) && new Date(f.kickoff).getTime() > Date.now();
}

export function involvesTeam(f: WcFixture, teamName: string | null): boolean {
  if (!teamName) return true;
  return f.homeTeam.name === teamName || f.awayTeam.name === teamName;
}

export function fixtureTeams(fixtures: WcFixture[]): WcTeam[] {
  const map = new Map<string, WcTeam>();
  for (const f of fixtures) {
    for (const t of [f.homeTeam, f.awayTeam]) {
      if (t?.name && !map.has(t.name)) map.set(t.name, t);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
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

export function nextUpcoming(fixtures: WcFixture[], n: number): WcFixture[] {
  return upcomingFixtures(fixtures).slice(0, n);
}

export type WcDayGroup = { key: string; label: string; fixtures: WcFixture[] };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(iso)}`;
}

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

export function liveMinute(iso: string): number {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return Math.max(1, Math.min(mins, 130));
}
