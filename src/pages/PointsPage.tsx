import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { REFERRAL_POINTS } from "../graphql/coins";
import { REFERRAL_POINTS_HISTORY } from "../graphql/referrals";
import { useAuth } from "../context/AuthContext";
import { COIN_AMOUNTS, COIN_META, type CoinType } from "../lib/coins";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { formatPointsBdt, pointsToBdt } from "@ctrend/shared/lib/referralInvite";
import { referralHistoryLabel } from "@ctrend/shared/lib/referralHistory";

type HistoryItem = {
  id: string;
  type: CoinType;
  amount: number;
  createdAt: string;
  relatedUserId?: string | null;
  relatedUserName?: string | null;
};

const PAGE = 30;
const REFERRAL_TYPES: CoinType[] = ["INVITE", "REFERRAL_INVITEE"];

export function PointsPage() {
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const isSelf = !userId || userId === user?.id;
  const targetId = userId ?? user?.id ?? "";

  const [tab, setTab] = useState<"history" | "earn">("history");

  const { data: pointsData } = useQuery<{ referralPoints: number }>(REFERRAL_POINTS, {
    variables: { userId: targetId },
    skip: !targetId,
    fetchPolicy: "cache-and-network",
  });

  const { data: histData, fetchMore, loading: histLoading } = useQuery<{
    referralPointsHistory: HistoryItem[];
  }>(REFERRAL_POINTS_HISTORY, {
    variables: { userId: userId ?? null, skip: 0, take: PAGE },
    skip: !targetId,
    fetchPolicy: "cache-and-network",
  });

  const balance = pointsData?.referralPoints ?? 0;
  const history = histData?.referralPointsHistory ?? [];
  const canLoadMore = history.length > 0 && history.length % PAGE === 0;
  const earnedTotal = useMemo(
    () => history.reduce((a, h) => a + h.amount, 0),
    [history],
  );
  const displayBalance = isSelf ? balance : earnedTotal;

  return (
    <div className="cx-points-page">
      <div className="cx-points-hero">
        <div className="cx-points-hero-icon" aria-hidden>
          ✦
        </div>
        <div className="cx-points-hero-body">
          <div className="cx-points-hero-label">
            {isSelf ? "Your referral points" : "Referral points"}
          </div>
          <div className="cx-points-hero-balance">{displayBalance}</div>
          {displayBalance > 0 && (
            <div className="cx-points-hero-bdt">
              ≈ {formatPointsBdt(displayBalance)} withdrawable
            </div>
          )}
          {isSelf && (
            <p className="cx-points-hero-note muted small">
              10 points = 10 BDT when you withdraw. Invite friends or redeem a code to earn more.
            </p>
          )}
        </div>
      </div>

      <div className="cx-points-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`cx-points-tab${tab === "history" ? " cx-points-tab--active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
        <button
          type="button"
          role="tab"
          className={`cx-points-tab${tab === "earn" ? " cx-points-tab--active" : ""}`}
          onClick={() => setTab("earn")}
        >
          How to earn
        </button>
      </div>

      {tab === "history" && (
        <div className="cx-points-list">
          {history.length === 0 && !histLoading && (
            <div className="cx-points-empty">
              {isSelf
                ? "No referral points yet. Invite friends or redeem a code from your profile!"
                : "No referral points yet."}
            </div>
          )}
          {history.map((h) => {
            const meta = COIN_META[h.type] ?? { label: h.type, icon: "✦" };
            const label = referralHistoryLabel(h.type, h.relatedUserName);
            return (
              <div key={h.id} className="cx-points-row">
                <span className="cx-points-row-icon" aria-hidden>
                  {meta.icon}
                </span>
                <div className="cx-points-row-body">
                  <div className="cx-points-row-label">{label}</div>
                  <div className="cx-points-row-time">
                    {formatRelativeTime(h.createdAt)}
                  </div>
                </div>
                <div className="cx-points-row-amounts">
                  <span className="cx-points-row-amount">+{h.amount}</span>
                  <span className="cx-points-row-bdt">{formatPointsBdt(h.amount)}</span>
                </div>
              </div>
            );
          })}
          {canLoadMore && (
            <button
              type="button"
              className="cx-points-more"
              disabled={histLoading}
              onClick={() =>
                void fetchMore({
                  variables: { skip: history.length, take: PAGE },
                  updateQuery: (prev, { fetchMoreResult }) => {
                    if (!fetchMoreResult) return prev;
                    return {
                      referralPointsHistory: [
                        ...(prev.referralPointsHistory ?? []),
                        ...fetchMoreResult.referralPointsHistory,
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

      {tab === "earn" && (
        <div className="cx-points-earn">
          {REFERRAL_TYPES.map((t) => (
            <div key={t} className="cx-points-earn-row">
              <span className="cx-points-row-icon" aria-hidden>
                {COIN_META[t].icon}
              </span>
              <span className="cx-points-earn-label">{COIN_META[t].label}</span>
              <span className="cx-points-earn-amount">+{COIN_AMOUNTS[t]}</span>
            </div>
          ))}
          <p className="cx-points-withdraw-note">
            Withdraw at <strong>10 points = 10 BDT</strong> ({pointsToBdt(10)} BDT per 10 points).
          </p>
          {isSelf && (
            <Link to="/profile" className="cx-points-profile-link">
              Go to profile to invite or redeem ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
