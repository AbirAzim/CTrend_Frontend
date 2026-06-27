/** World Cup knockout stage helpers — shared by web + mobile. */

export const KNOCKOUT_ROUND_LABELS: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter Finals",
  SEMI_FINALS: "Semi Finals",
  THIRD_PLACE: "Third Place Play-off",
  FINAL: "Final",
};

/** Vote option index for Draw (group stage). */
export const MATCH_VOTE_DRAW_INDEX = 2;

export function isKnockoutStage(stage: string | null | undefined): boolean {
  return Boolean(stage && stage !== "GROUP_STAGE");
}

export function getKnockoutRoundLabel(stage: string | null | undefined): string | null {
  if (!isKnockoutStage(stage)) return null;
  return KNOCKOUT_ROUND_LABELS[stage!] ?? stage!.replace(/_/g, " ");
}

type PostVoteMeta = {
  hasDrawOption?: boolean | null;
  fixtureStage?: string | null;
  postOptions?: { label: string }[] | null;
};

export function postHasDrawVoteOption(post: PostVoteMeta): boolean {
  if (post.hasDrawOption === true) return true;
  if (post.hasDrawOption === false) return false;
  if (post.fixtureStage === "GROUP_STAGE" && (post.postOptions?.length ?? 0) >= 3) return true;
  const label = post.postOptions?.[MATCH_VOTE_DRAW_INDEX]?.label?.toLowerCase() ?? "";
  return label.includes("draw");
}

/** Group-stage draw vote hint — intentionally omitted (knockout-only UX). */
export function matchVoteSpecialOptionHint(_post: PostVoteMeta): string | null {
  void _post;
  return null;
}

/** Live extra time (30 min after a draw at 90'). */
export function isExtraTimeLiveStatus(
  status: string | null | undefined,
  phase?: string | null,
): boolean {
  const p = (phase ?? status ?? "").toUpperCase();
  if (p === "ET" || p === "BT" || p === "EXTRA_TIME") return true;
  return false;
}

/** Live penalty shootout — predictions still use the pre-shootout score. */
export function isShootoutLiveStatus(
  status: string | null | undefined,
  phase?: string | null,
): boolean {
  const p = (phase ?? status ?? "").toUpperCase();
  if (p === "P" || p === "PEN" || p === "PENALTY" || p === "PENALTIES") return true;
  return false;
}

/** True while the final 90+ET score is not yet locked for prediction scoring. */
export function isPredictionResultPending(
  resolved: boolean,
  matchStatus: string | null | undefined,
  serverPending?: boolean | null,
  phase?: string | null,
): boolean {
  if (resolved) return false;
  if (serverPending === true) return true;
  if (serverPending === false) return false;
  return (
    isExtraTimeLiveStatus(matchStatus, phase) ||
    isShootoutLiveStatus(matchStatus, phase)
  );
}
