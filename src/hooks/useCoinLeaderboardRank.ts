import { useQuery } from "@apollo/client";
import { useMemo } from "react";
import { COIN_LEADERBOARD, COIN_LEADERBOARD_RANK } from "../graphql/coins";

type LeaderRow = {
  rank: number;
  user: { id: string } | null;
};

/** Coin leaderboard position — API rank when available, else top-100 scan. */
export function useCoinLeaderboardRank(userId: string, coins: number): number | null {
  const enabled = Boolean(userId) && coins > 0;

  const { data: lbData } = useQuery<{ coinLeaderboard: LeaderRow[] }>(COIN_LEADERBOARD, {
    variables: { take: 100 },
    skip: !enabled,
    fetchPolicy: "cache-and-network",
  });

  const { data: rankData } = useQuery<{ coinLeaderboardRank: number | null }>(
    COIN_LEADERBOARD_RANK,
    {
      variables: { userId },
      skip: !enabled,
      errorPolicy: "ignore",
      fetchPolicy: "cache-and-network",
    },
  );

  return useMemo(() => {
    if (typeof rankData?.coinLeaderboardRank === "number") {
      return rankData.coinLeaderboardRank;
    }
    const row = lbData?.coinLeaderboard?.find((r) => r.user?.id === userId);
    return row?.rank ?? null;
  }, [rankData, lbData, userId]);
}
