/** Knockout score breakdown helpers — shared by web + mobile. */

export type MatchScorePhase = {
  home?: number | null;
  away?: number | null;
};

export type MatchScoreBreakdown = {
  home?: number | null;
  away?: number | null;
  status?: string | null;
  minute?: number | null;
  phase?: string | null;
  fullTime?: MatchScorePhase | null;
  extraTime?: MatchScorePhase | null;
  penalty?: MatchScorePhase | null;
  wentToExtraTime?: boolean | null;
  wentToPenalties?: boolean | null;
};

function pairLabel(
  prefix: string,
  pair: MatchScorePhase | null | undefined,
): string | null {
  if (pair?.home == null || pair?.away == null) return null;
  return `${prefix} ${pair.home}–${pair.away}`;
}

/** True when ET and/or penalty phase scores are available. */
export function hasKnockoutScoreBreakdown(
  ms: MatchScoreBreakdown | null | undefined,
): boolean {
  if (!ms) return false;
  return Boolean(
    (ms.extraTime?.home != null && ms.extraTime?.away != null) ||
      (ms.penalty?.home != null && ms.penalty?.away != null) ||
      ms.wentToExtraTime ||
      ms.wentToPenalties,
  );
}

/** Finished knockout chip, e.g. "FT 1–1 · ET 2–2 · Pens 4–3". */
export function formatKnockoutScoreChip(
  ms: MatchScoreBreakdown,
): string | null {
  const parts: string[] = [];
  const ft = pairLabel("FT", ms.fullTime);
  const et = pairLabel("ET", ms.extraTime);
  const pens = pairLabel("Pens", ms.penalty);
  if (ft) parts.push(ft);
  if (et) parts.push(et);
  if (pens) parts.push(pens);
  if (parts.length > 0) return parts.join(" · ");
  if (ms.wentToPenalties && ms.home != null && ms.away != null) {
    return `FT ${ms.home}–${ms.away}`;
  }
  if (ms.wentToExtraTime && ms.home != null && ms.away != null) {
    return `ET ${ms.home}–${ms.away}`;
  }
  return null;
}

/** Live knockout status prefix (ET / Pens) for score chips. */
export function formatKnockoutLivePrefix(ms: MatchScoreBreakdown): string | null {
  const phase = (ms.phase ?? "").toUpperCase();
  if (phase === "ET" || phase === "BT") return "ET";
  if (phase === "P" || phase === "PEN") return "Pens";
  return null;
}

/** Main finished score line for match detail headers. */
export function formatKnockoutScoreLines(ms: MatchScoreBreakdown): string[] {
  const lines: string[] = [];
  const ft = pairLabel("90'", ms.fullTime);
  const et = pairLabel("ET", ms.extraTime);
  const pens = pairLabel("Pens", ms.penalty);
  if (ft) lines.push(ft);
  if (et) lines.push(et);
  if (pens) lines.push(pens);
  return lines;
}
