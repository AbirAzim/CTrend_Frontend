import { compareEventsByMinute } from "./matchEvents";

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

type ShootoutEvent = {
  team: string;
  type: string;
  detail?: string | null;
  time: number;
  timeExtra?: number | null;
  player: { name?: string | null };
};

export function isPenaltyShootoutEvent(e: { type: string; detail?: string | null }): boolean {
  if (e.type !== "Goal") return false;
  return (e.detail || "").toLowerCase().includes("shootout");
}

export function isPenaltyShootoutKickScored(e: { detail?: string | null }): boolean {
  return !(e.detail || "").toLowerCase().includes("missed");
}

export function extractPenaltyShootoutKicks(events: ShootoutEvent[]): PenaltyShootoutKick[] {
  return events
    .filter(isPenaltyShootoutEvent)
    .sort(compareEventsByMinute)
    .map((e) => ({
      team: e.team === "home" ? "home" : "away",
      playerName: e.player.name?.trim() || "Unknown",
      scored: isPenaltyShootoutKickScored(e),
    }));
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

export function penaltyShootoutWinnerSide(
  penalty: { home?: number | null; away?: number | null },
): "home" | "away" | null {
  if (penalty.home == null || penalty.away == null) return null;
  if (penalty.home === penalty.away) return null;
  return penalty.home > penalty.away ? "home" : "away";
}
