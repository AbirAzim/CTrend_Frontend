export type LeaderboardRankTier = "gold" | "silver" | "bronze" | "default";

export function leaderboardRankTier(rank: number): LeaderboardRankTier {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "default";
}

export function formatLeaderboardRank(rank: number): string {
  return String(rank);
}

export function leaderboardRankRowClass(rank: number): string {
  const tier = leaderboardRankTier(rank);
  return tier === "default" ? "" : `lb-row--${tier}`;
}
