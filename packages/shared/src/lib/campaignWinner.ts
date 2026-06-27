import type { FeedPostCampaignWinnerView } from "../types/feed";

/** Campaign winner row is meaningful once a user was drawn or a note was recorded. */
export function isResolvedCampaignWinner(
  winner?: FeedPostCampaignWinnerView | null,
): boolean {
  if (!winner) return false;
  if (winner.user) return true;
  return Boolean(winner.note?.trim());
}
