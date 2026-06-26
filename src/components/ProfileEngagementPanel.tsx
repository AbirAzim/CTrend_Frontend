import { useMutation, useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import { USER_CAMPAIGN_WIN_SUMMARY } from "../graphql/campaigns";
import { CLAIM_DAILY_COINS, REFERRAL_POINTS } from "../graphql/coins";
import { REDEEM_REFERRAL_CODE } from "../graphql/referrals";
import { useCoins } from "../context/CoinsContext";
import { COIN_AMOUNTS } from "../lib/coins";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useState } from "react";

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
  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);
  const [redeem, { loading: redeeming }] = useMutation(REDEEM_REFERRAL_CODE);

  const wins = data?.userCampaignWinSummary ?? [];
  const totalWins = wins.reduce((n, w) => n + w.wins, 0);
  const referralPoints = pointsData?.referralPoints ?? 0;
  const coinsHref = isSelf ? "/coins" : `/coins/${userId}`;

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
        <Link to={coinsHref} className="cx-profile-reward-card cx-profile-reward-card--coins">
          <span className="cx-profile-reward-card-glow" aria-hidden />
          <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--coin" aria-hidden>¢</span>
          <span className="cx-profile-reward-card-label">Engagement coins</span>
          <span className="cx-profile-reward-card-value">{coins.toLocaleString()}</span>
          <span className="cx-profile-reward-card-sub">
            {isSelf ? "Activity & voting" : `${displayName ?? "Member"}'s balance`}
          </span>
          {isSelf ? (
            <button
              type="button"
              className="cx-profile-reward-claim"
              disabled={claiming}
              onClick={(e) => void onClaim(e)}
            >
              {claiming ? "Claiming…" : "📅 Daily bonus"}
            </button>
          ) : null}
          {claimMsg ? <span className="cx-profile-reward-claim-msg" role="status">{claimMsg}</span> : null}
          <span className="cx-profile-reward-card-cta">View history ›</span>
        </Link>

        <div className="cx-profile-reward-card cx-profile-reward-card--wins">
          <span className="cx-profile-reward-card-glow cx-profile-reward-card-glow--wins" aria-hidden />
          <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--trophy" aria-hidden>🏆</span>
          <span className="cx-profile-reward-card-label">Campaign wins</span>
          <span className="cx-profile-reward-card-value">{totalWins > 0 ? totalWins : "—"}</span>
          <span className="cx-profile-reward-card-sub">
            {totalWins > 0
              ? `${totalWins} ${totalWins === 1 ? "victory" : "victories"}`
              : isSelf
                ? "Vote in match posts"
                : "No victories yet"}
          </span>
          <div className="cx-profile-reward-wins-body">
            {loading && wins.length === 0 ? (
              <p className="cx-profile-reward-wins-loading muted small">Loading…</p>
            ) : wins.length === 0 ? null : (
              <ul className="cx-profile-reward-wins-list">
                {wins.slice(0, 2).map((row) => {
                  const href = row.campaignSlug ? `/campaign/${row.campaignSlug}` : null;
                  const rowInner = (
                    <>
                      <span className="cx-profile-reward-win-name">{row.campaignName}</span>
                      <span className="cx-profile-reward-win-badge">
                        {row.wins}w
                      </span>
                    </>
                  );
                  return (
                    <li key={row.campaignId ?? row.campaignName}>
                      {href ? (
                        <Link to={href} className="cx-profile-reward-win-row">{rowInner}</Link>
                      ) : (
                        <div className="cx-profile-reward-win-row">{rowInner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="cx-profile-reward-card cx-profile-reward-card--points">
          <span className="cx-profile-reward-card-glow cx-profile-reward-card-glow--points" aria-hidden />
          <span className="cx-profile-reward-card-icon cx-profile-reward-card-icon--points" aria-hidden>✦</span>
          <span className="cx-profile-reward-card-label">Referral points</span>
          <span className="cx-profile-reward-card-value">{referralPoints > 0 ? referralPoints : "—"}</span>
          <span className="cx-profile-reward-card-sub">
            {referralPoints > 0
              ? isSelf
                ? "From invites & codes"
                : "Invite rewards earned"
              : isSelf
                ? "Invite friends to earn"
                : "No invite points yet"}
          </span>
        </div>
      </div>

      {isSelf ? (
        <form className="cx-profile-engage-actions" onSubmit={(e) => void onRedeem(e)}>
          <input
            type="text"
            className="cx-profile-engage-actions-input"
            placeholder="Referral code"
            aria-label="Referral code"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
          />
          <button
            type="submit"
            className="cx-profile-engage-actions-redeem"
            disabled={redeeming || !redeemCode.trim()}
          >
            {redeeming ? "…" : "Redeem"}
          </button>
          {onInviteFriend ? (
            <button
              type="button"
              className="cx-profile-engage-actions-invite"
              onClick={onInviteFriend}
            >
              + Invite
            </button>
          ) : null}
          {redeemMsg ? <p className="cx-profile-engage-actions-msg" role="status">{redeemMsg}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
