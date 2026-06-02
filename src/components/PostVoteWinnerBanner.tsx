import { Link } from "react-router-dom";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import type { FeedPostVoteWinnerView } from "../types/feed";

type Props = {
  winner: FeedPostVoteWinnerView;
  optionLabel?: string | null;
};

function storyInitial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

/** Shown after voting ends when a random eligible voter was drawn. */
export function PostVoteWinnerBanner({ winner, optionLabel }: Props) {
  const user = winner.user;
  if (!user) return null;

  const display =
    user.displayName?.trim() || `@${user.username}`;
  const avatarUrl = normalizeProfileImageUrl(user.profileImageUrl);

  return (
    <div className="cx-post-vote-winner" role="status" aria-live="polite">
      <div className="cx-post-vote-winner-glow" aria-hidden />
      <div className="cx-post-vote-winner-inner">
        <span className="cx-post-vote-winner-crown" aria-hidden>
          🏆
        </span>
        <div className="cx-post-vote-winner-body">
          <p className="cx-post-vote-winner-kicker">Prize draw winner</p>
          <div className="cx-post-vote-winner-user">
            <span className="ig-avatar sm cx-post-vote-winner-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" decoding="async" />
              ) : (
                storyInitial(display)
              )}
            </span>
            <div>
              <Link
                to={`/profile/${user.id}`}
                className="cx-post-vote-winner-name"
              >
                {display}
              </Link>
              {optionLabel ? (
                <p className="cx-post-vote-winner-meta">
                  Voted for <strong>{optionLabel}</strong>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
