import { useQuery } from "@apollo/client/react";
import { useMemo } from "react";
import { COIN_LEADERBOARD, COIN_LEADERBOARD_RANK } from "@ctrend/shared/graphql/coins";

type LeaderRow = {
  rank: number;
  user: { id: string } | null;
};

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
