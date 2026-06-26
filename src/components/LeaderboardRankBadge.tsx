import { leaderboardRankTier } from "@ctrend/shared/lib/leaderboardRank";

type Props = {
  rank: number;
  size?: "sm" | "md";
  className?: string;
};

/** Podium-style rank badge — gold / silver / bronze for top 3, numbered disc for the rest. */
export function LeaderboardRankBadge({ rank, size = "md", className = "" }: Props) {
  const tier = leaderboardRankTier(rank);
  return (
    <span
      className={`lb-rank-badge lb-rank-badge--${tier} lb-rank-badge--${size}${className ? ` ${className}` : ""}`}
      aria-label={`Rank ${rank}`}
    >
      <span className="lb-rank-badge-num">{rank}</span>
    </span>
  );
}
