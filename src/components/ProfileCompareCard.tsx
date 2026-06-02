import { NavLink } from "react-router-dom";
import { IconEdit, IconLock } from "./IgIcons";

export type ProfileCompareCardPost = {
  id: string;
  imageUrls: string[];
  caption?: string | null;
  category?: { name?: string | null } | null;
  options?: Array<{ label?: string | null }> | null;
  totalVotes?: number | null;
  upvoteCount?: number | null;
  downvoteCount?: number | null;
  commentCount?: number | null;
  hypeCount?: number | null;
  saveCount?: number | null;
  isVotingOpen?: boolean | null;
  votingEndsAt?: string | null;
  isPrizeClaimed?: boolean | null;
  votePrizeClaimedAt?: string | null;
  canClaimPrize?: boolean | null;
  voteWinner?: {
    user?: {
      id: string;
      username: string;
      displayName?: string | null;
    } | null;
  } | null;
};

function votingEnded(post: ProfileCompareCardPost): boolean {
  if (post.isVotingOpen === false) return true;
  if (!post.votingEndsAt) return false;
  const t = new Date(post.votingEndsAt).getTime();
  return !Number.isNaN(t) && t <= Date.now();
}

function voteCount(post: ProfileCompareCardPost): number {
  return post.totalVotes ?? (post.upvoteCount ?? 0) + (post.downvoteCount ?? 0);
}

type Variant = "kept" | "drops" | "voted";

function VotingStatusBadge({ isOpen, variant }: { isOpen: boolean; variant: Variant }) {
  const liveLabel = variant === "kept" ? "Open" : "Live";
  const endedLabel = variant === "kept" ? "Closed" : "Ended";

  if (isOpen) {
    return (
      <span className="cx-profile-status-pill cx-profile-status-pill--live">
        <span className="cx-profile-status-dot" aria-hidden />
        <span>{liveLabel}</span>
      </span>
    );
  }

  return (
    <span className="cx-profile-status-pill cx-profile-status-pill--ended">
      <IconLock size={11} />
      <span>{endedLabel}</span>
    </span>
  );
}

export function ProfileCompareCard({
  post,
  variant,
  onEdit,
}: {
  post: ProfileCompareCardPost;
  variant: Variant;
  onEdit?: () => void;
}) {
  const images = post.imageUrls ?? [];
  const ended = votingEnded(post);
  const isOpen = !ended;
  const totalVotes = voteCount(post);
  const showRichMeta = variant === "drops" || variant === "voted";

  return (
    <article className={`cx-kept-card cx-profile-card cx-profile-card--${variant}`}>
      {variant === "drops" && onEdit ? (
        <button
          type="button"
          className="cx-profile-card-edit"
          title="Edit post"
          aria-label="Edit post"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
        >
          <IconEdit size={15} />
        </button>
      ) : null}
      <NavLink to={`/post/${post.id}`} className="cx-profile-card-link">
        <div className="cx-kept-card-media">
          {images.length === 0 ? (
            <span className="cx-profile-card-media-empty" aria-hidden>
              📷
            </span>
          ) : (
            images.slice(0, 4).map((url, idx) => (
              <span
                key={idx}
                className="cx-kept-card-thumb"
                style={{ backgroundImage: `url(${url})` }}
              />
            ))
          )}
          {images.length > 4 ? (
            <span className="cx-kept-card-more">+{images.length - 4}</span>
          ) : null}
        </div>
        <div className="cx-kept-card-info cx-profile-card-info">
          <div className="cx-profile-card-body">
            <p className="cx-kept-card-title">{post.caption?.trim() || "Untitled compare"}</p>
            {showRichMeta ? (
              <>
                <p className="cx-profile-card-category">{post.category?.name ?? "General"}</p>
                {(post.options ?? []).some((o) => o.label?.trim()) ? (
                  <div className="cx-profile-card-chips">
                    {(post.options ?? []).map((o, i) =>
                      o.label?.trim() ? (
                        <span key={i} className="cx-profile-card-chip">
                          {o.label}
                        </span>
                      ) : null,
                    )}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="cx-profile-card-stats-bar">
            {showRichMeta ? (
              <div className="cx-profile-card-stats" aria-label="Engagement stats">
                <span className="cx-profile-card-stat" title="Votes">
                  🗳️ {totalVotes.toLocaleString()}
                </span>
                <span className="cx-profile-card-stat" title="Comments">
                  💬 {(post.commentCount ?? 0).toLocaleString()}
                </span>
                <span className="cx-profile-card-stat" title="Hype">
                  ❤️ {(post.hypeCount ?? 0).toLocaleString()}
                </span>
                <span className="cx-profile-card-stat" title="Keeps">
                  🔖 {(post.saveCount ?? 0).toLocaleString()}
                </span>
              </div>
            ) : (
              <span className="cx-profile-card-votes-muted">
                {totalVotes.toLocaleString()} votes
              </span>
            )}
            <div className="cx-profile-card-status-row">
              <VotingStatusBadge isOpen={isOpen} variant={variant} />
              {!isOpen && post.voteWinner?.user ? (
                <span className="cx-profile-status-pill cx-profile-status-pill--winner">
                  🏆 Winner: {post.voteWinner.user.displayName?.trim() || `@${post.voteWinner.user.username}`}
                </span>
              ) : null}
              {!isOpen && post.isPrizeClaimed ? (
                <span className="cx-profile-status-pill cx-profile-status-pill--claimed">
                  ✅ Prize claimed
                </span>
              ) : null}
              {!isOpen && post.voteWinner?.user && post.canClaimPrize && !post.isPrizeClaimed ? (
                <span className="cx-profile-status-pill cx-profile-status-pill--claimable">
                  🎁 You can claim from notifications
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </NavLink>
    </article>
  );
}
