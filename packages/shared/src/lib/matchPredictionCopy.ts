import { getKnockoutRoundLabel, isKnockoutStage } from "./knockoutFixture";

export function knockoutRoundBadgeText(stage: string | null | undefined): string | null {
  const label = getKnockoutRoundLabel(stage);
  return label ? `🏆 ${label}` : null;
}

/** How score predictions are graded for this fixture. */
export function predictionScoringRuleHint(stage: string | null | undefined): string | null {
  if (isKnockoutStage(stage)) {
    return "Knockout: predictions are scored on the score after 90 minutes + extra time (30 min if needed) — not the penalty shootout.";
  }
  return "Predictions are scored on the full-time (90 min) score.";
}

export function predictionKnockoutHint(stage: string | null | undefined): string | null {
  const round = getKnockoutRoundLabel(stage);
  if (!round) return null;
  return `${round} · Predict the score before kickoff (extra time counts; shootout does not).`;
}

export function predictionPendingExtraTimeMessage(): string {
  return "Extra time in progress — your prediction will be checked against the score after 90+ET, before any shootout.";
}

export function predictionPendingShootoutMessage(): string {
  return "Penalty shootout underway — predictions still use the score before the shootout, not the pen tally.";
}

export function predictionResolvedAfterShootoutNote(): string {
  return "Match went to penalties. Correct predictions matched the score at the end of extra time.";
}

export function matchVoteWinnerPendingHint(stage: string | null | undefined): string | null {
  if (!isKnockoutStage(stage)) return null;
  return "Knockout winner is picked after the full match ends (including extra time and penalties if needed).";
}
