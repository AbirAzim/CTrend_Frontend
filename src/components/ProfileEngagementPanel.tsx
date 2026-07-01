import { useMutation, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { USER_CAMPAIGN_WIN_SUMMARY } from "../graphql/campaigns";
import { CLAIM_DAILY_COINS, REFERRAL_POINTS, MONTHLY_PODIUM_STATS } from "../graphql/coins";
import { REDEEM_REFERRAL_CODE } from "../graphql/referrals";
import { PLATFORM_SETTINGS } from "../graphql/admin";
import { useCoins } from "../context/CoinsContext";
import { COIN_AMOUNTS } from "../lib/coins";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useState } from "react";
import { LeaderboardRankBadge } from "./LeaderboardRankBadge";
import { MonthlyPodiumBadge } from "./MonthlyPodiumBadge";
import { useCoinLeaderboardRank } from "../hooks/useCoinLeaderboardRank";

type CampaignWinRow = {
  campaignId?: string | null;
  campaignName: string;
  campaignSlug: string;
  wins: number;
  totalPrize: number;
};

export function ProfileEngagementPanel({
  userId,
  coins,
  isSelf,
  displayName,
  onInviteFriend,
}: {
  userId: string;
  coins: number;
  isSelf: boolean;
  displayName?: string;
  onInviteFriend?: () => void;
}) {
  const { refresh } = useCoins();
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);

  const { data, loading } = useQuery<{ userCampaignWinSummary: CampaignWinRow[] }>(
    USER_CAMPAIGN_WIN_SUMMARY,
    { variables: { userId }, fetchPolicy: "cache-and-network" },
  );
  const { data: pointsData, refetch: refetchPoints } = useQuery<{ referralPoints: number }>(
    REFERRAL_POINTS,
    { variables: { userId }, fetchPolicy: "cache-and-network" },
  );
  const { data: settingsData } = useQuery<{ platformSettings: { referralSystemEnabled: boolean } }>(
    PLATFORM_SETTINGS,
    { fetchPolicy: "cache-first" },
  );
  const { data: podiumData } = useQuery<{
    monthlyPodiumStats: {
      firstPlaceCount: number;
      secondPlaceCount: number;
      thirdPlaceCount: number;
    };
  }>(MONTHLY_PODIUM_STATS, {
    variables: { userId },
    fetchPolicy: "cache-and-network",
  });
  const referralEnabled = Boolean(settingsData?.platformSettings?.referralSystemEnabled);
  const podiumStats = podiumData?.monthlyPodiumStats ?? {
    firstPlaceCount: 0,
    secondPlaceCount: 0,
    thirdPlaceCount: 0,
  };
  const coinRank = useCoinLeaderboardRank(userId, coins);
  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);
  const [redeem, { loading: redeeming }] = useMutation(REDEEM_REFERRAL_CODE);

  const wins = data?.userCampaignWinSummary ?? [];
  const totalWins = wins.reduce((n, w) => n + w.wins, 0);
  const referralPoints = pointsData?.referralPoints ?? 0;
  const coinsHref = isSelf ? "/coins" : `/coins/${userId}`;
  const pointsHref = isSelf ? "/points" : `/points/${userId}`;
  const campaignHref =
    wins.find((w) => w.campaignSlug)?.campaignSlug
      ? `/campaign/${wins.find((w) => w.campaignSlug)!.campaignSlug}`
      : "/world-cup";

  async function onClaim(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelf) return;
    setClaimMsg(null);
    try {
      const { data: res } = await claim();
      const out = res?.claimDailyCoins;
      if (out?.awarded) {
        setClaimMsg(`+${COIN_AMOUNTS.DAILY_STREAK} · ${out.streakDays}-day streak`);
      } else {
        setClaimMsg("Already claimed today");
      }
      refresh();
    } catch (err) {
      setClaimMsg(getApolloErrorMessage(err));
    }
  }

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!isSelf) return;
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setRedeemMsg(null);
    try {
      const { data: res } = await redeem({ variables: { code } });
      const out = res?.redeemReferralCode;
      if (out?.inviteeCoins) {
        setRedeemMsg(`+${out.inviteeCoins} referral points!`);
        setRedeemCode("");
      } else {
        setRedeemMsg("Already redeemed or no reward available.");
      }
      refresh();
      void refetchPoints();
    } catch (err) {
      setRedeemMsg(getApolloErrorMessage(err));
    }
  }

  return (
    <section className="cx-profile-engage" aria-label="Rewards and achievements">
      <p className="cx-profile-engage-kicker">Rewards & achievements</p>
      <div className="cx-profile-engage-grid">
        <div className="cx-profile-reward-card cx-profile-reward-card--coins cx-profile-reward-card--square">
          <span className="cx-profile-reward-card-glow" aria-hidden />
          <div className="cx-profile-reward-top">
            <div className="cx-profile-reward-top-text">
              <span className="cx-profile-reward-card-label">Engagement coins</span>
              <span className="cx-profile-reward-card-value">{coins.toLocaleString()}</span>
            </div>
            <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--coin" aria-hidden>¢</span>
          </div>

          <div className="cx-profile-coin-stats cx-profile-coin-stats--compact">
            {coinRank ? (
              <div className="cx-profile-coin-stat cx-profile-coin-stat--rank">
                <span className="cx-profile-coin-stat-kicker">This month</span>
                <div className="cx-profile-coin-stat-body">
                  <LeaderboardRankBadge rank={coinRank} size="sm" />
                </div>
              </div>
            ) : (
              <div className="cx-profile-coin-stat cx-profile-coin-stat--rank cx-profile-coin-stat--empty">
                <span className="cx-profile-coin-stat-kicker">This month</span>
                <span className="cx-profile-coin-rank-text">No rank yet</span>
              </div>
            )}
            <div className="cx-profile-coin-stat cx-profile-coin-stat--podium">
              <span className="cx-profile-coin-stat-kicker">Podiums</span>
              <MonthlyPodiumBadge stats={podiumStats} layout="grid" />
            </div>
          </div>

          <div className="cx-profile-reward-foot">
            {isSelf ? (
              <button
                type="button"
                className="cx-profile-reward-claim cx-profile-reward-claim--compact"
                disabled={claiming}
                onClick={(e) => void onClaim(e)}
                title="Claim daily bonus"
              >
                {claiming ? "…" : "📅 Daily"}
              </button>
            ) : null}
            <Link to={coinsHref} className="cx-profile-card-action cx-profile-card-action--coins">
              History
            </Link>
            {claimMsg ? (
              <span className="cx-profile-reward-claim-msg" role="status">
                {claimMsg}
              </span>
            ) : null}
          </div>
        </div>

        <div className="cx-profile-reward-card cx-profile-reward-card--wins cx-profile-reward-card--square">
          <span className="cx-profile-reward-card-glow cx-profile-reward-card-glow--wins" aria-hidden />
          <div className="cx-profile-reward-top">
            <div className="cx-profile-reward-top-text">
              <span className="cx-profile-reward-card-label">Campaign wins</span>
              <span className="cx-profile-reward-card-value">{totalWins > 0 ? totalWins : "—"}</span>
              <span className="cx-profile-reward-card-sub">
                {totalWins > 0 ? `${totalWins} wins` : isSelf ? "Match posts" : "None yet"}
              </span>
            </div>
            <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--trophy" aria-hidden>🏆</span>
          </div>
          <div className="cx-profile-reward-wins-body">
            {loading && wins.length === 0 ? (
              <p className="cx-profile-reward-wins-loading muted small">Loading…</p>
            ) : wins.length === 0 ? (
              <p className="cx-profile-reward-wins-empty">Vote in campaigns to win</p>
            ) : (
              <ul className="cx-profile-reward-wins-list">
                {wins.slice(0, 1).map((row) => {
                  const href = row.campaignSlug ? `/campaign/${row.campaignSlug}` : null;
                  return (
                    <li key={row.campaignId ?? row.campaignName}>
                      {href ? (
                        <Link to={href} className="cx-profile-reward-win-row">
                          <span className="cx-profile-reward-win-name">{row.campaignName}</span>
                          <span className="cx-profile-reward-win-badge">{row.wins}w</span>
                        </Link>
                      ) : (
                        <div className="cx-profile-reward-win-row">
                          <span className="cx-profile-reward-win-name">{row.campaignName}</span>
                          <span className="cx-profile-reward-win-badge">{row.wins}w</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="cx-profile-reward-foot">
            <Link to={campaignHref} className="cx-profile-card-action cx-profile-card-action--wins">
              Campaigns
            </Link>
          </div>
        </div>

        <div
          className={`cx-profile-reward-card cx-profile-reward-card--points cx-profile-reward-card--square${referralEnabled ? "" : " cx-profile-reward-card--paused"}`}
          aria-disabled={!referralEnabled}
        >
          {referralEnabled ? (
            <>
              <span className="cx-profile-reward-card-glow cx-profile-reward-card-glow--points" aria-hidden />
              <div className="cx-profile-reward-top">
                <div className="cx-profile-reward-top-text">
                  <span className="cx-profile-reward-card-label">Referral points</span>
                  <span className="cx-profile-reward-card-value">{referralPoints > 0 ? referralPoints : "—"}</span>
                  <span className="cx-profile-reward-card-sub">
                    {referralPoints > 0
                      ? isSelf ? "10 pts = 10 BDT" : "Invite rewards"
                      : isSelf ? "Invite friends" : "None yet"}
                  </span>
                </div>
                <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--points" aria-hidden>✦</span>
              </div>
              <div className="cx-profile-reward-points-body">
                <p className="cx-profile-reward-points-hint">
                  {isSelf ? "Earn from invites & codes" : "Referral balance"}
                </p>
              </div>
              <div className="cx-profile-reward-foot">
                <Link to={pointsHref} className="cx-profile-card-action cx-profile-card-action--points">
                  History
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="cx-profile-reward-top">
                <div className="cx-profile-reward-top-text">
                  <span className="cx-profile-reward-card-label">Referral points</span>
                  <span className="cx-profile-reward-card-value cx-profile-reward-card-value--paused">—</span>
                  <span className="cx-profile-reward-card-sub cx-profile-reward-card-paused-note">
                    Referral rewards are paused
                  </span>
                </div>
                <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--points cx-profile-reward-card-icon--paused" aria-hidden>✦</span>
              </div>
              <div className="cx-profile-reward-points-body cx-profile-reward-points-body--paused">
                <span className="cx-profile-reward-paused-chip">Paused</span>
              </div>
              <div className="cx-profile-reward-foot">
                <span className="cx-profile-card-action cx-profile-card-action--points cx-profile-card-action--disabled">
                  Unavailable
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {isSelf ? (
        <div className="cx-profile-engage-actions">
          <form
            className={`cx-profile-actions-bar${referralEnabled ? "" : " cx-profile-actions-bar--invite-only"}`}
            onSubmit={(e) => {
              if (!referralEnabled) {
                e.preventDefault();
                return;
              }
              void onRedeem(e);
            }}
          >
            {referralEnabled ? (
              <div className="cx-profile-redeem-zone">
                <input
                  type="text"
                  className="cx-profile-code-input"
                  placeholder="Code"
                  aria-label="Referral code"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={12}
                />
                <button
                  type="submit"
                  className="cx-profile-redeem-btn"
                  disabled={redeeming || !redeemCode.trim()}
                >
                  {redeeming ? "…" : "Redeem"}
                </button>
              </div>
            ) : null}
            {onInviteFriend ? (
              <>
                {referralEnabled ? <span className="cx-profile-actions-divider" aria-hidden /> : null}
                <button
                  type="button"
                  className="cx-profile-invite-btn"
                  onClick={onInviteFriend}
                >
                  <strong>Invite</strong>
                  {referralEnabled ? <span>+{COIN_AMOUNTS.INVITE} pts</span> : null}
                </button>
              </>
            ) : null}
          </form>
          {redeemMsg ? <p className="cx-profile-actions-feedback" role="status">{redeemMsg}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
