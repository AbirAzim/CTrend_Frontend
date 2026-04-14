import { useLazyQuery, useMutation } from "@apollo/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { COMMENT_POST, COMMENTS_BY_POST } from "../graphql/comments";
import {
  IconBookmark,
  IconChevronDown,
  IconChevronUp,
  IconComment,
  IconHeart,
  IconMore,
  IconOpenPost,
  IconShare,
} from "./IgIcons";
import {
  EXTEND_POST_VOTING,
  FEED_POSTS,
  GET_POST_BY_ID,
  VOTE_POST,
} from "../graphql/feed";
import { apolloClient } from "../lib/apolloClient";
import { postPermalink } from "../lib/postPermalink";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
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

/** Title for a compare column: API stats → options → demo labels → minimal fallback. */
function compareOptionLabel(post: FeedPostView, index: number): string {
  const stat = post.optionStats
    ?.find((s) => s.index === index)
    ?.label?.trim();
  if (stat) {
    return stat;
  }
  const opt = post.postOptions?.[index]?.label?.trim();
  if (opt) {
    return opt;
  }
  const demo = post.compareOptionLabels?.[index]?.trim();
  if (demo) {
    return demo;
  }
  return `Side ${index + 1}`;
}

function pctParts(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return counts.map(() => 0);
  }
  const raw = counts.map((c) => (100 * c) / total);
  const floors = raw.map((x) => Math.floor(x));
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  const frac = raw.map((x, i) => ({ i, f: x - floors[i] }));
  frac.sort((a, b) => b.f - a.f);
  const out = [...floors];
  for (let k = 0; k < rem; k += 1) {
    out[frac[k % frac.length].i] += 1;
  }
  return out;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCountdown(targetIso: string): string {
  const end = new Date(targetIso).getTime();
  if (Number.isNaN(end)) {
    return "";
  }
  const diff = end - Date.now();
  if (diff <= 0) {
    return "0m left";
  }
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h left`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m left`;
  }
  return `${Math.max(1, mins)}m left`;
}

type LocalCommentRow = {
  id: string;
  content: string;
  authorLabel: string;
  createdAt: string;
};

type CommentsByPostQueryData = {
  commentsByPost: Array<{
    id: string;
    content: string;
    createdAt: string;
    postId: string;
    parentId: string | null;
    author: {
      id: string;
      username: string;
      displayName?: string | null;
    };
  }>;
};

type Props = {
  post: FeedPostView;
  /** `local` = demo feed only; `api` = call GraphQL `votePost`. */
  voteMode: "api" | "local";
  /** When false, hide “open post page” (e.g. on `/post/:id` itself). Share still works. */
  showPermalinkToolbar?: boolean;
};

