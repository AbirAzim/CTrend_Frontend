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

const FINISHED_STATUSES = new Set(["FINISHED", "FT", "AET", "PEN", "AWARDED"]);

export function isMatchScoreFinished(status: string | null | undefined): boolean {
  return FINISHED_STATUSES.has((status ?? "").toUpperCase());
}

function pairLabel(
  prefix: string,
  pair: MatchScorePhase | null | undefined,
): string | null {
  if (pair?.home == null || pair?.away == null) return null;
  return `${prefix} ${pair.home}–${pair.away}`;
}

/**
 * Score after 90 minutes plus extra time (before penalties).
 * `extraTime` is goals scored only in ET, not cumulative.
 */
export function knockoutEffectiveScore(
  ms: MatchScoreBreakdown,
): { home: number; away: number } | null {
  if (ms.fullTime?.home != null && ms.fullTime?.away != null) {
    return {
      home: ms.fullTime.home + (ms.extraTime?.home ?? 0),
      away: ms.fullTime.away + (ms.extraTime?.away ?? 0),
    };
  }
  if (ms.home != null && ms.away != null) {
    return { home: ms.home, away: ms.away };
  }
  return null;
}

/** Fix finished knockout posts when API `home`/`away` omit 90+ET tally. */
export function normalizeMatchScoreDisplay(
  ms: MatchScoreBreakdown,
): { home: number; away: number } | null {
  if (!isMatchScoreFinished(ms.status)) return null;
  if (!hasKnockoutScoreBreakdown(ms)) return null;
  return knockoutEffectiveScore(ms);
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

export function formatKnockoutPenaltyLine(ms: MatchScoreBreakdown): string | null {
  if (ms.penalty?.home == null || ms.penalty?.away == null) return null;
  return `Penalties: ${ms.penalty.home}–${ms.penalty.away}`;
}

/** Main header score — 90+ET before any shootout. */
export function knockoutMainDisplayScore(ms: MatchScoreBreakdown): {
  home: number;
  away: number;
} {
  const normalized = normalizeMatchScoreDisplay(ms);
  if (normalized) return normalized;
  const eff = knockoutEffectiveScore(ms);
  if (eff) return eff;
  return { home: ms.home ?? 0, away: ms.away ?? 0 };
}

/** Sublines under the main score on match detail (penalties only when relevant). */
export function knockoutHeaderSublines(ms: MatchScoreBreakdown): string[] {
  const pen = formatKnockoutPenaltyLine(ms);
  if (pen) return [pen];
  const etH = ms.extraTime?.home ?? 0;
  const etA = ms.extraTime?.away ?? 0;
  if (ms.wentToExtraTime && (etH > 0 || etA > 0)) {
    const et = pairLabel("ET", ms.extraTime);
    return et ? [et] : [];
  }
  return [];
}

/** Finished knockout chip, e.g. "FT 1–1 · Pens 4–3". */
export function formatKnockoutScoreChip(
  ms: MatchScoreBreakdown,
): string | null {
  const eff = knockoutEffectiveScore(ms);
  const pens = pairLabel("Pens", ms.penalty);
  if (eff && (ms.wentToPenalties || pens)) {
    const parts = [`FT ${eff.home}–${eff.away}`];
    if (pens) parts.push(pens);
    return parts.join(" · ");
  }

  const parts: string[] = [];
  const ft = pairLabel("FT", ms.fullTime);
  const etH = ms.extraTime?.home ?? 0;
  const etA = ms.extraTime?.away ?? 0;
  const et = etH > 0 || etA > 0 ? pairLabel("ET", ms.extraTime) : null;
  if (ft) parts.push(ft);
  else if (eff) parts.push(`FT ${eff.home}–${eff.away}`);
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

/** @deprecated Prefer knockoutHeaderSublines — kept for older call sites. */
export function formatKnockoutScoreLines(ms: MatchScoreBreakdown): string[] {
  return knockoutHeaderSublines(ms);
}

/** Label for key-events full-time divider (90+ET score). */
export function knockoutFullTimeDividerLabel(ms: MatchScoreBreakdown): string {
  const { home, away } = knockoutMainDisplayScore(ms);
  if (ms.wentToPenalties) {
    return `After Extra Time  ${home} – ${away}`;
  }
  return `Full-Time  ${home} – ${away}`;
}

/** Top-rated player card label — MoTM only after full time. */
export function matchTopPlayerLabel(isLiveMatch: boolean): string {
  return isLiveMatch ? "Best Player So Far" : "Man of the Match";
}
