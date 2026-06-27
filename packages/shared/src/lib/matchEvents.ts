/** Shared helpers for match events (goals, cards, lineup icons). */

export type MatchEventLike = {
  type: string;
  detail?: string | null;
  time: number;
  timeExtra?: number | null;
};

export function isScoredGoal(e: { type: string; detail?: string | null }): boolean {
  if (e.type !== "Goal") return false;
  const d = (e.detail || "").toLowerCase();
  return (
    !d.includes("disallow") &&
    !d.includes("missed") &&
    !d.includes("shootout")
  );
}

/** Wall-clock minute for sorting / timeline position (90+4 → 94). */
export function effectiveEventMinute(e: {
  time: number;
  timeExtra?: number | null;
}): number {
  return e.time + Math.max(0, e.timeExtra ?? 0);
}

export function compareEventsByMinute(
  a: { time: number; timeExtra?: number | null },
  b: { time: number; timeExtra?: number | null },
): number {
  return effectiveEventMinute(a) - effectiveEventMinute(b);
}

/** Accent-insensitive name key for player ↔ event matching. */
export function normalizePlayerName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export type PlayerEventTotals = {
  goals: number;
  assists: number;
};

/** Fill missing goal/assist icons from API player stats when events are stale. */
export function enrichEventMapFromPlayerStats<T extends PlayerEventTotals>(
  stats:
    | Array<{
        playerId: number;
        name: string;
        goals?: number | null;
        assists?: number | null;
      }>
    | undefined,
  ensure: (p: { id?: number | null; name?: string | null }) => T,
): void {
  if (!stats?.length) return;
  for (const s of stats) {
    const g = s.goals ?? 0;
    const a = s.assists ?? 0;
    if (g <= 0 && a <= 0) continue;
    const pev = ensure({ id: s.playerId, name: s.name });
    if (g > pev.goals) pev.goals = g;
    if (a > pev.assists) pev.assists = a;
  }
}