export function FeedPostCard({
  post,
  voteMode,
  showPermalinkToolbar = true,
}: Props) {
  const { user: authUser } = useAuth();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState<LocalCommentRow[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [extendEndsAt, setExtendEndsAt] = useState("");
  const [extendError, setExtendError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shareHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fetchComments, { data: commentsData, loading: commentsLoading, error: commentsQueryError }] =
    useLazyQuery<CommentsByPostQueryData>(COMMENTS_BY_POST, { fetchPolicy: "network-only" });

  const [commentMut, { loading: commentPosting }] = useMutation(COMMENT_POST, {
    refetchQueries: [{ query: COMMENTS_BY_POST, variables: { postId: post.id } }],
  });
  const [extendVotingMut, { loading: extendingVoting }] = useMutation(
    EXTEND_POST_VOTING,
    {
      refetchQueries: [
        { query: FEED_POSTS },
        { query: GET_POST_BY_ID, variables: { id: post.id } },
      ],
    },
  );

  useEffect(() => {
    if (commentsOpen && voteMode === "api") {
      void fetchComments({ variables: { postId: post.id } });
    }
  }, [commentsOpen, voteMode, post.id, fetchComments]);

  useEffect(() => {
    return () => {
      if (shareHintTimer.current != null) {
        clearTimeout(shareHintTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function handleSharePostLink() {
    const url = postPermalink(post.id);
    let message = "Link copied";

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: "CTrend post" });
        message = "Shared";
      } catch (e: unknown) {
        if (
          e instanceof DOMException &&
          (e.name === "AbortError" || e.name === "NotAllowedError")
        ) {
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          message = "Could not copy link";
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        message = "Could not copy link";
      }
    }

    setShareHint(message);
    if (shareHintTimer.current != null) {
      clearTimeout(shareHintTimer.current);
    }
    shareHintTimer.current = setTimeout(() => setShareHint(null), 2400);
  }

  const [localUp, setLocalUp] = useState(post.upvoteCount);
  const [localDown, setLocalDown] = useState(post.downvoteCount);
  const [localViewer, setLocalViewer] = useState(post.viewerVote);

  const compareUrls = useMemo(() => {
    const u = post.imageUrls;
    return u.length >= 2 ? u : null;
  }, [post.imageUrls]);

  const isBinaryCompare = compareUrls?.length === 2;
  const isMultiCompare = Boolean(compareUrls && compareUrls.length > 2);

  const [multiCounts, setMultiCounts] = useState<number[]>(() => {
    const urls = post.imageUrls;
    const n = urls.length > 2 ? urls.length : 0;
    if (n === 0) {
      return [];
    }
    const c = post.compareOptionCounts;
    if (c && c.length === n) {
      return [...c];
    }
    return Array.from({ length: n }, () => 0);
  });
  const [multiPick, setMultiPick] = useState<number | null>(
    post.viewerCompareChoice ?? null,
  );

  const [voteMut, { loading: voting }] = useMutation(VOTE_POST, {
    refetchQueries: [
      { query: FEED_POSTS },
      { query: GET_POST_BY_ID, variables: { id: post.id } },
    ],
  });

  const useApiMulti =
    voteMode === "api" &&
    isMultiCompare &&
    Boolean(post.optionStats?.length) &&
    (post.optionStats?.length ?? 0) >= (compareUrls?.length ?? 0);

  const up = voteMode === "local" ? localUp : post.upvoteCount;
  const down = voteMode === "local" ? localDown : post.downvoteCount;
  const viewer = voteMode === "local" ? localViewer : post.viewerVote;

  const multiPercents = useMemo(() => {
    if (!isMultiCompare) {
      return [];
    }
    if (useApiMulti && post.optionStats && compareUrls) {
      return compareUrls.map((_, i) => {
        const s = post.optionStats!.find((x) => x.index === i);
        return s ? Math.round(s.percentage) : 0;
      });
    }
    return pctParts(multiCounts);
  }, [
    isMultiCompare,
    useApiMulti,
    post.optionStats,
    compareUrls,
    multiCounts,
  ]);

  const multiTotalVotes = useMemo(() => {
    if (!isMultiCompare) {
      return 0;
    }
    if (useApiMulti && post.optionStats) {
      return post.optionStats.reduce((a, s) => a + Math.round(s.count), 0);
    }
    return multiCounts.reduce((a, b) => a + b, 0);
  }, [isMultiCompare, useApiMulti, post.optionStats, multiCounts]);

  const multiPickDisplayed = useApiMulti
    ? (post.mySelectedOptionIndex ?? null)
    : multiPick;

  const timeLabel =
    formatRelativeTime(post.createdAt) || (voteMode === "local" ? "demo" : "");
  const votingEndsDate = post.votingEndsAt ? new Date(post.votingEndsAt) : null;
  const votingHasEndDate =
    votingEndsDate != null && !Number.isNaN(votingEndsDate.getTime());
  const votingEndedByTime =
    votingHasEndDate && votingEndsDate.getTime() <= nowMs;
  const isVotingClosed = post.isVotingOpen === false || votingEndedByTime;
  const countdownLabel =
    votingHasEndDate && post.votingEndsAt && !isVotingClosed
      ? formatCountdown(post.votingEndsAt)
      : "";
  const votingStatusLabel = isVotingClosed
    ? "Voting closed"
    : countdownLabel
      ? countdownLabel
      : votingHasEndDate
        ? `Ends ${formatRelativeTime(post.votingEndsAt) || ""}`
      : "Voting open";
  const isAuthor = Boolean(
    authUser?.username &&
      post.authorUsername &&
      authUser.username.toLowerCase() === post.authorUsername.toLowerCase(),
  );
  const voteControlsDisabled = (voteMode === "api" && voting) || isVotingClosed;

  const meLabel =
    authUser?.displayName?.trim() ||
    authUser?.email?.split("@")[0] ||
    "You";

  async function onSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    setCommentError(null);
    const text = commentDraft.trim();
    if (!text) {
      return;
    }

    if (voteMode === "local") {
      setLocalComments((prev) => [
        {
          id: `local-${Date.now()}`,
          content: text,
          authorLabel: meLabel,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setCommentDraft("");
      return;
    }

    try {
      await commentMut({
        variables: {
          postId: post.id,
          input: {
            content: text,
          },
        },
      });
      setCommentDraft("");
    } catch (err: unknown) {
      setCommentError(getApolloErrorMessage(err));
    }
  }

  async function refreshPostVotingState() {
    await apolloClient.refetchQueries({
      include: [FEED_POSTS, GET_POST_BY_ID],
    });
  }

  async function onExtendVoting(e: React.FormEvent) {
    e.preventDefault();
    setExtendError(null);
    if (!extendEndsAt) {
      setExtendError("Pick a new deadline.");
      return;
    }
    const newEnd = new Date(extendEndsAt);
    if (Number.isNaN(newEnd.getTime())) {
      setExtendError("Invalid datetime.");
      return;
    }
    if (newEnd.getTime() <= Date.now()) {
      setExtendError("New deadline must be in the future.");
      return;
    }
    if (votingHasEndDate && newEnd.getTime() <= votingEndsDate!.getTime()) {
      setExtendError("New deadline should be later than current end time.");
      return;
    }
    try {
      await extendVotingMut({
        variables: {
          postId: post.id,
          newVotingEndsAt: newEnd.toISOString(),
        },
      });
      setExtendEndsAt("");
    } catch (err: unknown) {
      setExtendError(getApolloErrorMessage(err));
    }
  }

  async function handleVote(clicked: "UP" | "DOWN") {
    if (isVotingClosed) {
      return;
    }
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

    if (direction === "NONE") {
      return;
    }

    const selectedOptionIndex = clicked === "UP" ? 0 : 1;
    try {
      await voteMut({
        variables: {
          postId: post.id,
          selectedOptionIndex,
        },
      });
    } catch (err: unknown) {
      const message = getApolloErrorMessage(err);
      if (/voting period has ended/i.test(message)) {
        await refreshPostVotingState();
      }
    }
  }

  function handleBinaryCompareTap(side: 0 | 1) {
    void handleVote(side === 0 ? "UP" : "DOWN");
  }

  async function handleMultiCompareTap(index: number) {
    if (isVotingClosed) {
      return;
    }
    if (!compareUrls || compareUrls.length <= 2) {
      return;
    }

    if (voteMode === "api") {
      if (post.mySelectedOptionIndex === index) {
        return;
      }
      try {
        await voteMut({
          variables: {
            postId: post.id,
            selectedOptionIndex: index,
          },
        });
      } catch (err: unknown) {
        const message = getApolloErrorMessage(err);
        if (/voting period has ended/i.test(message)) {
          await refreshPostVotingState();
        }
      }
      return;
    }

    if (multiPick === index) {
      setMultiCounts((prev) => {
        const next = [...prev];
        next[index] = Math.max(0, next[index] - 1);
        return next;
      });
      setMultiPick(null);
      return;
    }

    if (multiPick === null) {
      setMultiCounts((prev) => {
        const next = [...prev];
        next[index] += 1;
        return next;
      });
      setMultiPick(index);
      return;
    }

    const j = multiPick;
    setMultiCounts((prev) => {
      const next = [...prev];
      next[j] = Math.max(0, next[j] - 1);
      next[index] += 1;
      return next;
    });
    setMultiPick(index);
  }

  const binaryTotal = up + down;
  const leftPct =
    binaryTotal > 0 ? Math.round((100 * up) / binaryTotal) : null;
  const rightPct =
    binaryTotal > 0 ? Math.round((100 * down) / binaryTotal) : null;

  const showClassicVoteBar = !compareUrls;

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

      {compareUrls ? (
        <>
          <div
            className={`ig-post-media-wrap ig-post-media-wrap--compare${
              compareUrls.length > 2
                ? " ig-post-media-wrap--compare-swiper"
                : ""
            }`}
          >
            {compareUrls.map((url, i) => {
              if (isBinaryCompare) {
                const side = i as 0 | 1;
                const pct = side === 0 ? leftPct : rightPct;
                const picked =
                  (side === 0 && viewer === "UP") ||
                  (side === 1 && viewer === "DOWN");
                const colTitle = compareOptionLabel(post, side);
                return (
                  <button
                    key={`${post.id}-cmp-${i}`}
                    type="button"
                    className={`ig-compare-cell ig-compare-cell--binary-${side === 0 ? "a" : "b"}${picked ? " ig-compare-cell--picked" : ""}`}
                    disabled={voteControlsDisabled}
                    aria-pressed={picked}
                    aria-label={
                      picked
                        ? `Remove vote for ${colTitle}`
                        : `Vote for ${colTitle}`
                    }
                    onClick={() => handleBinaryCompareTap(side)}
                  >
                    <img src={url} alt="" width={1080} height={1080} loading="lazy" />
                    <span className="ig-compare-pct">
                      {pct !== null ? `${pct}%` : "—"}
                      <span className="ig-compare-pct-sub">{colTitle}</span>
                    </span>
                  </button>
                );
              }

              const pct = multiPercents[i] ?? 0;
              const picked = multiPickDisplayed === i;
              const colTitle = compareOptionLabel(post, i);
              return (
                <button
                  key={`${post.id}-cmp-${i}`}
                  type="button"
                  className={`ig-compare-cell ig-compare-cell--multi${picked ? " ig-compare-cell--picked" : ""}`}
                  disabled={voteControlsDisabled}
                  aria-pressed={picked}
                  aria-label={
                    voteMode === "api"
                      ? picked
                        ? `Your vote: ${colTitle}`
                        : `Vote for ${colTitle}`
                      : picked
                        ? `Remove vote for ${colTitle}`
                        : `Vote for ${colTitle}`
                  }
                  onClick={() => void handleMultiCompareTap(i)}
                >
                  <img src={url} alt="" width={1080} height={1080} loading="lazy" />
                  <span className="ig-compare-pct">
                    {`${pct}%`}
                    <span className="ig-compare-pct-sub">{colTitle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : post.imageUrls[0] ? (
        <div className="ig-post-media-wrap">
          <img
            src={post.imageUrls[0]}
            alt=""
            className="ig-post-media"
            width={1080}
            height={1080}
            loading="lazy"
          />
        </div>
      ) : (
        <div className="ig-post-media-wrap ig-post-media-placeholder-wrap">
          <p className="ig-post-media-placeholder">No image URL</p>
        </div>
      )}

      <div className="cx-post-footer">
        {compareUrls ? (
          <p className="cx-vote-hint-chip">
            {isVotingClosed
              ? "Voting closed for this post."
              : voteMode === "api"
              ? "Tap a side to vote — switch anytime with another tap"
              : "Tap a side to vote — tap again to clear your pick"}
          </p>
        ) : null}
        <div className="cx-voting-state-row">
          <span
            className={`cx-voting-badge${isVotingClosed ? " cx-voting-badge--closed" : ""}`}
          >
            {votingStatusLabel}
          </span>
          {votingHasEndDate ? (
            <time className="cx-voting-time" dateTime={post.votingEndsAt ?? undefined}>
              {isVotingClosed
                ? `Ended ${formatRelativeTime(post.votingEndsAt) || ""}`
                : countdownLabel
                  ? `Ends ${formatRelativeTime(post.votingEndsAt) || ""}`
                  : `Ends ${formatRelativeTime(post.votingEndsAt) || ""}`}
            </time>
          ) : null}
        </div>

        {post.caption ? (
          <div className="cx-post-copy">
            <span className="cx-post-handle">@{post.authorUsername}</span>
            <p className="cx-post-caption-text">{post.caption}</p>
          </div>
        ) : null}

        {isBinaryCompare ? (
          <div className="cx-pulse-card" aria-live="polite">
            <div className="cx-pulse-card-head">
              <span className="cx-pulse-card-title">Live split</span>
              <span className="cx-pulse-card-metric">
                {binaryTotal > 0
                  ? `${binaryTotal.toLocaleString()} votes`
                  : "Be the first to break the tie"}
              </span>
            </div>
            {([0, 1] as const).map((side) => {
              const count = side === 0 ? up : down;
              const pct = side === 0 ? leftPct : rightPct;
              const label = compareOptionLabel(post, side);
              return (
                <div key={side} className="cx-pulse-row">
                  <div className="cx-pulse-row-top">
                    <span className="cx-pulse-name">{label}</span>
                    <span className="cx-pulse-count">
                      {count.toLocaleString()}
                      {pct != null ? ` · ${pct}%` : ""}
                    </span>
                  </div>
                  <div className="cx-pulse-track" aria-hidden>
                    <div
                      className={`cx-pulse-fill cx-pulse-fill--${side === 0 ? "a" : "b"}`}
                      style={{ width: pct != null ? `${pct}%` : "0%" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : isMultiCompare ? (
          <div className="cx-pulse-card" aria-live="polite">
            <div className="cx-pulse-card-head">
              <span className="cx-pulse-card-title">Breakdown</span>
              <span className="cx-pulse-card-metric">
                {multiTotalVotes.toLocaleString()} votes
              </span>
            </div>
            {compareUrls?.map((_, idx) => {
              const pctVal = multiPercents[idx] ?? 0;
              const label = compareOptionLabel(post, idx);
              return (
                <div key={`${post.id}-pulse-${idx}`} className="cx-pulse-row">
                  <div className="cx-pulse-row-top">
                    <span className="cx-pulse-name">{label}</span>
                    <span className="cx-pulse-count">{pctVal}%</span>
                  </div>
                  <div className="cx-pulse-track" aria-hidden>
                    <div
                      className="cx-pulse-fill cx-pulse-fill--multi"
                      style={{ width: `${pctVal}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : !compareUrls ? (
          <div className="cx-pulse-card cx-pulse-card--compact" aria-live="polite">
            <div className="cx-pulse-card-head">
              <span className="cx-pulse-card-title">Pulse</span>
              <span className="cx-pulse-card-metric">
                {(up - down).toLocaleString()} net
              </span>
            </div>
            <div className="cx-pulse-inline">
              <span className="cx-pulse-up">{up.toLocaleString()} up</span>
              <span className="cx-pulse-nub" aria-hidden />
              <span className="cx-pulse-down">{down.toLocaleString()} down</span>
            </div>
          </div>
        ) : null}

        {showClassicVoteBar ? (
          <div className="ig-vote-bar">
            <span className="ig-vote-label">Vote</span>
            <div className="ig-vote-actions">
              <button
                type="button"
                className={`ig-vote-btn${viewer === "UP" ? " ig-vote-btn--active-up" : ""}`}
                disabled={voteControlsDisabled}
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
                disabled={voteControlsDisabled}
                aria-pressed={viewer === "DOWN"}
                aria-label={viewer === "DOWN" ? "Remove downvote" : "Downvote"}
                onClick={() => void handleVote("DOWN")}
              >
                <IconChevronDown active={viewer === "DOWN"} />
                <span>{down.toLocaleString()}</span>
              </button>
            </div>
            <span className="ig-vote-hint">
              {voteMode === "api"
                ? "Tap the other button to change your vote"
                : "Tap again to remove your vote"}
            </span>
          </div>
        ) : null}

        {voteMode === "api" && isAuthor ? (
          <form className="cx-extend-voting-form" onSubmit={(ev) => void onExtendVoting(ev)}>
            <label htmlFor={`extend-${post.id}`} className="cx-extend-voting-label">
              Extend voting
            </label>
            <input
              id={`extend-${post.id}`}
              type="datetime-local"
              className="ig-input"
              value={extendEndsAt}
              onChange={(ev) => setExtendEndsAt(ev.target.value)}
              min={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
            />
            <button type="submit" className="btn-ghost" disabled={extendingVoting}>
              {extendingVoting ? "Updating..." : "Extend voting"}
            </button>
            {extendError ? (
              <small className="error" role="alert">
                {extendError}
              </small>
            ) : null}
          </form>
        ) : null}

        <div className="cx-action-rail" role="toolbar" aria-label="Post actions">
          <button
            type="button"
            className={`cx-action-chip${commentsOpen ? " cx-action-chip--pressed" : ""}`}
            aria-label={commentsOpen ? "Hide comments" : "Show comments"}
            aria-expanded={commentsOpen}
            onClick={() => {
              setCommentsOpen((v) => !v);
              setCommentError(null);
            }}
          >
            <IconComment />
            <span className="cx-action-chip-label">Discuss</span>
          </button>
          <button
            type="button"
            className="cx-action-chip"
            aria-label="Share link to this post"
            title="Copy or share post link"
            onClick={() => void handleSharePostLink()}
          >
            <IconShare />
            <span className="cx-action-chip-label">Share</span>
          </button>
          {showPermalinkToolbar ? (
            <NavLink
              to={`/post/${post.id}`}
              className="cx-action-chip"
              aria-label="View full post"
              title="Open post on its own page"
            >
              <IconOpenPost />
              <span className="cx-action-chip-label">Full page</span>
            </NavLink>
          ) : null}
          <button
            type="button"
            className={`cx-action-chip${liked ? " cx-action-chip--heart" : ""}`}
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
            onClick={() => setLiked((v) => !v)}
          >
            <IconHeart filled={liked} />
            <span className="cx-action-chip-label">Hype</span>
          </button>
          <button
            type="button"
            className={`cx-action-chip${saved ? " cx-action-chip--saved" : ""}`}
            aria-label={saved ? "Unsave" : "Save"}
            aria-pressed={saved}
            onClick={() => setSaved((v) => !v)}
          >
            <IconBookmark filled={saved} />
            <span className="cx-action-chip-label">Keep</span>
          </button>
        </div>

        {shareHint ? (
          <p className="ig-share-hint" role="status">
            {shareHint}
          </p>
        ) : null}

        {timeLabel ? <p className="cx-post-meta-time">{timeLabel}</p> : null}
      </div>

      {commentsOpen ? (
        <section className="ig-post-comments" aria-label="Comments">
          <div className="ig-post-comments-head">
            <h3 className="ig-post-comments-title">Comments</h3>
            {voteMode === "api" && commentsLoading ? (
              <span className="ig-post-comments-status">Loading…</span>
            ) : null}
          </div>
          {voteMode === "api" && commentsQueryError ? (
            <p className="ig-post-comments-error" role="alert">
              {commentsQueryError.message}
            </p>
          ) : null}
          {commentError ? (
            <p className="ig-post-comments-error" role="alert">
              {commentError}
            </p>
          ) : null}
          <ul className="ig-post-comments-list">
            {voteMode === "api"
              ? (commentsData?.commentsByPost ?? []).map((c) => (
                  <li key={c.id} className="ig-post-comment">
                    <span className="ig-post-comment-author">
                      {c.author.displayName?.trim() || c.author.username}
                    </span>
                    <p className="ig-post-comment-body">{c.content}</p>
                    <time className="ig-post-comment-time" dateTime={c.createdAt}>
                      {formatRelativeTime(c.createdAt) || ""}
                    </time>
                  </li>
                ))
              : localComments.map((c) => (
                  <li key={c.id} className="ig-post-comment">
                    <span className="ig-post-comment-author">{c.authorLabel}</span>
                    <p className="ig-post-comment-body">{c.content}</p>
                    <time className="ig-post-comment-time" dateTime={c.createdAt}>
                      {formatRelativeTime(c.createdAt) || "just now"}
                    </time>
                  </li>
                ))}
          </ul>
          {(voteMode === "api"
            ? (commentsData?.commentsByPost?.length ?? 0) === 0 && !commentsLoading
            : localComments.length === 0) ? (
            <p className="ig-post-comments-empty muted">
              No comments yet — say something fun.
            </p>
          ) : null}
          <form
            className="ig-post-comments-form"
            onSubmit={(ev) => void onSubmitComment(ev)}
          >
            <label className="ig-post-comments-label" htmlFor={`comment-${post.id}`}>
              Add a comment
            </label>
            <textarea
              id={`comment-${post.id}`}
              className="ig-post-comments-input"
              rows={2}
              maxLength={5000}
              placeholder="Share your take…"
              value={commentDraft}
              onChange={(ev) => setCommentDraft(ev.target.value)}
              disabled={voteMode === "api" && commentPosting}
            />
            <button
              type="submit"
              className="ig-post-comments-submit"
              disabled={
                commentDraft.trim().length === 0 ||
                (voteMode === "api" && commentPosting)
              }
            >
              {commentPosting ? "Posting…" : "Post"}
            </button>
          </form>
        </section>
      ) : null}
    </article>
  );
}
