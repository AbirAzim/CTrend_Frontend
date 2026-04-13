import { useMutation } from "@apollo/client";
import { useState } from "react";
import {
  IconBookmark,
  IconChevronDown,
  IconChevronUp,
  IconComment,
  IconHeart,
  IconMore,
  IconShare,
} from "./IgIcons";
import { FEED_POSTS, VOTE_ON_POST } from "../graphql/feed";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import type { FeedPostView, VoteDirectionGql } from "../types/feed";

function storyInitial(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function nextDirection(
  current: FeedPostView["viewerVote"],
  clicked: "UP" | "DOWN",
): VoteDirectionGql {
  if (clicked === "UP") {
    return current === "UP" ? "NONE" : "UP";
  }
  return current === "DOWN" ? "NONE" : "DOWN";
}

type Props = {
  post: FeedPostView;
  /** `local` = demo feed only; `api` = call GraphQL `voteOnPost`. */
  voteMode: "api" | "local";
};

export function FeedPostCard({ post, voteMode }: Props) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const [localUp, setLocalUp] = useState(post.upvoteCount);
  const [localDown, setLocalDown] = useState(post.downvoteCount);
  const [localViewer, setLocalViewer] = useState(post.viewerVote);

  const [voteMut, { loading: voting }] = useMutation(VOTE_ON_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });

  const up = voteMode === "local" ? localUp : post.upvoteCount;
  const down = voteMode === "local" ? localDown : post.downvoteCount;
  const viewer = voteMode === "local" ? localViewer : post.viewerVote;

  const timeLabel =
    formatRelativeTime(post.createdAt) || (voteMode === "local" ? "demo" : "");

  async function handleVote(clicked: "UP" | "DOWN") {
    const direction = nextDirection(viewer, clicked);

    if (voteMode === "local") {
      let nextUp = localUp;
      let nextDown = localDown;
      let nextV = localViewer;

      if (direction === "NONE") {
        if (clicked === "UP" && localViewer === "UP") {
          nextUp -= 1;
          nextV = null;
        }
        if (clicked === "DOWN" && localViewer === "DOWN") {
          nextDown -= 1;
          nextV = null;
        }
      } else if (direction === "UP") {
        if (localViewer === "DOWN") {
          nextDown -= 1;
          nextUp += 1;
        } else if (localViewer !== "UP") {
          nextUp += 1;
        }
        nextV = "UP";
      } else if (direction === "DOWN") {
        if (localViewer === "UP") {
          nextUp -= 1;
          nextDown += 1;
        } else if (localViewer !== "DOWN") {
          nextDown += 1;
        }
        nextV = "DOWN";
      }

      setLocalUp(Math.max(0, nextUp));
      setLocalDown(Math.max(0, nextDown));
      setLocalViewer(nextV);
      return;
    }

    try {
      await voteMut({
        variables: {
          postId: post.id,
          direction,
        },
      });
    } catch {
      /* parent / toast could handle; keep UI stable */
    }
  }

  return (
    <article className="ig-post">
      <header className="ig-post-header">
        <div className="ig-post-user">
          <span className="ig-avatar sm">
            {storyInitial(post.authorUsername)}
          </span>
          <div>
            <span className="ig-post-username">{post.authorUsername}</span>
            {post.authorDisplayName ? (
              <span className="ig-post-meta">{post.authorDisplayName}</span>
            ) : null}
          </div>
        </div>
        <button type="button" className="ig-more-btn" aria-label="More">
          <IconMore />
        </button>
      </header>

      <div className="ig-post-media-wrap">
        <img
          src={post.imageUrl}
          alt=""
          className="ig-post-media"
          width={1080}
          height={1080}
          loading="lazy"
        />
      </div>

      <div className="ig-post-toolbar">
        <div className="ig-post-actions">
          <button
            type="button"
            className={`ig-action-btn${liked ? " ig-action-btn--liked" : ""}`}
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
            onClick={() => setLiked((v) => !v)}
          >
            <IconHeart filled={liked} />
          </button>
          <button type="button" className="ig-action-btn" aria-label="Comment">
            <IconComment />
          </button>
          <button type="button" className="ig-action-btn" aria-label="Share">
            <IconShare />
          </button>
        </div>
        <button
          type="button"
          className="ig-action-btn"
          aria-label={saved ? "Unsave" : "Save"}
          aria-pressed={saved}
          onClick={() => setSaved((v) => !v)}
        >
          <IconBookmark filled={saved} />
        </button>
      </div>

      <div className="ig-vote-bar">
        <span className="ig-vote-label">Vote</span>
        <div className="ig-vote-actions">
          <button
            type="button"
            className={`ig-vote-btn${viewer === "UP" ? " ig-vote-btn--active-up" : ""}`}
            disabled={voteMode === "api" && voting}
            aria-pressed={viewer === "UP"}
            aria-label={viewer === "UP" ? "Remove upvote" : "Upvote"}
            onClick={() => void handleVote("UP")}
          >
            <IconChevronUp active={viewer === "UP"} />
            <span>{up.toLocaleString()}</span>
          </button>
          <button
            type="button"
            className={`ig-vote-btn${viewer === "DOWN" ? " ig-vote-btn--active-down" : ""}`}
            disabled={voteMode === "api" && voting}
            aria-pressed={viewer === "DOWN"}
            aria-label={viewer === "DOWN" ? "Remove downvote" : "Downvote"}
            onClick={() => void handleVote("DOWN")}
          >
            <IconChevronDown active={viewer === "DOWN"} />
            <span>{down.toLocaleString()}</span>
          </button>
        </div>
        <span className="ig-vote-hint">Tap again to remove your vote</span>
      </div>

      <p className="ig-post-likes">
        <strong>{(up - down).toLocaleString()} score</strong>
        <span className="ig-post-likes-detail">
          {" "}
          · {up.toLocaleString()} up · {down.toLocaleString()} down
        </span>
      </p>
      {post.caption ? (
        <p className="ig-post-caption">
          <strong>{post.authorUsername}</strong> {post.caption}
        </p>
      ) : null}
      {timeLabel ? <p className="ig-post-time">{timeLabel}</p> : null}
    </article>
  );
}
