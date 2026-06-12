import { Link } from "react-router-dom";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import type { FeedPostCampaignWinnerView, FeedPostCampaignView } from "../types/feed";

type Props = {
  winner: FeedPostCampaignWinnerView;
  campaign: FeedPostCampaignView | null | undefined;
  winningOptionLabel?: string | null;
};

function initial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

/** Banner shown after a campaign match winner is revealed. */
export function PostCampaignWinnerBanner({ winner, campaign, winningOptionLabel }: Props) {
  const user = winner.user;
  const display = user
    ? (user.displayName?.trim() || `@${user.username}`)
    : null;
  const avatarUrl = user ? normalizeProfileImageUrl(user.profileImageUrl) : null;
  const hasRewards = campaign?.hasRewards;
  const noWinner = !user && winner.note;

  return (
    <div className="cx-campaign-winner" role="status" aria-live="polite">
      <div className="cx-campaign-winner-glow" aria-hidden />
      <div className="cx-campaign-winner-inner">
        <span className="cx-campaign-winner-trophy" aria-hidden>
          {noWinner ? "⚽" : "🏆"}
        </span>
        <div className="cx-campaign-winner-body">
          {noWinner ? (
            <>
              <p className="cx-campaign-winner-kicker">Match result</p>
              <p className="cx-campaign-winner-note">{winner.note}</p>
            </>
          ) : (
            <>
              <p className="cx-campaign-winner-kicker">
                {hasRewards ? "🎉 Winner announced" : "⚽ Match winner"}
              </p>
              {winningOptionLabel ? (
                <p className="cx-campaign-winner-option">
                  {winningOptionLabel} won
                </p>
              ) : null}
              {user && display ? (
                <div className="cx-campaign-winner-user">
                  <span className="ig-avatar sm cx-campaign-winner-avatar">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" decoding="async" />
                    ) : (
                      initial(display)
                    )}
                  </span>
                  <div>
                    <Link
                      to={`/profile/${user.id}`}
                      className="cx-campaign-winner-name"
                    >
                      {display}
                    </Link>
                    {hasRewards && winner.prize ? (
                      <p className="cx-campaign-winner-prize">
                        Prize: ৳{winner.prize}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
