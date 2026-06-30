import { compareEventsByMinute, effectiveEventMinute } from "./matchEvents";

export type PenaltyShootoutKick = {
  team: "home" | "away";
  playerName: string;
  scored: boolean;
};

export type PenaltyShootoutKickRow = PenaltyShootoutKick & {
  runHome: number;
  runAway: number;
};

export type PenaltyShootoutRound = {
  home?: PenaltyShootoutKickRow;
  away?: PenaltyShootoutKickRow;
};

export type PenaltyTeamSummary = {
  scored: string[];
  missed: string[];
};

type ShootoutEvent = {
  team: string;
  type: string;
  detail?: string | null;
  time: number;
  timeExtra?: number | null;
  player: { name?: string | null };
};

/** API marks many shootout kicks as type Goal — detail usually mentions shootout or penalty. */
export function isPenaltyShootoutEvent(e: { type: string; detail?: string | null }): boolean {
  const d = (e.detail || "").toLowerCase();
  if (d.includes("shootout")) return true;
  if (e.type === "Goal" && d.includes("penalty shootout")) return true;
  return false;
}

/** Shootout kick (scored or missed) — excludes regulation / ET open-play goals. */
export function isPenaltyShootoutKickEvent(e: {
  type: string;
  detail?: string | null;
  time: number;
  timeExtra?: number | null;
}): boolean {
  if (isPenaltyShootoutEvent(e)) return true;
  const d = (e.detail || "").toLowerCase();
  const min = effectiveEventMinute(e);
  // After ET (120'+): penalty attempts are shootout kicks.
  if (min >= 120 && d.includes("penalty")) return true;
  return false;
}

export function isPenaltyShootoutKickScored(e: { type: string; detail?: string | null }): boolean {
  const d = (e.detail || "").toLowerCase();
  if (d.includes("missed")) return false;
  return e.type === "Goal";
}

function mapShootoutEvents(events: ShootoutEvent[]): PenaltyShootoutKick[] {
  return events
    .sort(compareEventsByMinute)
    .map((e) => ({
      team: e.team === "home" ? "home" : "away",
      playerName: e.player.name?.trim() || "Unknown",
      scored: isPenaltyShootoutKickScored(e),
    }));
}

/** Trailing penalty-type goals at the end of the timeline (API omits "shootout" on some feeds). */
function extractTrailingShootoutKicks(events: ShootoutEvent[]): PenaltyShootoutKick[] {
  const sorted = [...events].sort(compareEventsByMinute);
  const trailing: ShootoutEvent[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    const d = (e.detail || "").toLowerCase();
    const isKick =
      e.type === "Goal" && (d.includes("penalty") || d.includes("shootout"));
    if (!isKick) break;
    trailing.unshift(e);
  }
  return trailing.length > 0 ? mapShootoutEvents(trailing) : [];
}

export function extractPenaltyShootoutKicks(
  events: ShootoutEvent[],
  opts: { wentToPenalties?: boolean | null } = {},
): PenaltyShootoutKick[] {
  const explicit = events.filter(isPenaltyShootoutKickEvent);
  if (explicit.length > 0) return mapShootoutEvents(explicit);

  if (opts.wentToPenalties) {
    const trailing = extractTrailingShootoutKicks(events);
    if (trailing.length > 0) return trailing;
  }
  return [];
}

export function penaltyShootoutRunningScores(kicks: PenaltyShootoutKick[]): PenaltyShootoutKickRow[] {
  let runHome = 0;
  let runAway = 0;
  return kicks.map((kick) => {
    if (kick.scored) {
      if (kick.team === "home") runHome++;
      else runAway++;
    }
    return { ...kick, runHome, runAway };
  });
}

/** Pair chronological shootout kicks into home/away columns per round. */
export function penaltyShootoutRounds(kicks: PenaltyShootoutKick[]): PenaltyShootoutRound[] {
  const rows = penaltyShootoutRunningScores(kicks);
  const rounds: PenaltyShootoutRound[] = [];
  for (let i = 0; i < rows.length; i++) {
    const kick = rows[i]!;
    const roundIdx = Math.floor(i / 2);
    if (!rounds[roundIdx]) rounds[roundIdx] = {};
    if (kick.team === "home") rounds[roundIdx].home = kick;
    else rounds[roundIdx].away = kick;
  }
  return rounds.filter((r) => r.home || r.away);
}

export function penaltyShootoutTeamSummaries(
  kicks: PenaltyShootoutKick[],
): { home: PenaltyTeamSummary; away: PenaltyTeamSummary } {
  const home: PenaltyTeamSummary = { scored: [], missed: [] };
  const away: PenaltyTeamSummary = { scored: [], missed: [] };
  for (const kick of kicks) {
    const bucket = kick.team === "home" ? home : away;
    (kick.scored ? bucket.scored : bucket.missed).push(kick.playerName);
  }
  return { home, away };
}

export function shouldShowPenaltyShootoutSection(input: {
  wentToPenalties?: boolean | null;
  penalty?: { home?: number | null; away?: number | null } | null;
  kickCount?: number;
}): boolean {
  if (input.wentToPenalties) return true;
  if (input.penalty?.home != null && input.penalty?.away != null) return true;
  return (input.kickCount ?? 0) > 0;
}

export function penaltyShootoutWinnerSide(
  penalty: { home?: number | null; away?: number | null },
): "home" | "away" | null {
  if (penalty.home == null || penalty.away == null) return null;
  if (penalty.home === penalty.away) return null;
  return penalty.home > penalty.away ? "home" : "away";
}
