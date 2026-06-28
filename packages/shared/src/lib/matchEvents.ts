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

export type PlayerLineupEvents = PlayerEventTotals & {
  ownGoals: number;
  card: "yellow" | "red" | null;
  subOff: boolean;
  subOn: boolean;
};

export type MatchEventPlayerRef = {
  id?: number | null;
  name?: string | null;
};

export type MatchEventForMap = {
  type: string;
  detail: string;
  player: MatchEventPlayerRef;
  assist?: MatchEventPlayerRef | null;
};

/** Key for lineup player ↔ event map (id preferred, else normalized name). */
export function lineupPlayerKey(p: {
  id?: number | null;
  name?: string | null;
}): string {
  return p.id != null
    ? `id:${p.id}`
    : `nm:${normalizePlayerName(p.name ?? "")}`;
}

/** Goals, cards, and sub icons per player; enriches from playerMatchStats when events lag. */
export function buildPlayerEventMap(
  events: MatchEventForMap[],
  playerMatchStats?: Array<{
    playerId: number;
    name: string;
    goals?: number | null;
    assists?: number | null;
  }>,
): Map<string, PlayerLineupEvents> {
  const map = new Map<string, PlayerLineupEvents>();
  const ensure = (p: MatchEventPlayerRef): PlayerLineupEvents => {
    const idKey = p.id != null ? `id:${p.id}` : null;
    const nmKey = p.name ? `nm:${normalizePlayerName(p.name)}` : null;
    const existing =
      (idKey && map.get(idKey)) || (nmKey && map.get(nmKey)) || null;
    const pev: PlayerLineupEvents =
      existing ?? {
        goals: 0,
        ownGoals: 0,
        assists: 0,
        card: null,
        subOff: false,
        subOn: false,
      };
    if (idKey) map.set(idKey, pev);
    if (nmKey) map.set(nmKey, pev);
    return pev;
  };
  for (const e of events) {
    if (!e.player.name && e.player.id == null) continue;
    const pev = ensure(e.player);
    if (isScoredGoal(e)) {
      if (e.detail?.includes("Own Goal")) {
        pev.ownGoals++;
      } else {
        pev.goals++;
        if (e.assist?.name || e.assist?.id != null) {
          ensure(e.assist).assists++;
        }
      }
    } else if (e.type === "Card") {
      const isRed =
        e.detail.toLowerCase().includes("red") ||
        e.detail.includes("Second Yellow");
      pev.card = isRed ? "red" : "yellow";
    } else if (e.type === "subst") {
      // API-Football: player = off, assist = on
      pev.subOff = true;
      if (e.assist?.name || e.assist?.id != null) {
        ensure(e.assist).subOn = true;
      }
    }
  }
  enrichEventMapFromPlayerStats(playerMatchStats, ensure);
  return map;
}

/** Ratings from playerRatings, with playerMatchStats as fallback (covers subs who played). */
export function buildPlayerRatingMap(
  playerRatings: Array<{ playerId: number; rating?: string | null }>,
  playerMatchStats?: Array<{ playerId: number; rating?: string | null }>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const r of playerRatings) {
    if (r.rating != null) map.set(r.playerId, r.rating);
  }
  for (const s of playerMatchStats ?? []) {
    if (s.rating != null && !map.has(s.playerId)) {
      map.set(s.playerId, s.rating);
    }
  }
  return map;
}

/** True when a bench/sub player has synced per-player match stats (played or scored). */
export function playerHasLineupStats(
  playerId: number | null | undefined,
  playerMatchStats?: Array<{
    playerId: number;
    minutes?: number | null;
    goals?: number | null;
    assists?: number | null;
  }>,
): boolean {
  if (playerId == null || !playerMatchStats?.length) return false;
  const s = playerMatchStats.find((x) => x.playerId === playerId);
  if (!s) return false;
  return (s.minutes ?? 0) > 0 || (s.goals ?? 0) > 0 || (s.assists ?? 0) > 0;
}

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
