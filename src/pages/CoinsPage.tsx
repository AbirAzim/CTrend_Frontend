import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import {
  CLAIM_DAILY_COINS,
  COIN_HISTORY,
  COIN_LEADERBOARD,
} from "../graphql/coins";
import { useAuth } from "../context/AuthContext";
import { useCoins } from "../context/CoinsContext";
import { COIN_AMOUNTS, COIN_META, type CoinType } from "../lib/coins";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { LeaderboardRankBadge } from "../components/LeaderboardRankBadge";
import { leaderboardRankRowClass } from "@ctrend/shared/lib/leaderboardRank";

type HistoryItem = {
  id: string;
  type: CoinType;
  amount: number;
  createdAt: string;
};

type LeaderRow = {
  rank: number;
  coins: number;
  user: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

const PAGE = 30;

/** How users earn coins — shown as an explainer to drive engagement. */
const EARN_ORDER: CoinType[] = [
  "INVITE",
  "PREDICTION_CORRECT",
  "CAMPAIGN_WINNER",
  "POST",
  "PREDICTION",
  "VOTE_WINNER",
  "VOTE",
  "HYPE",
  "DAILY_STREAK",
  "COMMENT",
  "POST_VOTED",
  "POST_HYPED",
];

export function CoinsPage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const { balance, refresh } = useCoins();
  const isSelf = !userId || userId === user?.id;

  const [tab, setTab] = useState<"history" | "leaderboard" | "earn">("history");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const { data: histData, fetchMore, loading: histLoading } = useQuery<{
    coinHistory: HistoryItem[];
  }>(COIN_HISTORY, {
    variables: { userId: userId ?? null, skip: 0, take: PAGE },
    fetchPolicy: "cache-and-network",
  });

  const { data: lbData, loading: lbLoading } = useQuery<{
    coinLeaderboard: LeaderRow[];
  }>(COIN_LEADERBOARD, {
    variables: { take: 50 },
    skip: tab !== "leaderboard",
    fetchPolicy: "cache-and-network",
  });

  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);

  const history = histData?.coinHistory ?? [];
  const leaderboard = lbData?.coinLeaderboard ?? [];

  const canLoadMore = history.length > 0 && history.length % PAGE === 0;

  const earnedTotal = useMemo(
    () => history.reduce((a, h) => a + h.amount, 0),
    [history],
  );

  async function onClaim() {
    setClaimMsg(null);
    try {
      const { data } = await claim();
      const res = data?.claimDailyCoins;
      if (res?.awarded) {
        setClaimMsg(`+${COIN_AMOUNTS.DAILY_STREAK} coins! ${res.streakDays}-day streak 🔥`);
      } else {
        setClaimMsg("Already claimed today — come back tomorrow!");
      }
      refresh();
    } catch (err) {
      setClaimMsg(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="cx-coins-page">
      <div className="cx-coins-hero">
        <div className="cx-coins-hero-icon" aria-hidden>
          ¢
        </div>
        <div className="cx-coins-hero-body">
          <div className="cx-coins-hero-label">
            {isSelf ? "Your coins" : "Coins earned"}
          </div>
          <div className="cx-coins-hero-balance">
            {isSelf ? (balance ?? 0) : earnedTotal}
          </div>
          {isSelf && (
            <div className="cx-coins-hero-actions">
              <button
                type="button"
                className="cx-coins-claim"
                onClick={() => void onClaim()}
                disabled={claiming}
              >
                {claiming ? "Claiming…" : "📅 Claim daily bonus"}
              </button>
            </div>
          )}
          {claimMsg && <div className="cx-coins-claim-msg">{claimMsg}</div>}
        </div>
      </div>

      <div className="cx-coins-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`cx-coins-tab${tab === "history" ? " cx-coins-tab--active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
        <button
          type="button"
          role="tab"
          className={`cx-coins-tab${tab === "leaderboard" ? " cx-coins-tab--active" : ""}`}
          onClick={() => setTab("leaderboard")}
        >
          🏆 Leaderboard
        </button>
        <button
          type="button"
          role="tab"
          className={`cx-coins-tab${tab === "earn" ? " cx-coins-tab--active" : ""}`}
          onClick={() => setTab("earn")}
        >
          How to earn
        </button>
      </div>

      {tab === "history" && (
        <div className="cx-coins-list">
          {history.length === 0 && !histLoading && (
            <div className="cx-coins-empty">
              No coins yet. {isSelf ? "Start hyping, voting and posting to earn!" : "Nothing here yet."}
            </div>
          )}
          {history.map((h) => {
            const meta = COIN_META[h.type] ?? { label: h.type, icon: "¢" };
            return (
              <div key={h.id} className="cx-coins-row">
                <span className="cx-coins-row-icon" aria-hidden>
                  {meta.icon}
                </span>
                <div className="cx-coins-row-body">
                  <div className="cx-coins-row-label">{meta.label}</div>
                  <div className="cx-coins-row-time">
                    {formatRelativeTime(h.createdAt)}
                  </div>
                </div>
                <span className="cx-coins-row-amount">+{h.amount}</span>
              </div>
            );
          })}
          {canLoadMore && (
            <button
              type="button"
              className="cx-coins-more"
              disabled={histLoading}
              onClick={() =>
                void fetchMore({
                  variables: { skip: history.length, take: PAGE },
                  updateQuery: (prev, { fetchMoreResult }) => {
                    if (!fetchMoreResult) return prev;
                    return {
                      coinHistory: [
                        ...(prev.coinHistory ?? []),
                        ...fetchMoreResult.coinHistory,
                      ],
                    };
                  },
                })
              }
            >
              {histLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="cx-coins-list">
          {leaderboard.length === 0 && !lbLoading && (
            <div className="cx-coins-empty">No one has earned coins yet.</div>
          )}
          {leaderboard.map((row) => {
            const u = row.user;
            const name = u?.displayName?.trim() || u?.username || "User";
            const isMe = u?.id && u.id === user?.id;
            const img = normalizeProfileImageUrl(u?.profileImageUrl ?? null);
            const rowTierClass = leaderboardRankRowClass(row.rank);
            return (
              <Link
                key={u?.id ?? row.rank}
                to={u?.id ? `/coins/${u.id}` : "#"}
                className={`cx-coins-lb-row${isMe ? " cx-coins-lb-row--me" : ""}${rowTierClass ? ` ${rowTierClass}` : ""}`}
              >
                <LeaderboardRankBadge rank={row.rank} />
                <span className="cx-coins-lb-avatar" aria-hidden>
                  {img ? (
                    <img src={img} alt="" />
                  ) : (
                    <span className="cx-coins-lb-avatar-fallback">
                      {name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="cx-coins-lb-name">
                  {name}
                  {isMe && <span className="cx-coins-lb-you"> (you)</span>}
                </span>
                <span className="cx-coins-lb-coins">
                  <span className="cx-coins-lb-coin-icon" aria-hidden>
                    ¢
                  </span>
                  {row.coins}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {tab === "earn" && (
        <div className="cx-coins-earn">
          {EARN_ORDER.map((t) => (
            <div key={t} className="cx-coins-earn-row">
              <span className="cx-coins-row-icon" aria-hidden>
                {COIN_META[t].icon}
              </span>
              <span className="cx-coins-earn-label">{COIN_META[t].label}</span>
              <span className="cx-coins-earn-amount">+{COIN_AMOUNTS[t]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
