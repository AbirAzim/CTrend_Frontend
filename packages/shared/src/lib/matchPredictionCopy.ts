import { getKnockoutRoundLabel, isKnockoutStage } from "./knockoutFixture";

export function knockoutRoundBadgeText(stage: string | null | undefined): string | null {
  const label = getKnockoutRoundLabel(stage);
  return label ? `🏆 ${label}` : null;
}

/** Short intro for score predictions on knockout fixtures. */
export function predictionKnockoutHint(stage: string | null | undefined): string | null {
  if (!isKnockoutStage(stage)) return null;
  return "Predict the exact score before kickoff.";
}

/** How score predictions are graded — knockout fixtures only. */
export function predictionScoringRuleHint(stage: string | null | undefined): string | null {
  if (!isKnockoutStage(stage)) return null;
  return "Graded against the score after 90 minutes plus extra time (if played). Penalty shootouts do not count.";
}

export function predictionPendingExtraTimeMessage(): string {
  return "Extra time is on. Score predictions use the result after extra time — before any penalty shootout.";
}

export function predictionPendingShootoutMessage(): string {
  return "Penalty shootout in progress. Score predictions still use the tied score before penalties started.";
}

export function predictionPendingResultMessage(): string {
  return "Waiting for the final score after extra time to grade predictions.";
}

export function predictionResolvedAfterShootoutNote(): string {
  return "Match decided on penalties. Winning predictions matched the score at the end of extra time.";
}

/** Shown on the feed card during live extra time / shootouts (knockout vote pick). */
export function matchVoteWinnerPendingHint(stage: string | null | undefined): string | null {
  if (!isKnockoutStage(stage)) return null;
  return "Extra time or penalties in progress — your Home/Away vote above is only confirmed once the full match is over.";
}
