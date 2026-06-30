import { useLazyQuery, useMutation, useSubscription } from "@apollo/client";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PostCommentsPanel } from "./PostCommentsPanel";
import {
  IconBookmark,
  IconChevronDown,
  IconChevronUp,
  IconComment,
  IconHeart,
  IconMore,
  IconOpenPost,
  IconShare,
  IconUsers,
} from "./IgIcons";
import {
  DELETE_POST,
  PIN_POST,
  UNPIN_POST,
  FEED_POSTS,
  GET_POST_BY_ID,
  MY_SAVED_POSTS,
  POST_UPDATED,
  POST_VOTE_UPDATED,
  REMOVE_VOTE,
  HYPERS_BY_POST,
  SET_POST_HYPE,
  SET_POST_KEEP,
  VOTERS_BY_POST,
  VOTE_POST,
} from "../graphql/feed";
import { apolloClient } from "../lib/apolloClient";
import { postPermalink } from "../lib/postPermalink";
import { MatchPrediction } from "./MatchPrediction";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { playVoteSound } from "../lib/notificationSound";
import type { FeedPostView, VoteDirectionGql } from "../types/feed";
import { MODERATOR_PLATFORM_NAME, PLATFORM_BRAND_LOGO_URL } from "../lib/moderatorBrand";
import { PostCampaignBadge } from "./PostCampaignBadge";
import { PostVoteWinnerBanner } from "./PostVoteWinnerBanner";
import { PostCampaignWinnerBanner } from "./PostCampaignWinnerBanner";
import { ContentReportModal } from "./ContentReportModal";
import { EditPostModal } from "./EditPostModal";
import { imageObjectPosition } from "../lib/imageFocal";
import { categoryColorRgb } from "../lib/categoryColor";
import { linkifyText } from "../lib/linkify";
import { COIN_AMOUNTS, dispatchCoinEarned, dispatchCoinSpent } from "../lib/coins";
import { isResolvedCampaignWinner } from "../../packages/shared/src/lib/campaignWinner";
import {
  isKnockoutStage,
  isShootoutLiveStatus,
} from "@ctrend/shared/lib/knockoutFixture";
import { matchVoteWinnerPendingHint } from "@ctrend/shared/lib/matchPredictionCopy";
import {
  formatKnockoutLivePrefix,
  formatKnockoutScoreChip,
  hasKnockoutScoreBreakdown,
} from "@ctrend/shared/lib/matchScoreCopy";

function storyInitial(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function authorAvatarUrlCandidates(
  authorProfileImageUrl?: string | null,
  authorEmail?: string | null,
): string[] {
  const profileImage = authorProfileImageUrl?.trim();
  if (profileImage) {
    return [profileImage];
  }
  const email = authorEmail?.trim().toLowerCase();
  if (!email) {
    return [];
  }
  const name = encodeURIComponent(email.split("@")[0] || "user");
  return [
    `https://ui-avatars.com/api/?name=${name}&background=312e81&color=ffffff&size=96&format=png`,
  ];
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
function compareImageStyle(
  post: FeedPostView,
  index: number,
): CSSProperties | undefined {
  const opt = post.postOptions?.[index];
  if (!opt) return undefined;
  if (opt.imageFocalX == null && opt.imageFocalY == null) return undefined;
  return { objectPosition: imageObjectPosition(opt.imageFocalX, opt.imageFocalY) };
}

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

/** Match posts store full country names on `postOptions`; prefer those over vote stats. */
function matchTeamLabel(post: FeedPostView, index: number): string {
  const opt = post.postOptions?.[index]?.label?.trim();
  if (opt) {
    return opt;
  }
  return compareOptionLabel(post, index);
}

// Per-count compare grid recipes — images per row, top → bottom. Cells are all
// the same square size (sized to the widest row), short rows are centered, and
// nothing ever scrolls. Mirrors the mobile FeedPostCard layout.
const COMPARE_ROW_RECIPES: Record<number, number[]> = {
  2: [2],
  3: [2, 1],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
  7: [4, 3],
  8: [3, 3, 2],
  9: [3, 3, 3],
  10: [3, 4, 3],
};

// Rows for n compare images. 2–10 use the hand-tuned recipes; 11+ fall back to
// rows of 4 (last row centered) so cells stay equal-sized.
function getCompareRows(n: number): number[] {
  if (COMPARE_ROW_RECIPES[n]) return COMPARE_ROW_RECIPES[n];
  const rows: number[] = [];
  let rem = n;
  while (rem > 0) {
    const take = Math.min(4, rem);
    rows.push(take);
    rem -= take;
  }
  return rows;
}

function pctParts(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    return counts.map(() => 0);
  }
  const raw = counts.map((c) => (100 * c) / total);
  const floors = raw.map((x) => Math.floor(x));
  const rem = 100 - floors.reduce((a, b) => a + b, 0);
  const frac = raw.map((x, i) => ({ i, f: x - floors[i] }));
  frac.sort((a, b) => b.f - a.f);
  const out = [...floors];
  for (let k = 0; k < rem; k += 1) {
    out[frac[k % frac.length].i] += 1;
  }
  return out;
}

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatCountdown(targetIso: string): string {
  const end = new Date(targetIso).getTime();
  if (Number.isNaN(end)) {
    return "";
  }
  const diff = end - Date.now();
  if (diff <= 0) {
    return "0m 00s left";
  }
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const secText = `${String(secs).padStart(2, "0")}s`;
  if (days > 0) {
    return `${days}d ${hours}h ${mins}m ${secText} left`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m ${secText} left`;
  }
  return `${mins}m ${secText} left`;
}

function formatAbsoluteDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

type VotersByPostData = {
  votersByPost: Array<{
    voteId: string;
    selectedOptionIndex: number;
    anonymous: boolean;
    createdAt: string;
    user?: {
      id: string;
      username?: string | null;
      displayName?: string | null;
      profileImageUrl?: string | null;
    } | null;
  }>;
};

type VoterRow = VotersByPostData["votersByPost"][number];

type HyperRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

function hyperDisplayName(h: HyperRow): string {
  return h.displayName?.trim() || (h.username ? `@${h.username.trim()}` : "User");
}

const VOTERS_PAGE_SIZE = 10;

function voterDisplayName(v: VoterRow): string {
  if (v.anonymous || !v.user) return "Anonymous voter";
  return v.user.displayName?.trim() || v.user.username?.trim() || "Voter";
}

function voterInitial(v: VoterRow): string {
  if (v.anonymous || !v.user) return "?";
  return voterDisplayName(v).replace(/^@/, "").slice(0, 1).toUpperCase();
}

function voterAvatarSrc(v: VoterRow): string | null {
  if (v.anonymous || !v.user) return null;
  return normalizeProfileImageUrl(v.user.profileImageUrl);
}

type VoteLiveState = {
  upvoteCount: number;
  downvoteCount: number;
  viewerVote: FeedPostView["viewerVote"];
  mySelectedOptionIndex: number | null;
  optionStats: FeedPostView["optionStats"];
  isVotingOpen: boolean | null;
  votingEndsAt: string | null;
};

type PostVoteUpdatedData = {
  postVoteUpdated: {
    id: string;
    upvoteCount: number;
    downvoteCount: number;
    viewerVote?: "UP" | "DOWN" | null;
    mySelectedOptionIndex?: number | null;
    myVoteAnonymous?: boolean | null;
    isVotingOpen?: boolean | null;
    votingEndsAt?: string | null;
    matchScore?: {
      status: string | null;
      home: number | null;
      away: number | null;
      minute: number | null;
    } | null;
    optionStats?: Array<{
      index: number;
      label: string;
      count: number;
      percentage: number;
    }> | null;
  };
};

type VotePostMutationData = {
  votePost?: {
    postId: string;
    totalVotes: number;
    countsPerOption: number[];
    percentages: number[];
  } | null;
};

type RemoveVoteMutationData = {
  removeVote?: VotePostMutationData["votePost"];
};

type Props = {
  post: FeedPostView;
  /** `local` = demo feed only; `api` = call GraphQL `votePost`. */
  voteMode: "api" | "local";
  /** When false, hide “open post page” (e.g. on `/post/:id` itself). Share still works. */
  showPermalinkToolbar?: boolean;
  /** From `/post/:id#comment-…` — opens comments and scrolls to this comment. */
  highlightCommentId?: string | null;
};

// Sizes itself to the image's own aspect ratio (clamped) instead of a fixed 16:9 box,
// so portrait/square images neither crop (cover) nor letterbox — mirrors the mobile fix.
const MIN_ANN_IMG_RATIO = 0.66;
const MAX_ANN_IMG_RATIO = 1.91;

function AnnouncementImg({
  src,
  variant = "adaptive",
  className = "",
  onClick,
}: {
  src: string;
  variant?: "adaptive" | "thumb";
  className?: string;
  onClick: () => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <img
      src={src}
      alt=""
      className={`cx-ann-img cx-ann-img--${variant} ${className}`.trim()}
      loading="lazy"
      decoding="async"
      onClick={onClick}
      style={
        variant === "adaptive" && ratio ? { aspectRatio: ratio } : undefined
      }
      onLoad={
        variant === "adaptive"
          ? (e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                const r = Math.min(
                  Math.max(img.naturalWidth / img.naturalHeight, MIN_ANN_IMG_RATIO),
                  MAX_ANN_IMG_RATIO,
                );
                setRatio(r);
              }
            }
          : undefined
      }
    />
  );
}

function AnnouncementLightbox({
  urls,
  index,
  onClose,
  onNavigate,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onNavigate: (next: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < urls.length - 1) onNavigate(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, urls.length, onClose, onNavigate]);

  return (
    <div className="cx-ann-lightbox" onClick={onClose}>
      <button type="button" className="cx-ann-lightbox-close" aria-label="Close" onClick={onClose}>×</button>
      {urls.length > 1 && index > 0 && (
        <button
          type="button"
          className="cx-ann-lightbox-nav cx-ann-lightbox-nav--prev"
          aria-label="Previous image"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
        >‹</button>
      )}
      <img
        src={urls[index]}
        alt="Full size"
        className="cx-ann-lightbox-img"
        onClick={(e) => e.stopPropagation()}
      />
      {urls.length > 1 && index < urls.length - 1 && (
        <button
          type="button"
          className="cx-ann-lightbox-nav cx-ann-lightbox-nav--next"
          aria-label="Next image"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
        >›</button>
      )}
      {urls.length > 1 && (
        <div className="cx-ann-lightbox-counter">{index + 1} / {urls.length}</div>
      )}
    </div>
  );
}

function AnnouncementImageGrid({ urls }: { urls: string[] }) {
  const count = urls.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const lightbox = openIndex !== null ? (
    <AnnouncementLightbox
      urls={urls}
      index={openIndex}
      onClose={() => setOpenIndex(null)}
      onNavigate={setOpenIndex}
    />
  ) : null;

  if (count === 1) {
    return (
      <div className="cx-ann-grid cx-ann-grid--1">
        <AnnouncementImg
          src={urls[0]}
          variant="adaptive"
          onClick={() => setOpenIndex(0)}
        />
        {lightbox}
      </div>
    );
  }

  // Match mobile: equal square thumbs in rows of 2 (last row centred if solo).
  const visibleCount = Math.min(count, 6);
  const hiddenCount = count - visibleCount;
  const rows: number[][] = [];
  for (let i = 0; i < visibleCount; i += 2) {
    rows.push(
      Array.from({ length: Math.min(2, visibleCount - i) }, (_, j) => i + j),
    );
  }

  return (
    <div className="cx-ann-grid cx-ann-grid--rows">
      {rows.map((row, rowIdx) => {
        const isSolo = row.length === 1;
        const isLastRow = rowIdx === rows.length - 1;
        return (
          <div
            key={`ann-row-${row[0]}`}
            className={`cx-ann-row${isSolo ? " cx-ann-row--solo" : ""}`}
          >
            {row.map((urlIdx, colIdx) => {
              const isLastCell = isLastRow && colIdx === row.length - 1;
              return (
                <div key={urlIdx} className="cx-ann-thumb-wrap">
                  <AnnouncementImg
                    src={urls[urlIdx]}
                    variant="thumb"
                    onClick={() => setOpenIndex(urlIdx)}
                  />
                  {isLastCell && hiddenCount > 0 ? (
                    <div className="cx-ann-img-more">+{hiddenCount}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
      {lightbox}
    </div>
  );
}

function FeedPostCardComponent({
  post,
  voteMode,
  showPermalinkToolbar = true,
  highlightCommentId = null,
}: Props) {
  const { user: authUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [liked, setLiked] = useState(Boolean(post.viewerHasHyped));
  const [hypeCountLive, setHypeCountLive] = useState(post.hypeCount ?? 0);
  const [saveLiveCount, setSaveLiveCount] = useState(post.saveCount ?? 0);
  const [saved, setSaved] = useState(Boolean(post.viewerHasSaved));
  const [anonymousVote, setAnonymousVote] = useState(Boolean(post.myVoteAnonymous));
  const [showVoters, setShowVoters] = useState(false);
  const [voterSearch, setVoterSearch] = useState("");
  /** Which option group the modal is scoped to (undefined = all voters). */
  const [voterOptionIndex, setVoterOptionIndex] = useState<number | undefined>(undefined);
  const userDismissedDiscussRef = useRef(false);
  const [commentsOpen, setCommentsOpen] = useState(Boolean(highlightCommentId));

  useEffect(() => {
    userDismissedDiscussRef.current = false;
  }, [post.id]);

  useEffect(() => {
    if (highlightCommentId && !userDismissedDiscussRef.current) {
      setCommentsOpen(true);
    }
  }, [highlightCommentId]);

  const closeDiscuss = useCallback(() => {
    userDismissedDiscussRef.current = true;
    setCommentsOpen(false);
  }, []);

  const toggleDiscuss = useCallback(() => {
    setCommentsOpen((open) => {
      if (open) {
        userDismissedDiscussRef.current = true;
        return false;
      }
      userDismissedDiscussRef.current = false;
      return true;
    });
  }, []);
  const [optimisticVote, setOptimisticVote] = useState<VoteLiveState | null>(null);
  const [voteFx, setVoteFx] = useState(false);
  const [justVotedIndex, setJustVotedIndex] = useState<number | null>(null);
  const justVotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [justUnvotedIndex, setJustUnvotedIndex] = useState<number | null>(null);
  const justUnvotedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voteInFlight = useRef(false);
  /** Latest vote intent queued while a mutation is already in flight. */
  const pendingVoteRef = useRef<{ selectedOptionIndex: number } | null>(null);
  /** Epoch ms: suppress subscription overrides until this timestamp expires. */
  const voteGuardUntilRef = useRef(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shareHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const votersModalCardRef = useRef<HTMLElement | null>(null);
  const [authorAvatarAttempt, setAuthorAvatarAttempt] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const isOwner = !!authUser && !!post.authorId && authUser.id === post.authorId;
  const isAdmin = authUser?.role?.toLowerCase() === "admin";
  const canDelete = isOwner || isAdmin;

  const [deletePostMut, { loading: deleting }] = useMutation(DELETE_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });

  async function handleDelete() {
    try {
      await deletePostMut({ variables: { postId: post.id } });
      setDeleteConfirm(false);
    } catch {
      // error surfaced via Apollo
    }
  }

  const [pinPostMut, { loading: pinningPost }] = useMutation(PIN_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });
  const [unpinPostMut, { loading: unpinningPost }] = useMutation(UNPIN_POST, {
    refetchQueries: [{ query: FEED_POSTS }],
  });
  const pinBusy = pinningPost || unpinningPost;

  async function handleTogglePin() {
    try {
      if (post.pinned) {
        await unpinPostMut({ variables: { postId: post.id } });
      } else {
        await pinPostMut({ variables: { postId: post.id } });
      }
      setMoreOpen(false);
    } catch {
      // error surfaced via Apollo
    }
  }

  const [fetchVoters] = useLazyQuery<VotersByPostData>(VOTERS_BY_POST, {
    fetchPolicy: "network-only",
  });

  // ── "Hyped by" list (Instagram-style) ──
  const [showHypers, setShowHypers] = useState(false);
  const [hypers, setHypers] = useState<HyperRow[]>([]);
  const [hypersLoading, setHypersLoading] = useState(false);
  const [hypersError, setHypersError] = useState<string | null>(null);
  const [fetchHypers] = useLazyQuery<{ hypersByPost: HyperRow[] }>(HYPERS_BY_POST, {
    fetchPolicy: "network-only",
  });
  async function openHypers() {
    if (voteMode !== "api" || hypeCountLive <= 0) return;
    setShowHypers(true);
    setHypersLoading(true);
    setHypersError(null);
    try {
      const { data } = await fetchHypers({ variables: { postId: post.id, take: 200 } });
      setHypers(data?.hypersByPost ?? []);
    } catch (err: unknown) {
      setHypersError(getApolloErrorMessage(err));
    } finally {
      setHypersLoading(false);
    }
  }
  // Paginated voter list (infinite scroll). We accumulate rows ourselves rather
  // than reading the lazy-query cache so we can append pages.
  const [voters, setVoters] = useState<VoterRow[]>([]);
  const [votersHasMore, setVotersHasMore] = useState(false);
  const [votersInitialLoading, setVotersInitialLoading] = useState(false);
  const [votersLoadingMore, setVotersLoadingMore] = useState(false);
  const [votersError, setVotersError] = useState<string | null>(null);
  /** Monotonic id to ignore out-of-order / stale page responses. */
  const votersReqId = useRef(0);

  const [setPostHypeMut, { loading: hypeUpdating }] = useMutation(SET_POST_HYPE);
  const [setPostKeepMut, { loading: keepUpdating }] = useMutation(SET_POST_KEEP);

  useSubscription<PostVoteUpdatedData>(POST_VOTE_UPDATED, {
    skip: voteMode !== "api",
    variables: { postId: post.id },
    onData: ({ data }) => {
      const next = data.data?.postVoteUpdated;
      if (!next || next.id !== post.id) {
        return;
      }
      // Suppress subscription while a vote mutation is in flight or just settled,
      // so a stale broadcast can't revert the user's latest optimistic state.
      if (voteInFlight.current || Date.now() < voteGuardUntilRef.current) {
        setVoteFx(true);
        setTimeout(() => setVoteFx(false), 280);
        return;
      }
      setOptimisticVote({
        upvoteCount: next.upvoteCount,
        downvoteCount: next.downvoteCount,
        viewerVote: next.viewerVote ?? null,
        mySelectedOptionIndex: next.mySelectedOptionIndex ?? null,
        optionStats:
          next.optionStats?.map((s) => ({
            index: s.index,
            label: s.label,
            count: Math.round(s.count),
            percentage: s.percentage,
          })) ?? null,
        isVotingOpen:
          next.isVotingOpen === undefined || next.isVotingOpen === null
            ? null
            : next.isVotingOpen,
        votingEndsAt: next.votingEndsAt ?? null,
      });
      if (next.myVoteAnonymous !== undefined && next.myVoteAnonymous !== null) {
        setAnonymousVote(next.myVoteAnonymous);
      }
      setVoteFx(true);
      setTimeout(() => setVoteFx(false), 280);
    },
  });

  // Live post edits — Apollo auto-merges the returned full post into the cache,
  // so images/caption/options/end-date update in place. Clear any optimistic
  // vote state so a vote-reset edit (changed image) reflects server truth.
  useSubscription<{ postUpdated?: { id: string } }>(POST_UPDATED, {
    variables: { postId: post.id },
    onData: ({ data }) => {
      const next = data.data?.postUpdated;
      if (!next || next.id !== post.id) return;
      if (voteInFlight.current || Date.now() < voteGuardUntilRef.current) return;
      setOptimisticVote(null);
    },
  });

  useEffect(() => {
    setAnonymousVote(Boolean(post.myVoteAnonymous));
  }, [post.id, post.myVoteAnonymous]);

  useEffect(() => {
    return () => {
      if (shareHintTimer.current != null) {
        clearTimeout(shareHintTimer.current);
      }
    };
  }, []);

  const hasActiveCountdown = Boolean(
    (post.votingEndsAt && (post.isVotingOpen ?? true)) ||
    (post.fixtureWinnerAt && new Date(post.fixtureWinnerAt).getTime() > Date.now()),
  );
  useEffect(() => {
    if (!hasActiveCountdown) {
      return;
    }
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActiveCountdown]);

  const isMatchInPlay = post.matchScore?.status === "IN_PLAY";
  const liveMinute = isMatchInPlay ? (post.matchScore?.minute ?? null) : null;

  function closeVotersList() {
    setShowVoters(false);
    setVoterSearch("");
    setVoterOptionIndex(undefined);
    setVoters([]);
    setVotersHasMore(false);
    setVotersError(null);
    votersReqId.current += 1;
  }

  useEffect(() => {
    if (!showVoters) {
      return;
    }

    // The panel floats centered; the page behind stays scrollable (no body
    // lock). Close on Escape or a click outside the card. We use `click` (not
    // mousedown/touchstart) so a scroll/drag gesture never dismisses it, and
    // defer attaching it one tick so the opening click doesn't close it.
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeVotersList();
      }
    }
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && votersModalCardRef.current?.contains(target)) {
        return;
      }
      closeVotersList();
    }

    document.addEventListener("keydown", handleEscape);
    const attachId = setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 0);

    return () => {
      clearTimeout(attachId);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [showVoters]);

  // Fetch (or re-fetch) the first page of voters: on open, and whenever the
  // search term changes. Empty term loads immediately; typing is debounced.
  const fetchVotersPage = useCallback(
    async (skip: number, append: boolean, term: string, optionIndex: number | undefined) => {
      const reqId = ++votersReqId.current;
      if (append) {
        setVotersLoadingMore(true);
      } else {
        setVotersInitialLoading(true);
        setVotersError(null);
      }
      try {
        const { data } = await fetchVoters({
          variables: {
            postId: post.id,
            optionIndex,
            search: term || null,
            skip,
            take: VOTERS_PAGE_SIZE,
          },
        });
        if (reqId !== votersReqId.current) return; // a newer request superseded us
        const rows = data?.votersByPost ?? [];
        setVoters((prev) => (append ? [...prev, ...rows] : rows));
        setVotersHasMore(rows.length === VOTERS_PAGE_SIZE);
      } catch (err: unknown) {
        if (reqId !== votersReqId.current) return;
        if (!append) setVoters([]);
        setVotersError(getApolloErrorMessage(err));
      } finally {
        if (reqId === votersReqId.current) {
          setVotersInitialLoading(false);
          setVotersLoadingMore(false);
        }
      }
    },
    [fetchVoters, post.id],
  );

  useEffect(() => {
    if (!showVoters || voteMode !== "api") {
      return;
    }
    const term = voterSearch.trim();
    const run = () => void fetchVotersPage(0, false, term, voterOptionIndex);
    if (!term) {
      run();
      return;
    }
    const handle = setTimeout(run, 300);
    return () => clearTimeout(handle);
  }, [showVoters, voterSearch, voterOptionIndex, voteMode, fetchVotersPage]);

  function handleVotersScroll(e: React.UIEvent<HTMLDivElement>) {
    if (votersLoadingMore || votersInitialLoading || !votersHasMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      void fetchVotersPage(voters.length, true, voterSearch.trim(), voterOptionIndex);
    }
  }

  useEffect(() => {
    // When Apollo writes subscription data to the cache, post props change and
    // this effect runs.  Don't wipe optimistic state while a vote sequence is
    // still in flight — clearing it here would revert the UI to the stale
    // server snapshot that triggered the prop change.
    if (voteInFlight.current || Date.now() < voteGuardUntilRef.current) {
      return;
    }
    setOptimisticVote(null);
    setHypeCountLive(post.hypeCount ?? 0);
    setSaveLiveCount(post.saveCount ?? 0);
    setSaved(Boolean(post.viewerHasSaved));
    setLiked(Boolean(post.viewerHasHyped));
  }, [
    post.id,
    post.upvoteCount,
    post.downvoteCount,
    post.viewerVote,
    post.mySelectedOptionIndex,
    post.optionStats,
    post.isVotingOpen,
    post.votingEndsAt,
    post.hypeCount,
    post.viewerHasSaved,
    post.viewerHasHyped,
    post.saveCount,
  ]);

  async function handleToggleHype(e?: React.MouseEvent) {
    const nextActive = !liked;
    const delta = nextActive ? 1 : -1;
    // Capture the button element now — the synthetic event is reset after await.
    const origin = (e?.currentTarget as Element | undefined) ?? null;
    setLiked(nextActive);
    setHypeCountLive((prev) => Math.max(0, prev + delta));

    if (voteMode !== "api") {
      return;
    }

    try {
      await setPostHypeMut({
        variables: { postId: post.id, active: nextActive },
      });
      // Coins: hyping earns; un-hyping reverses the reward (symmetric).
      if (nextActive) dispatchCoinEarned(COIN_AMOUNTS.HYPE, origin);
      else dispatchCoinSpent(COIN_AMOUNTS.HYPE);
    } catch {
      // Rollback optimistic UI on failure.
      setLiked(!nextActive);
      setHypeCountLive((prev) => Math.max(0, prev - delta));
    }
  }

  async function handleToggleKeep() {
    const nextKeep = !saved;
    setSaved(nextKeep);
    setSaveLiveCount((prev) => Math.max(0, prev + (nextKeep ? 1 : -1)));
    if (voteMode !== "api") {
      return;
    }
    try {
      await setPostKeepMut({
        variables: { postId: post.id, keep: nextKeep },
        optimisticResponse: {
          __typename: "Mutation",
          setPostKeep: nextKeep,
        },
        update(cache, _result, { variables }) {
          const pid = variables?.postId as string | undefined;
          const keep = variables?.keep;
          if (!pid || typeof keep !== "boolean") {
            return;
          }
          cache.updateQuery({ query: MY_SAVED_POSTS }, (existing) => {
            const prevList = (existing?.mySavedPosts ?? []) as FeedPostView[];
            if (keep) {
              if (prevList.some((p: FeedPostView) => p.id === pid)) {
                return existing ?? { mySavedPosts: prevList };
              }
              return {
                mySavedPosts: [...prevList, { ...post, viewerHasSaved: true }],
              };
            }
            return {
              mySavedPosts: prevList.filter((p: FeedPostView) => p.id !== pid),
            };
          });
        },
      });
    } catch {
      setSaved(!nextKeep);
      setSaveLiveCount((prev) => Math.max(0, prev + (nextKeep ? -1 : 1)));
    }
  }

  function openVotersList(optionIndex?: number) {
    setVoterSearch("");
    setVoterOptionIndex(optionIndex);
    setShowVoters(true);
    // The fetch (initial + on search change) is handled by the effect below.
  }

  async function handleSharePostLink() {
    const url = postPermalink(post.id);
    let message = "Link copied";

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, title: "Ke Jitbe post" });
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

  // Multi-compare layout — fixed per-count rows (see getCompareRows), all cells
  // the same square size (sized to the widest row), short rows centered, no
  // scrolling. Cell width is a CSS calc so it stays responsive to card width.
  const compareRows = useMemo(
    () => getCompareRows(compareUrls?.length ?? 0),
    [compareUrls],
  );
  const compareMaxCols = compareRows.length ? Math.max(...compareRows) : 1;
  const compareRowsWithStart = useMemo(() => {
    let start = 0;
    return compareRows.map((size) => {
      const row = { size, start };
      start += size;
      return row;
    });
  }, [compareRows]);
  const multiCellWidthCss = `calc((100% - ${
    (compareMaxCols - 1) * 2
  }px) / ${compareMaxCols})`;

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

  const [voteMut] = useMutation<VotePostMutationData>(VOTE_POST);
  const [removeVoteMut] = useMutation<RemoveVoteMutationData>(REMOVE_VOTE);

  const useApiMulti =
    voteMode === "api" &&
    isMultiCompare &&
    Boolean((optimisticVote?.optionStats ?? post.optionStats)?.length) &&
    ((optimisticVote?.optionStats ?? post.optionStats)?.length ?? 0) >=
      (compareUrls?.length ?? 0);

  const up =
    voteMode === "local"
      ? localUp
      : (optimisticVote?.upvoteCount ?? post.upvoteCount);
  const down =
    voteMode === "local"
      ? localDown
      : (optimisticVote?.downvoteCount ?? post.downvoteCount);
  const viewer =
    voteMode === "local"
      ? localViewer
      // When an optimistic snapshot exists, trust it fully — including an
      // explicit `null` from a withdraw (don't fall back to the stale post vote).
      : optimisticVote
        ? optimisticVote.viewerVote
        : post.viewerVote;
  const activeOptionStats = optimisticVote?.optionStats ?? post.optionStats;
  const activeMySelectedOptionIndex = optimisticVote
    ? optimisticVote.mySelectedOptionIndex
    : (post.mySelectedOptionIndex ?? null);
  const activeVotingEndsAt = optimisticVote?.votingEndsAt ?? post.votingEndsAt ?? null;
  const activeIsVotingOpen = optimisticVote?.isVotingOpen ?? post.isVotingOpen ?? null;

  const multiPercents = useMemo(() => {
    if (!isMultiCompare) {
      return [];
    }
    if (useApiMulti && activeOptionStats && compareUrls) {
      return compareUrls.map((_, i) => {
        const s = activeOptionStats.find((x) => x.index === i);
        return s ? Math.round(s.percentage) : 0;
      });
    }
    return pctParts(multiCounts);
  }, [
    isMultiCompare,
    useApiMulti,
    activeOptionStats,
    compareUrls,
    multiCounts,
  ]);

  const multiTotalVotes = useMemo(() => {
    if (!isMultiCompare) {
      return 0;
    }
    if (useApiMulti && activeOptionStats) {
      return activeOptionStats.reduce((a, s) => a + Math.round(s.count), 0);
    }
    return multiCounts.reduce((a, b) => a + b, 0);
  }, [isMultiCompare, useApiMulti, activeOptionStats, multiCounts]);

  const multiPickDisplayed = useApiMulti
    ? activeMySelectedOptionIndex
    : multiPick;

  const postTimeIso = post.scheduledAt ?? post.createdAt;
  const timeLabel =
    formatRelativeTime(postTimeIso) || (voteMode === "local" ? "demo" : "");
  // Dim category tag shown after the post-type badge; hover (web) reveals a
  // "Category" tooltip via the `data-tip` attribute.
  const categoryName = post.category?.name?.trim();
  const categoryRgb = categoryColorRgb(post.category);
  const categoryChip = categoryName ? (
    <span
      className="cx-post-category"
      data-tip="Category"
      style={
        categoryRgb
          ? ({ "--cat-rgb": categoryRgb } as CSSProperties)
          : undefined
      }
    >
      {categoryName}
    </span>
  ) : null;

  const ms = post.matchScore;
  const msTeamA = post.postOptions?.[0]?.label?.trim() || post.compareOptionLabels?.[0]?.trim() || null;
  const msTeamB = post.postOptions?.[1]?.label?.trim() || post.compareOptionLabels?.[1]?.trim() || null;
  const msTeamLine = msTeamA && msTeamB ? `${msTeamA} vs ${msTeamB}` : null;
  const matchScoreChip =
    ms && ms.status && ms.status !== "TIMED" && ms.status !== "IN_PLAY" && ms.status !== "PAUSED" ? (
      post.fixtureId ? (
        <button
          type="button"
          className="cx-match-score-chip cx-match-score-chip--ft cx-match-score-chip--link"
          onClick={(e) => { e.stopPropagation(); navigate(`/world-cup/match/${post.fixtureId}`); }}
        >
          {(() => {
            const knockoutLine =
              isKnockoutStage(post.fixtureStage) && hasKnockoutScoreBreakdown(ms)
                ? formatKnockoutScoreChip(ms)
                : null;
            const scoreLine = knockoutLine ?? `FT  ${ms.home ?? 0}–${ms.away ?? 0}`;
            return `${scoreLine}${msTeamLine ? `  ${msTeamLine}` : ""}`;
          })()}
        </button>
      ) : (
        <span className="cx-match-score-chip cx-match-score-chip--ft">
          {(() => {
            const knockoutLine =
              isKnockoutStage(post.fixtureStage) && hasKnockoutScoreBreakdown(ms)
                ? formatKnockoutScoreChip(ms)
                : null;
            const scoreLine = knockoutLine ?? `FT  ${ms.home ?? 0}–${ms.away ?? 0}`;
            return `${scoreLine}${msTeamLine ? `  ${msTeamLine}` : ""}`;
          })()}
        </span>
      )
    ) : null;
  const votingEndsDate = activeVotingEndsAt ? new Date(activeVotingEndsAt) : null;
  const votingHasEndDate =
    votingEndsDate != null && !Number.isNaN(votingEndsDate.getTime());
  const votingEndedByTime =
    votingHasEndDate && votingEndsDate.getTime() <= nowMs;
  const votingRemainingMs =
    votingHasEndDate && votingEndsDate ? Math.max(0, votingEndsDate.getTime() - nowMs) : null;
  const endingSoonLeadMinutes = Math.max(1, Math.round(post.endingSoonLeadMinutes ?? 5));
  const isEndingSoon =
    !votingEndedByTime &&
    activeIsVotingOpen !== false &&
    votingRemainingMs !== null &&
    votingRemainingMs <= endingSoonLeadMinutes * 60_000;
  const isVotingClosed = activeIsVotingOpen === false || votingEndedByTime;
  const countdownLabel =
    votingHasEndDate && activeVotingEndsAt && !isVotingClosed
      ? formatCountdown(activeVotingEndsAt)
      : "";
  const votingEndsAtText =
    votingHasEndDate && activeVotingEndsAt
      ? formatAbsoluteDateTime(activeVotingEndsAt)
      : "";
  const votingStatusLabel = isVotingClosed
    ? "Voting closed"
    : countdownLabel
      ? countdownLabel
      : votingHasEndDate
        ? `Ends ${formatRelativeTime(activeVotingEndsAt) || ""}`
      : "Voting open";
  // Buttons stay enabled while mutation is in flight — `voteInFlight` ref
  // prevents duplicate submissions without the cursor: not-allowed flash.
  const voteControlsDisabled = isVotingClosed;

  // Poll format — stacked option rows (optional left thumbnail), tap to vote,
  // fill bar + % after voting. Reuses the same N-option vote path as multi
  // compare; option labels/images come from `postOptions`, not `imageUrls`
  // (those hold optional body/context images shown above the rows).
  const isAnnouncement = post.format === "announcement";
  const isPoll = !isAnnouncement && (post.format ?? "compare") === "poll";
  const pollOptions = post.postOptions ?? [];
  const pollOptionCount = isPoll
    ? Math.max(pollOptions.length, activeOptionStats?.length ?? 0)
    : 0;
  const pollPercents = useMemo(() => {
    if (!isPoll) return [];
    return Array.from({ length: pollOptionCount }, (_, i) => {
      const s = activeOptionStats?.find((x) => x.index === i);
      return s ? Math.round(s.percentage) : 0;
    });
  }, [isPoll, pollOptionCount, activeOptionStats]);
  const pollTotalVotes = useMemo(() => {
    if (!isPoll || !activeOptionStats) return 0;
    return activeOptionStats.reduce((a, s) => a + Math.round(s.count), 0);
  }, [isPoll, activeOptionStats]);
  const pollPick = isPoll ? activeMySelectedOptionIndex : null;
  // Poll results (%, bar, voter count) are always visible — no vote required.
  const pollShowResults = true;
  const pollLeaderPct = pollPercents.length ? Math.max(...pollPercents) : null;
  const isPollWinnerIndex = (i: number): boolean =>
    isVotingClosed &&
    isPoll &&
    pollTotalVotes > 0 &&
    pollLeaderPct != null &&
    pollLeaderPct > 0 &&
    (pollPercents[i] ?? -1) === pollLeaderPct;

  const meLabel =
    authUser?.displayName?.trim() ||
    authUser?.email?.split("@")[0] ||
    "You";

  async function refreshPostVotingState() {
    await apolloClient.refetchQueries({
      include: [FEED_POSTS, GET_POST_BY_ID],
    });
  }

  async function persistAnonymousPreference(nextAnonymous: boolean) {
    if (voteMode !== "api" || !isAuthenticated || isVotingClosed) {
      return;
    }
    const optionIndex =
      optimisticVote?.mySelectedOptionIndex ?? post.mySelectedOptionIndex ?? null;
    if (optionIndex === null || optionIndex === undefined) {
      return;
    }
    if (voteInFlight.current) {
      return;
    }
    voteInFlight.current = true;
    try {
      await voteMut({
        variables: {
          postId: post.id,
          selectedOptionIndex: optionIndex,
          anonymous: nextAnonymous,
        },
      });
      voteGuardUntilRef.current = Date.now() + 500;
    } catch (err: unknown) {
      setAnonymousVote(!nextAnonymous);
      const message = getApolloErrorMessage(err);
      if (!/voting period has ended/i.test(message)) {
        await refreshPostVotingState();
      }
    } finally {
      voteInFlight.current = false;
    }
  }

  function handleAnonymousToggle(nextAnonymous: boolean) {
    setAnonymousVote(nextAnonymous);
    void persistAnonymousPreference(nextAnonymous);
  }

  function setJustVoted(index: number) {
    if (justVotedTimer.current !== null) clearTimeout(justVotedTimer.current);
    setJustVotedIndex(index);
    justVotedTimer.current = setTimeout(() => setJustVotedIndex(null), 750);
  }

  /** Triggers the exit animation on the cell the user is leaving when switching votes. */
  function setJustUnvoted(index: number) {
    if (justUnvotedTimer.current !== null) clearTimeout(justUnvotedTimer.current);
    setJustUnvotedIndex(index);
    justUnvotedTimer.current = setTimeout(() => setJustUnvotedIndex(null), 500);
  }

  function applyServerVoteSnapshot(
    payload: VotePostMutationData["votePost"] | undefined,
    selectedOptionIndex: number,
  ) {
    const counts = payload?.countsPerOption?.map((n) => Math.max(0, Math.round(n))) ?? [];
    if (counts.length === 0) {
      return;
    }
    const len = compareUrls?.length ?? counts.length;
    const labels = Array.from({ length: len }, (_, i) => compareOptionLabel(post, i));
    const total = counts.reduce((a, b) => a + b, 0);
    const payloadPercentages = payload?.percentages ?? [];
    const percentages =
      payloadPercentages.length === counts.length
        ? payloadPercentages
        : total > 0
          ? counts.map((c) => (100 * c) / total)
          : counts.map(() => 0);

    setOptimisticVote({
      upvoteCount: counts[0] ?? up,
      downvoteCount: counts[1] ?? down,
      viewerVote:
        selectedOptionIndex === 0
          ? "UP"
          : selectedOptionIndex === 1
            ? "DOWN"
            : null,
      mySelectedOptionIndex: selectedOptionIndex < 0 ? null : selectedOptionIndex,
      optionStats: Array.from({ length: len }, (_, i) => ({
        index: i,
        label: labels[i],
        count: counts[i] ?? 0,
        percentage: percentages[i] ?? 0,
      })),
      isVotingOpen: activeIsVotingOpen,
      votingEndsAt: activeVotingEndsAt,
    });
    // Hold the subscription guard briefly so late-arriving broadcasts for
    // older votes don't overwrite the confirmed server result.
    voteGuardUntilRef.current = Date.now() + 500;
    setVoteFx(true);
    setTimeout(() => setVoteFx(false), 220);
  }

  // Shared mutation engine for both vote and unvote so rapid switches
  // (vote → unvote → vote other side) always converge on the user's last
  // intent. `targetIndex >= 0` votes that option; `targetIndex < 0` withdraws.
  // Callers apply the optimistic UI first, then hand the intent to this engine.
  async function processVoteIntent(targetIndex: number) {
    // Arm the subscription guard so a concurrent broadcast can't overwrite us.
    voteGuardUntilRef.current = Date.now() + 2000;
    if (voteInFlight.current) {
      // A mutation is already running — queue this as the latest intent; the
      // running loop will pick it up (vote or unvote) when it finishes.
      pendingVoteRef.current = { selectedOptionIndex: targetIndex };
      return;
    }
    voteInFlight.current = true;
    let currentIdx = targetIndex;
    while (true) {
      try {
        let payload: VotePostMutationData["votePost"] | undefined;
        if (currentIdx < 0) {
          const { data } = await removeVoteMut({ variables: { postId: post.id } });
          payload = data?.removeVote ?? undefined;
        } else {
          const { data } = await voteMut({
            variables: {
              postId: post.id,
              selectedOptionIndex: currentIdx,
              anonymous: anonymousVote,
            },
          });
          payload = data?.votePost ?? undefined;
        }
        const pending = pendingVoteRef.current;
        pendingVoteRef.current = null;
        if (!pending) {
          applyServerVoteSnapshot(payload, currentIdx);
          break;
        }
        // A newer tap arrived mid-flight — discard this result and loop to it.
        currentIdx = pending.selectedOptionIndex;
      } catch (err: unknown) {
        pendingVoteRef.current = null;
        setOptimisticVote(null); // revert on error
        const message = getApolloErrorMessage(err);
        await refreshPostVotingState();
        void message;
        break;
      }
    }
    voteInFlight.current = false;
  }

  // Withdraw the viewer's vote (single tap on the option they already chose).
  // API mode only — local/demo toggles are handled inline by the vote handlers.
  function withdrawVote(removedIndex: number) {
    if (isVotingClosed) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    // Coins: unvoting reverses the vote reward (symmetric with the backend).
    dispatchCoinSpent(COIN_AMOUNTS.VOTE);

    // Optimistic clear: drop the viewer's pick and decrement that option.
    const curUp = optimisticVote?.upvoteCount ?? post.upvoteCount;
    const curDown = optimisticVote?.downvoteCount ?? post.downvoteCount;
    const newUp = removedIndex === 0 ? Math.max(0, curUp - 1) : curUp;
    const newDown = removedIndex === 1 ? Math.max(0, curDown - 1) : curDown;
    const curStats = optimisticVote?.optionStats ?? activeOptionStats ?? null;
    const newStats = curStats
      ? (() => {
          const updated = curStats.map((s) =>
            s.index === removedIndex ? { ...s, count: Math.max(0, s.count - 1) } : s,
          );
          const total = updated.reduce((a, s) => a + s.count, 0);
          return updated.map((s) => ({
            ...s,
            percentage: total > 0 ? (s.count / total) * 100 : 0,
          }));
        })()
      : null;

    playVoteSound();
    setJustUnvoted(removedIndex);
    setOptimisticVote({
      upvoteCount: newUp,
      downvoteCount: newDown,
      viewerVote: null,
      mySelectedOptionIndex: null,
      optionStats: newStats,
      isVotingOpen: optimisticVote?.isVotingOpen ?? activeIsVotingOpen,
      votingEndsAt: optimisticVote?.votingEndsAt ?? activeVotingEndsAt,
    });
    void processVoteIntent(-1);
  }

  async function handleVote(clicked: "UP" | "DOWN", origin?: Element | null) {
    if (isVotingClosed) {
      return;
    }
    if (voteMode === "api" && !isAuthenticated) {
      navigate("/login", { state: { from: location.pathname } });
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
          setJustUnvoted(1); // leaving the DOWN cell
        } else if (localViewer !== "UP") {
          nextUp += 1;
        }
        nextV = "UP";
        setJustVoted(0);
        setDetailsOpen(true);
        playVoteSound();
      } else if (direction === "DOWN") {
        if (localViewer === "UP") {
          nextUp -= 1;
          nextDown += 1;
          setJustUnvoted(0); // leaving the UP cell
        } else if (localViewer !== "DOWN") {
          nextDown += 1;
        }
        nextV = "DOWN";
        setJustVoted(1);
        setDetailsOpen(true);
        playVoteSound();
      }

      setLocalUp(Math.max(0, nextUp));
      setLocalDown(Math.max(0, nextDown));
      setLocalViewer(nextV);
      return;
    }

    if (direction === "NONE") {
      // Re-tapped the side they already chose → withdraw the vote.
      void withdrawVote(clicked === "UP" ? 0 : 1);
      return;
    }

    const selectedOptionIndex = clicked === "UP" ? 0 : 1;

    // Compute instant optimistic counts before the server round-trip.
    const curUp   = optimisticVote?.upvoteCount   ?? post.upvoteCount;
    const curDown = optimisticVote?.downvoteCount  ?? post.downvoteCount;
    const curVote = optimisticVote?.viewerVote     ?? post.viewerVote ?? null;
    let newUp   = curUp;
    let newDown = curDown;
    if (clicked === "UP") {
      newUp += 1;
      if (curVote === "DOWN") newDown = Math.max(0, newDown - 1);
    } else {
      newDown += 1;
      if (curVote === "UP") newUp = Math.max(0, newUp - 1);
    }
    const newBinaryTotal = newUp + newDown;
    const curBinaryStats = optimisticVote?.optionStats ?? activeOptionStats ?? null;
    const newBinaryStats = curBinaryStats
      ? curBinaryStats.map((s) => {
          const c = s.index === 0 ? newUp : s.index === 1 ? newDown : s.count;
          return { ...s, count: c, percentage: newBinaryTotal > 0 ? (c / newBinaryTotal) * 100 : 0 };
        })
      : null;

    // Show feedback instantly — do not wait for the server.
    playVoteSound();
    // If switching from the other side, trigger the exit animation on that cell.
    const prevPickedIndex = curVote === "UP" ? 0 : curVote === "DOWN" ? 1 : null;
    if (prevPickedIndex !== null && prevPickedIndex !== selectedOptionIndex) {
      setJustUnvoted(prevPickedIndex);
    }
    setOptimisticVote({
      upvoteCount:           newUp,
      downvoteCount:         newDown,
      viewerVote:            clicked,
      mySelectedOptionIndex: selectedOptionIndex,
      optionStats:           newBinaryStats,
      isVotingOpen:          optimisticVote?.isVotingOpen ?? activeIsVotingOpen,
      votingEndsAt:          optimisticVote?.votingEndsAt ?? activeVotingEndsAt,
    });
    setJustVoted(selectedOptionIndex);
    setDetailsOpen(true);

    // Coins: earn for voting — only the first vote on this post (switching
    // sides doesn't re-award; the backend is idempotent per post).
    if (curVote === null) dispatchCoinEarned(COIN_AMOUNTS.VOTE, origin);

    await processVoteIntent(selectedOptionIndex);
  }

  function handleBinaryCompareTap(side: 0 | 1, origin?: Element | null) {
    void handleVote(side === 0 ? "UP" : "DOWN", origin);
  }

  // Cast (or switch) an N-option vote by index — shared by multi-compare cells
  // and poll rows. API mode only: applies an optimistic stats update, then the
  // server result reconciles via `processVoteIntent`.
  async function castOptionVote(index: number, origin?: Element | null) {
    if (isVotingClosed) return;
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (activeMySelectedOptionIndex === index) {
      // Re-tapped the option they already chose → withdraw the vote.
      void withdrawVote(index);
      return;
    }
    const hadNoVote = activeMySelectedOptionIndex === null;

    // Compute instant optimistic counts — increment new pick, decrement old.
    const curPick = activeMySelectedOptionIndex;
    const curStats = optimisticVote?.optionStats ?? activeOptionStats ?? null;
    const newStats = (() => {
      if (!curStats) return null;
      const updated = curStats.map((s) => {
        let c = s.count;
        if (s.index === index) c += 1;
        if (curPick !== null && s.index === curPick) c = Math.max(0, c - 1);
        return { ...s, count: c };
      });
      const total = updated.reduce((a, s) => a + s.count, 0);
      return updated.map((s) => ({
        ...s,
        percentage: total > 0 ? (s.count / total) * 100 : 0,
      }));
    })();

    // Instant feedback before server round-trip.
    playVoteSound();
    if (curPick !== null && curPick !== index) {
      setJustUnvoted(curPick); // exit animation on the option being left
    }
    setOptimisticVote({
      upvoteCount:           optimisticVote?.upvoteCount  ?? post.upvoteCount,
      downvoteCount:         optimisticVote?.downvoteCount ?? post.downvoteCount,
      viewerVote:            optimisticVote?.viewerVote   ?? post.viewerVote,
      mySelectedOptionIndex: index,
      optionStats:           newStats,
      isVotingOpen:          optimisticVote?.isVotingOpen  ?? activeIsVotingOpen,
      votingEndsAt:          optimisticVote?.votingEndsAt  ?? activeVotingEndsAt,
    });
    setJustVoted(index);
    setDetailsOpen(true);

    // Coins: earn for the first vote on this post (option switches don't re-award).
    if (hadNoVote) dispatchCoinEarned(COIN_AMOUNTS.VOTE, origin);

    await processVoteIntent(index);
  }

  // Poll row tap → shared option-vote engine (API mode only; the mock/demo
  // feed never produces poll-format posts).
  function handlePollTap(index: number, origin?: Element | null) {
    if (voteMode === "api") {
      void castOptionVote(index, origin);
    }
  }

  async function handleMultiCompareTap(index: number, origin?: Element | null) {
    if (isVotingClosed) {
      return;
    }
    if (voteMode === "api" && !isAuthenticated) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (!compareUrls || compareUrls.length <= 2) {
      return;
    }

    if (voteMode === "api") {
      await castOptionVote(index, origin);
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
      setJustVoted(index);
      setDetailsOpen(true);
      playVoteSound();
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
    setJustUnvoted(j); // exit animation on the cell being left
    setJustVoted(index);
    setDetailsOpen(true);
    playVoteSound();
  }

  const binaryTotal = up + down;
  /** Total votes cast on this post (poll, binary or multi) — shown on the Voters chip. */
  const totalVoteCount = isPoll
    ? pollTotalVotes
    : isMultiCompare
      ? multiTotalVotes
      : binaryTotal;
  const hypeCount = hypeCountLive;
  const commentCount = post.commentCount ?? 0;
  // Flat, chronologically-sorted list (newest first, as returned by the server).
  // A flat list keeps infinite-scroll stable — appending a page never reflows
  // rows above the viewport the way regrouping would.
  const showVoterOptionTag = voterOptionIndex === undefined;
  const loadedVotersCount = voters.length;
  const voterOptionCount = isPoll
    ? pollOptionCount
    : compareUrls?.length ?? 2;
  const voterFilterTabs = useMemo(() => {
    if (voterOptionCount < 1) return [];
    return [
      { label: "All", value: undefined as number | undefined },
      ...Array.from({ length: voterOptionCount }, (_, i) => ({
        label: compareOptionLabel(post, i) || `Option ${i + 1}`,
        value: i,
      })),
    ];
  }, [voterOptionCount, post]);
  const leftPct =
    binaryTotal > 0 ? Math.round((100 * up) / binaryTotal) : null;
  const rightPct =
    binaryTotal > 0 ? Math.round((100 * down) / binaryTotal) : null;
  const multiCountsForSummary = useMemo(() => {
    if (!isMultiCompare) {
      return [];
    }
    if (useApiMulti && activeOptionStats && compareUrls) {
      return compareUrls.map((_, i) => {
        const s = activeOptionStats.find((x) => x.index === i);
        return s ? Math.max(0, Math.round(s.count)) : 0;
      });
    }
    return multiCounts;
  }, [isMultiCompare, useApiMulti, activeOptionStats, compareUrls, multiCounts]);

  const votingWinnerSummary = useMemo(() => {
    if (!isVotingClosed) {
      return "";
    }

    if (isPoll) {
      if (pollTotalVotes <= 0 || pollPercents.length === 0) {
        return "No votes were cast";
      }
      const topPct = Math.max(...pollPercents);
      const leaders = pollPercents
        .map((pct, idx) => ({ pct, idx }))
        .filter((row) => row.pct === topPct);
      if (leaders.length !== 1) {
        return `Tie at ${topPct}%`;
      }
      const winnerIndex = leaders[0]!.idx;
      const winnerLabel = compareOptionLabel(post, winnerIndex);
      const winnerVotes = Math.round(
        activeOptionStats?.find((s) => s.index === winnerIndex)?.count ?? 0,
      );
      const verb = post.matchType ? "leads" : "won";
      return `${winnerLabel} ${verb} · ${topPct}% (${winnerVotes.toLocaleString()} votes)`;
    }

    if (isMultiCompare && compareUrls && compareUrls.length > 0) {
      if (multiTotalVotes <= 0 || multiPercents.length === 0) {
        return "No votes were cast";
      }
      const topPct = Math.max(...multiPercents);
      const leaders = multiPercents
        .map((pct, idx) => ({ pct, idx }))
        .filter((row) => row.pct === topPct);
      if (leaders.length !== 1) {
        return `Tie at ${topPct}%`;
      }
      const winnerIndex = leaders[0]!.idx;
      const winnerLabel = compareOptionLabel(post, winnerIndex);
      const winnerVotes = multiCountsForSummary[winnerIndex] ?? 0;
      const verb = post.matchType ? "leads" : "won";
      return `${winnerLabel} ${verb} · ${topPct}% (${winnerVotes.toLocaleString()} votes)`;
    }

    if (binaryTotal <= 0 || leftPct == null || rightPct == null) {
      return "No votes were cast";
    }
    if (up === down) {
      return `Tie · ${leftPct}% each`;
    }
    const winnerSide = up > down ? 0 : 1;
    const winnerLabel =
      isBinaryCompare && compareUrls
        ? compareOptionLabel(post, winnerSide)
        : winnerSide === 0
          ? "Upvotes"
          : "Downvotes";
    const winnerVotes = winnerSide === 0 ? up : down;
    const winnerPct = winnerSide === 0 ? leftPct : rightPct;
    const verb = post.matchType ? "leads" : "won";
    return `${winnerLabel} ${verb} · ${winnerPct}% (${winnerVotes.toLocaleString()} votes)`;
  }, [
    isVotingClosed,
    isPoll,
    pollTotalVotes,
    pollPercents,
    activeOptionStats,
    isMultiCompare,
    compareUrls,
    multiTotalVotes,
    multiPercents,
    multiCountsForSummary,
    binaryTotal,
    leftPct,
    rightPct,
    up,
    down,
    isBinaryCompare,
    post,
  ]);
  const binaryLeaderPct =
    leftPct != null && rightPct != null ? Math.max(leftPct, rightPct) : null;
  const binaryHasTie =
    leftPct != null && rightPct != null && leftPct === rightPct;
  const multiLeaderPct = multiPercents.length > 0 ? Math.max(...multiPercents) : null;
  const multiLeaderCount =
    multiLeaderPct == null
      ? 0
      : multiPercents.filter((value) => value === multiLeaderPct).length;

  // Winner predicates used to visually highlight the winning option(s) once
  // voting is closed. These are tie-aware: when options share the top result
  // they ALL count as winners (crown, no losing scrim) — a tie means everyone
  // on top won, so nobody should be dimmed as a loser.
  const isBinaryWinnerSide = (side: 0 | 1): boolean => {
    if (!isVotingClosed || !isBinaryCompare || binaryTotal <= 0) return false;
    if (up === down) return true; // tie → both sides win
    return side === 0 ? up > down : down > up;
  };
  const isMultiWinnerIndex = (idx: number): boolean => {
    if (
      !isVotingClosed ||
      !isMultiCompare ||
      multiTotalVotes <= 0 ||
      multiLeaderPct == null ||
      multiLeaderPct <= 0
    ) {
      return false;
    }
    // Every option matching the top percentage wins (covers ties for first);
    // lower options remain genuine losers and stay dimmed.
    return (multiPercents[idx] ?? -1) === multiLeaderPct;
  };

  // True once the viewer has cast at least one vote on this post
  const hasVoted = isBinaryCompare
    ? viewer !== null
    : isMultiCompare
      ? multiPickDisplayed !== null
      : viewer !== null; // classic UP/DOWN bar
  const showCompareStats = hasVoted || isVotingClosed;

  const showClassicVoteBar = !isAnnouncement && !compareUrls && !isPoll;
  const postAuthorAvatarCandidates = authorAvatarUrlCandidates(
    post.authorProfileImageUrl,
    post.authorEmail,
  );
  const postAuthorAvatar =
    postAuthorAvatarCandidates[authorAvatarAttempt] ?? null;

  useEffect(() => {
    setAuthorAvatarAttempt(0);
  }, [post.id, post.authorEmail]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [post.id]);

  const isPlatformPost = post.postType === "system";
  const isUserGlobalPost = Boolean(post.isUserGlobalBroadcast) && !isPlatformPost;
  const hasCampaign = Boolean(post.campaign);
  const isMatchPost = Boolean(post.matchType);
  const showVoteWinner =
    !isMatchPost &&
    post.isVotingOpen === false &&
    post.voteWinner?.user &&
    (post.upvoteCount + post.downvoteCount > 0 ||
      (post.optionStats?.reduce((s, o) => s + o.count, 0) ?? 0) > 0);
  const winnerOptionLabel =
    post.voteWinner?.selectedOptionIndex != null
      ? post.postOptions?.[post.voteWinner.selectedOptionIndex]?.label ??
        post.optionStats?.find(
          (s) => s.index === post.voteWinner?.selectedOptionIndex,
        )?.label ??
        null
      : null;

  // Campaign match lifecycle
  const showCampaignWinner =
    Boolean(post.campaignWinner) &&
    isResolvedCampaignWinner(post.campaignWinner) &&
    isMatchPost;
  const campaignWinnerOptionLabel =
    post.campaignWinner?.winningOption != null
      ? post.postOptions?.[post.campaignWinner.winningOption]?.label ??
        post.optionStats?.find((s) => s.index === post.campaignWinner?.winningOption)?.label ??
        null
      : null;
  // Show "match in progress" only for fixture-linked posts where voting has
  // closed (kickoff passed) but the real match result isn't in yet.
  const isLiveMatch =
    post.matchScore?.status === "IN_PLAY" || post.matchScore?.status === "PAUSED";
  const matchStatus = post.matchScore?.status ?? null;
  const isMatchFinished =
    matchStatus === "FT" || matchStatus === "AET" || matchStatus === "PEN" || matchStatus === "AWARDED" || matchStatus === "FINISHED";
  const isMatchNotStarted = !isLiveMatch && !isMatchFinished;

  const showMatchLive = isMatchPost && isLiveMatch;
  const showMatchStartsSoon = isMatchPost && isMatchNotStarted && isVotingClosed && !showCampaignWinner;
  const showMatchCalculating =
    isMatchPost && isMatchFinished && isVotingClosed && !showCampaignWinner;
  const matchWinnerPendingHint = matchVoteWinnerPendingHint(post.fixtureStage);
  const showLiveEtBanner =
    isMatchPost &&
    isLiveMatch &&
    !showCampaignWinner &&
    Boolean(matchWinnerPendingHint) &&
    isShootoutLiveStatus(matchStatus, post.matchScore?.phase);

  const winnerCountdownMs = post.fixtureWinnerAt
    ? Math.max(0, new Date(post.fixtureWinnerAt).getTime() - nowMs)
    : null;
  const winnerCountdownLabel = (() => {
    if (!winnerCountdownMs) return null;
    const totalSec = Math.floor(winnerCountdownMs / 1000);
    if (totalSec <= 0) return null;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  })();

  const livePhaseLabel =
    ms && ms.status === "IN_PLAY" ? formatKnockoutLivePrefix(ms) : null;
  const liveStatusPill =
    ms?.status === "PAUSED" ? "HT" : livePhaseLabel ?? "LIVE";

  return (
    <article
      className={`ig-post${isPlatformPost ? " ig-post--platform" : ""}${isUserGlobalPost ? " ig-post--user-global" : ""}${hasCampaign ? " ig-post--campaign" : ""}${isLiveMatch ? " ig-post--live" : ""}`}
    >
      {isEndingSoon ? (
        <div className="cx-vote-ending-soon-banner" role="status" aria-live="polite">
          <span className="cx-vote-ending-soon-icon" aria-hidden>
            ⏳
          </span>
          <span>
            Poll ending soon, vote now! <strong>{countdownLabel || "Time is running out"}</strong>
          </span>
        </div>
      ) : null}
      {post.pinned ? (
        <div className="cx-pinned-ribbon" aria-label="Pinned post">
          <span aria-hidden="true">📌</span> Pinned
        </div>
      ) : null}
      <header className="ig-post-header">
        {isPlatformPost ? (
          <div className="ig-post-user cx-platform-post-user">
            <span className="ig-avatar sm cx-platform-post-avatar">
              <img src={PLATFORM_BRAND_LOGO_URL} alt="" decoding="async" />
            </span>
            <div>
              <span className="ig-post-username-row">
                <span className="ig-post-username">{MODERATOR_PLATFORM_NAME}</span>
                <span className="cx-platform-post-badge">Platform</span>
                {categoryChip}{matchScoreChip}
              </span>
              <span className="ig-post-meta">{formatRelativeTime(postTimeIso)}</span>
            </div>
          </div>
        ) : post.authorId ? (
          <NavLink
            to={isOwner ? "/profile" : `/profile/${post.authorId}`}
            className="ig-post-user ig-post-user--link"
          >
            <span className="ig-avatar sm">
              {postAuthorAvatar ? (
                <img
                  src={postAuthorAvatar}
                  alt={`${post.authorUsername} avatar`}
                  decoding="async"
                  onError={() => {
                    setAuthorAvatarAttempt((prev) => {
                      if (prev + 1 < postAuthorAvatarCandidates.length) {
                        return prev + 1;
                      }
                      return postAuthorAvatarCandidates.length;
                    });
                  }}
                />
              ) : (
                storyInitial(post.authorDisplayName?.trim() || post.authorUsername)
              )}
            </span>
            <div>
              <span className="ig-post-username-row">
                <span className="ig-post-username">
                  {post.authorDisplayName?.trim() || `@${post.authorUsername}`}
                </span>
                {isUserGlobalPost ? (
                  <span className="cx-user-global-post-badge">Global</span>
                ) : null}
                {categoryChip}{matchScoreChip}
              </span>
              <span className="ig-post-meta">{formatRelativeTime(postTimeIso)}</span>
            </div>
          </NavLink>
        ) : (
          <div className="ig-post-user">
            <span className="ig-avatar sm">
              {postAuthorAvatar ? (
                <img
                  src={postAuthorAvatar}
                  alt={`${post.authorUsername} avatar`}
                  decoding="async"
                  onError={() => {
                    setAuthorAvatarAttempt((prev) => {
                      if (prev + 1 < postAuthorAvatarCandidates.length) {
                        return prev + 1;
                      }
                      return postAuthorAvatarCandidates.length;
                    });
                  }}
                />
              ) : (
                storyInitial(post.authorDisplayName?.trim() || post.authorUsername)
              )}
            </span>
            <div>
              <span className="ig-post-username-row">
                <span className="ig-post-username">
                  {post.authorDisplayName?.trim() || `@${post.authorUsername}`}
                </span>
                {categoryChip}{matchScoreChip}
              </span>
              <span className="ig-post-meta">{formatRelativeTime(postTimeIso)}</span>
            </div>
          </div>
        )}
        <div className="ig-more-wrap" ref={moreRef}>
          <button
            type="button"
            className="ig-more-btn"
            aria-label="More"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <IconMore />
          </button>
          {moreOpen && (
            <div className="ig-more-menu" role="menu">
              {isAdmin && (
                <button
                  type="button"
                  className="ig-more-item"
                  role="menuitem"
                  disabled={pinBusy}
                  onClick={() => void handleTogglePin()}
                >
                  {post.pinned
                    ? pinBusy
                      ? "Unpinning…"
                      : "📌 Unpin post"
                    : pinBusy
                      ? "Pinning…"
                      : "📌 Pin to top"}
                </button>
              )}
              {(isAdmin || isOwner) && (
                <button
                  type="button"
                  className="ig-more-item"
                  role="menuitem"
                  onClick={() => { setMoreOpen(false); setEditModalOpen(true); }}
                >
                  Edit post
                </button>
              )}
              {canDelete && !deleteConfirm && (
                <button
                  type="button"
                  className="ig-more-item ig-more-item--danger"
                  role="menuitem"
                  onClick={() => { setMoreOpen(false); setDeleteConfirm(true); }}
                >
                  Delete post
                </button>
              )}
              {!canDelete && (
                <button
                  type="button"
                  className="ig-more-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    if (!isAuthenticated) {
                      navigate("/login", { state: { from: location.pathname } });
                      return;
                    }
                    setReportOpen(true);
                  }}
                >
                  Report
                </button>
              )}
            </div>
          )}
          {deleteConfirm && (
            <div className="ig-delete-confirm">
              <p>Delete this post? This cannot be undone.</p>
              <div className="ig-delete-confirm-actions">
                <button
                  type="button"
                  className="btn-danger"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {post.campaign ? <PostCampaignBadge campaign={post.campaign} /> : null}

      {isMatchPost && showLiveEtBanner ? (
        <div className="cx-knockout-strip">
          {matchWinnerPendingHint ? (
            <p className="cx-knockout-vote-hint">{matchWinnerPendingHint}</p>
          ) : null}
        </div>
      ) : null}

      {isAnnouncement && (
        <div className="cx-announcement-header">
          <span className="cx-announcement-icon" aria-hidden>📢</span>
          <span>ANNOUNCEMENT</span>
        </div>
      )}

      {/* Caption — always visible above the compare images */}
      {post.caption && (
        <div className={`cx-post-caption-bar${isAnnouncement ? " cx-post-caption-bar--announcement" : ""}`}>
          {linkifyText(post.caption)}
        </div>
      )}

      {isAnnouncement ? (
        post.imageUrls.length > 0 ? <AnnouncementImageGrid urls={post.imageUrls} /> : null
      ) : isPoll ? (
        <>
          {post.imageUrls.length > 0 ? (
            <div className="ig-post-media-wrap cx-poll-body-media">
              {post.imageUrls.map((url, i) => (
                <img
                  key={`${post.id}-pbody-${i}`}
                  src={url}
                  alt=""
                  className="cx-poll-body-image"
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
          ) : null}
          <div
            className={`cx-poll-options${
              isVotingClosed ? " cx-poll-options--closed" : ""
            }`}
          >
            {Array.from({ length: pollOptionCount }, (_, i) => {
              const opt = pollOptions[i];
              const label = compareOptionLabel(post, i);
              const thumb = opt?.imageUrl?.trim() || null;
              const pct = pollPercents[i] ?? 0;
              const voteCount = Math.round(
                activeOptionStats?.find((x) => x.index === i)?.count ?? 0,
              );
              const picked = pollPick === i;
              const isWinner = isPollWinnerIndex(i);
              const thumbStyle =
                thumb &&
                (opt?.imageFocalX != null || opt?.imageFocalY != null)
                  ? {
                      objectPosition: imageObjectPosition(
                        opt?.imageFocalX,
                        opt?.imageFocalY,
                      ),
                    }
                  : undefined;
              return (
                <div
                  key={`${post.id}-poll-${i}`}
                  className={`cx-poll-option-wrap${
                    pollShowResults ? " cx-poll-option-wrap--result" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`cx-poll-option cx-poll-option--c${i % 10}${
                      picked ? " cx-poll-option--picked" : ""
                    }${pollShowResults ? " cx-poll-option--result" : ""}${
                      isVotingClosed && isWinner ? " cx-poll-option--winner" : ""
                    }${
                      isVotingClosed && !isWinner ? " cx-poll-option--loser" : ""
                    }${
                      justVotedIndex === i && !isVotingClosed
                        ? " cx-poll-option--just-voted"
                        : ""
                    }`}
                    disabled={voteControlsDisabled}
                    aria-pressed={picked}
                    aria-label={
                      isVotingClosed
                        ? `${label} — ${isWinner ? "winner" : "result"}: ${pct}%`
                        : picked
                          ? `Your choice: ${label} — tap to change`
                          : `Vote for ${label}`
                    }
                    onClick={(e) => handlePollTap(i, e.currentTarget)}
                  >
                    {pollShowResults ? (
                      <span
                        className="cx-poll-option-fill"
                        style={{ width: `${clampPercent(pct)}%` }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="cx-poll-option-content">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="cx-poll-option-thumb"
                          loading="lazy"
                          decoding="async"
                          style={thumbStyle}
                        />
                      ) : (
                        <span
                          className={`cx-poll-option-radio${
                            picked ? " cx-poll-option-radio--on" : ""
                          }`}
                          aria-hidden
                        />
                      )}
                      <span className="cx-poll-option-label">
                        {isVotingClosed && isWinner ? (
                          <span className="cx-poll-option-medal" aria-hidden>
                            🥇{" "}
                          </span>
                        ) : null}
                        {label}
                      </span>
                      {pollShowResults ? (
                        <span className="cx-poll-option-pct">{pct}%</span>
                      ) : picked ? (
                        <span className="cx-poll-option-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {pollShowResults ? (
                    <button
                      type="button"
                      className="cx-poll-see-voters"
                      onClick={() => void openVotersList(i)}
                      aria-label={`See ${voteCount} ${
                        voteCount === 1 ? "voter" : "voters"
                      } for ${label}`}
                    >
                      <IconUsers size={15} />
                      <span className="cx-poll-see-voters-count">
                        {voteCount}
                      </span>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {voteMode === "api" && !isVotingClosed ? (
            <div className="cx-anon-toggle-row">
              <label className="cx-anon-toggle">
                <span className="cx-anon-toggle-icon" aria-hidden>
                  👻
                </span>
                <span className="cx-anon-toggle-text">Vote anonymously</span>
                <input
                  type="checkbox"
                  checked={anonymousVote}
                  onChange={(e) => handleAnonymousToggle(e.target.checked)}
                />
                <span className="cx-anon-toggle-switch" aria-hidden />
              </label>
            </div>
          ) : null}
        </>
      ) : compareUrls ? (
        <>
          <div
            className={`ig-post-media-wrap ig-post-media-wrap--compare${
              isMultiCompare ? " ig-post-media-wrap--compare-rows" : ""
            }${isVotingClosed ? " ig-post-media-wrap--voting-closed" : ""}`}
          >
            {isVotingClosed && (
              <div className="cx-voting-ended-strip" aria-label="Voting has ended">
                <span className="cx-voting-ended-strip-trophy">🏆</span>
                <span className="cx-voting-ended-strip-text">
                  <span className="cx-voting-ended-strip-label">FINAL</span>
                  <span className="cx-voting-ended-strip-sep">·</span>
                  <span>Results are in</span>
                </span>
                <span className="cx-voting-ended-strip-lock">🔒</span>
              </div>
            )}
            {isBinaryCompare &&
              compareUrls.map((url, i) => {
                const side = i as 0 | 1;
                const pct = side === 0 ? leftPct : rightPct;
                const picked =
                  (side === 0 && viewer === "UP") ||
                  (side === 1 && viewer === "DOWN");
                const colTitle = compareOptionLabel(post, side);
                const isWinner = isBinaryWinnerSide(side);
                return (
                  <button
                    key={`${post.id}-cmp-${i}`}
                    type="button"
                    className={`ig-compare-cell ig-compare-cell--binary-${side === 0 ? "a" : "b"}${picked ? " ig-compare-cell--picked" : ""}${hasVoted && !picked && !isVotingClosed ? " ig-compare-cell--unchosen" : ""}${isVotingClosed ? " ig-compare-cell--closed" : ""}${isWinner ? " ig-compare-cell--winner" : ""}${!isVotingClosed && !hasVoted ? " ig-compare-cell--unvoted" : ""}${justVotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-voted" : ""}${justUnvotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-unvoted" : ""}`}
                    disabled={voteControlsDisabled}
                    aria-pressed={picked}
                    aria-label={
                      isVotingClosed
                        ? `${colTitle} — ${isWinner ? "winner" : "result"}: ${pct !== null ? `${pct}%` : ""}`
                        : picked
                          ? `Your choice: ${colTitle} — tap to change`
                          : `Vote for ${colTitle}`
                    }
                    onClick={(e) => handleBinaryCompareTap(side, e.currentTarget)}
                  >
                    <img
                      src={url}
                      alt=""
                      width={1080}
                      height={1080}
                      loading="lazy"
                      decoding="async"
                      style={compareImageStyle(post, side)}
                    />
                    {/* Permanent "your pick" seal — top-right corner pin */}
                    {picked && !isVotingClosed && (
                      <span className="cx-voted-pin" aria-label="Your choice">
                        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden>
                          <path d="M2.5 7.5 5.5 10.5 11.5 4" />
                        </svg>
                        VOTED
                      </span>
                    )}
                    {/* One-shot light flash on vote */}
                    {justVotedIndex === i && !isVotingClosed && (
                      <span className="cx-vote-flash" aria-hidden />
                    )}
                    {isVotingClosed && isWinner && (
                      <span className="cx-winner-crown-badge" aria-hidden>
                        <span className="cx-winner-crown-icon">👑</span>
                        <span>WINNER</span>
                      </span>
                    )}
                    {isVotingClosed && !isWinner && (
                      <span className="cx-loser-scrim" aria-hidden />
                    )}
                    <span
                      className={`ig-compare-pct${
                        !showCompareStats ? " ig-compare-pct--preview" : ""
                      }${isVotingClosed && isWinner ? " ig-compare-pct--winner" : ""}${
                        isVotingClosed && !isWinner ? " ig-compare-pct--loser" : ""
                      }`}
                    >
                      <span className="ig-compare-pct-main">{pct !== null ? `${pct}%` : "—"}</span>
                      <span className="ig-compare-pct-sub">{colTitle}</span>
                      {showCompareStats ? (
                        <span className="ig-compare-meter" aria-hidden>
                          <span
                            className="ig-compare-meter-fill"
                            style={{ width: `${clampPercent(pct)}%` }}
                          />
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            {isMultiCompare &&
              compareRowsWithStart.map(({ size, start }, rowIdx) => (
                <div
                  className="ig-compare-row"
                  key={`${post.id}-crow-${rowIdx}`}
                >
                  {Array.from({ length: size }, (_, col) => {
                    const i = start + col;
                    const url = compareUrls[i];
                    const pct = multiPercents[i] ?? 0;
                    const picked = multiPickDisplayed === i;
                    const colTitle = compareOptionLabel(post, i);
                    const isWinnerCell = isMultiWinnerIndex(i);
                    return (
                      <button
                        key={`${post.id}-cmp-${i}`}
                        type="button"
                        className={`ig-compare-cell ig-compare-cell--multi ig-compare-cell--multi-${i % 10}${picked ? " ig-compare-cell--picked" : ""}${hasVoted && !picked && !isVotingClosed ? " ig-compare-cell--unchosen" : ""}${isVotingClosed ? " ig-compare-cell--closed" : ""}${isWinnerCell ? " ig-compare-cell--winner" : ""}${!isVotingClosed && !hasVoted ? " ig-compare-cell--unvoted" : ""}${justVotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-voted" : ""}${justUnvotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-unvoted" : ""}`}
                        style={{ width: multiCellWidthCss, flex: "0 0 auto" }}
                        disabled={voteControlsDisabled}
                        aria-pressed={picked}
                        aria-label={
                          picked
                            ? `Your choice: ${colTitle} — tap to change`
                            : `Vote for ${colTitle}`
                        }
                        onClick={(e) => void handleMultiCompareTap(i, e.currentTarget)}
                      >
                        <img
                          src={url}
                          alt=""
                          width={1080}
                          height={1080}
                          loading="lazy"
                          decoding="async"
                          style={compareImageStyle(post, i)}
                        />
                        {picked && !isVotingClosed && (
                          <span className="cx-voted-pin" aria-label="Your choice">
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden>
                              <path d="M2.5 7.5 5.5 10.5 11.5 4" />
                            </svg>
                            VOTED
                          </span>
                        )}
                        {justVotedIndex === i && !isVotingClosed && (
                          <span className="cx-vote-flash" aria-hidden />
                        )}
                        {isVotingClosed && isWinnerCell && (
                          <span className="cx-winner-crown-badge" aria-hidden>
                            <span className="cx-winner-crown-icon">👑</span>
                            <span>WINNER</span>
                          </span>
                        )}
                        {isVotingClosed && !isWinnerCell && (
                          <span className="cx-loser-scrim" aria-hidden />
                        )}
                        <span
                          className={`ig-compare-pct${
                            !showCompareStats ? " ig-compare-pct--preview" : ""
                          }${isVotingClosed && isWinnerCell ? " ig-compare-pct--winner" : ""}${
                            isVotingClosed && !isWinnerCell ? " ig-compare-pct--loser" : ""
                          }`}
                        >
                          <span className="ig-compare-pct-main">{`${pct}%`}</span>
                          <span className="ig-compare-pct-sub">{colTitle}</span>
                          {showCompareStats ? (
                            <span className="ig-compare-meter" aria-hidden>
                              <span
                                className="ig-compare-meter-fill"
                                style={{ width: `${clampPercent(pct)}%` }}
                              />
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
          {!isVotingClosed && !hasVoted ? (
            <p className="cx-compare-vote-hint" role="status">
              Tap an option to cast your vote
            </p>
          ) : null}
          {voteMode === "api" && !isVotingClosed && (
            <div className="cx-anon-toggle-row">
              <label className="cx-anon-toggle">
                <span className="cx-anon-toggle-icon" aria-hidden>👻</span>
                <span className="cx-anon-toggle-text">Vote anonymously</span>
                <input
                  type="checkbox"
                  checked={anonymousVote}
                  onChange={(e) => handleAnonymousToggle(e.target.checked)}
                />
                <span className="cx-anon-toggle-switch" aria-hidden />
              </label>
            </div>
          )}
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
            decoding="async"
          />
        </div>
      ) : (
        <div className="ig-post-media-wrap ig-post-media-placeholder-wrap">
          <p className="ig-post-media-placeholder">No image URL</p>
        </div>
      )}

      {showVoteWinner && post.voteWinner ? (
        <PostVoteWinnerBanner
          winner={post.voteWinner}
          optionLabel={winnerOptionLabel}
        />
      ) : null}

      {showCampaignWinner && post.campaignWinner ? (
        <PostCampaignWinnerBanner
          winner={post.campaignWinner}
          campaign={post.campaign}
          winningOptionLabel={campaignWinnerOptionLabel}
        />
      ) : showMatchLive ? (
        <div
          className={`cx-live-panel${ms?.status === "PAUSED" ? " cx-live-panel--ht" : ""}`}
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); navigate(`/world-cup/match/${post.fixtureId}`); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigate(`/world-cup/match/${post.fixtureId}`); } }}
          aria-label="Open match center"
        >
          <div className="cx-live-panel-head">
            <span className="cx-live-panel-status">
              <span className="cx-live-panel-dot" aria-hidden />
              {liveStatusPill}
              {ms?.status === "IN_PLAY" && liveMinute != null ? ` · ${liveMinute}'` : ""}
            </span>
          </div>
          <div className="cx-live-panel-body">
            <div className="cx-live-panel-team">
              <span className="cx-live-panel-name">{msTeamA ?? "Home"}</span>
            </div>
            <div className="cx-live-panel-score" aria-label={`Score ${ms?.home ?? 0} to ${ms?.away ?? 0}`}>
              {ms?.home ?? 0}
              <span className="cx-live-panel-score-sep" aria-hidden>–</span>
              {ms?.away ?? 0}
            </div>
            <div className="cx-live-panel-team cx-live-panel-team--away">
              <span className="cx-live-panel-name">{msTeamB ?? "Away"}</span>
            </div>
          </div>
          <div className="cx-live-panel-foot">
            <span className="cx-live-panel-foot-title">Match center</span>
            <span className="cx-live-panel-foot-sub">Stats · lineups · events</span>
            <span className="cx-live-panel-chevron" aria-hidden>›</span>
          </div>
        </div>
      ) : showMatchStartsSoon ? (
        <div className="cx-match-in-progress" role="status" aria-live="polite">
          <span className="cx-match-in-progress-icon" aria-hidden>⏰</span>
          <span>Match starts soon · voting is closed</span>
        </div>
      ) : showMatchCalculating ? (
        <div className="cx-match-in-progress" role="status" aria-live="polite">
          <span className="cx-match-in-progress-icon" aria-hidden>⏳</span>
          <span>
            {winnerCountdownLabel
              ? `🏆 Winner reveals in ${winnerCountdownLabel}`
              : (matchWinnerPendingHint ?? "🏆 Revealing winner…")}
          </span>
        </div>
      ) : null}

      {isMatchPost && post.fixtureId && !isLiveMatch && (isMatchFinished || post.lineupAvailable) && (
        <button
          type="button"
          className="cx-mdb-row"
          onClick={(e) => {
            e.stopPropagation();
            const tab = post.lineupAvailable && !isMatchFinished ? '?tab=lineup' : '';
            navigate(`/world-cup/match/${post.fixtureId}${tab}`);
          }}
        >
          <span className="cx-mdb-row-icon" aria-hidden>⚽</span>
          <span className="cx-mdb-row-label">Full match report & lineups</span>
          <span className="cx-mdb-row-arrow" aria-hidden>›</span>
        </button>
      )}

      {isMatchPost ? (
        <MatchPrediction
          postId={post.id}
          fixtureId={post.fixtureId ?? null}
          homeTeam={matchTeamLabel(post, 0)}
          awayTeam={matchTeamLabel(post, 1)}
          enabled={voteMode === "api"}
        />
      ) : null}

      <div className="cx-post-footer">
        {detailsOpen ? (
          <div className="cx-post-details-panel" id={`post-details-${post.id}`}>
            {compareUrls ? (
              isVotingClosed ? (
                <p className="cx-vote-hint-chip">
                  {votingWinnerSummary ? `Final: ${votingWinnerSummary}` : "Voting closed for this post."}
                </p>
              ) : null
            ) : isPoll ? (
              isVotingClosed ? (
                <p className="cx-vote-hint-chip">
                  {votingWinnerSummary ? `Final: ${votingWinnerSummary}` : "Voting closed for this poll."}
                </p>
              ) : null
            ) : null}

            {votingHasEndDate ? (
              <div className="cx-voting-state-row">
                <time className="cx-voting-time" dateTime={post.votingEndsAt ?? undefined}>
                  {isVotingClosed
                    ? `Ended ${votingEndsAtText || formatRelativeTime(post.votingEndsAt) || ""}`
                    : `Ends at ${votingEndsAtText || formatRelativeTime(post.votingEndsAt) || ""}`}
                </time>
              </div>
            ) : null}

            {isBinaryCompare ? (
              <div
                className={`cx-split-panel${voteFx ? " cx-split-panel--votefx" : ""}${isVotingClosed ? " cx-split-panel--final" : ""}`}
                aria-live="polite"
              >
                <div className="cx-split-panel-head">
                  <div className="cx-split-panel-title-wrap">
                    {isVotingClosed ? (
                      <span className="cx-split-final-badge">Final</span>
                    ) : (
                      <span className="cx-split-live-badge" aria-hidden>
                        <span className="cx-split-live-dot" />
                        Live
                      </span>
                    )}
                    <span className="cx-split-panel-title">
                      {isVotingClosed ? "Results" : "Vote breakdown"}
                    </span>
                  </div>
                  <span className="cx-split-panel-metric">
                    {binaryTotal > 0
                      ? `${binaryTotal.toLocaleString()} votes`
                      : "No votes yet"}
                  </span>
                </div>
                {binaryTotal > 0 ? (
                  <div className="cx-split-duel" aria-hidden>
                    <div
                      className="cx-split-duel-seg cx-split-duel-seg--a"
                      style={{ flex: leftPct ?? 50 }}
                    />
                    <div
                      className="cx-split-duel-seg cx-split-duel-seg--b"
                      style={{ flex: rightPct ?? 50 }}
                    />
                  </div>
                ) : null}
                <div className="cx-split-rows">
                  {([0, 1] as const).map((side) => {
                    const count = side === 0 ? up : down;
                    const pct = side === 0 ? leftPct : rightPct;
                    const label = compareOptionLabel(post, side);
                    const isLeader =
                      !binaryHasTie &&
                      binaryLeaderPct != null &&
                      pct != null &&
                      pct === binaryLeaderPct &&
                      pct > 0;
                    const isFinalWinner = isBinaryWinnerSide(side);
                    return (
                      <div
                        key={side}
                        className={`cx-split-row cx-split-row--${side === 0 ? "a" : "b"} cx-split-row--c${side % 10}${isLeader ? " cx-split-row--leader" : ""}${isFinalWinner ? " cx-split-row--winner" : ""}${isVotingClosed && !isFinalWinner ? " cx-split-row--loser" : ""}`}
                      >
                        <div
                          className="cx-split-row-fill"
                          style={{ width: pct != null ? `${pct}%` : "0%" }}
                          aria-hidden
                        />
                        <div className="cx-split-row-inner">
                          <span className="cx-split-swatch" aria-hidden />
                          <span className="cx-split-row-label">
                            {isFinalWinner ? (
                              <span className="cx-split-medal" aria-hidden>
                                🥇{" "}
                              </span>
                            ) : null}
                            {label}
                          </span>
                          <div className="cx-split-row-stats">
                            <span className="cx-split-row-pct">
                              {pct != null ? `${pct}%` : "—"}
                            </span>
                            <span className="cx-split-row-count">
                              {count.toLocaleString()}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="cx-split-voters-btn"
                            onClick={() => void openVotersList(side)}
                          >
                            <span aria-hidden>👥</span>
                            <span className="cx-split-voters-label">Voters</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isMultiCompare ? (
              <div
                className={`cx-split-panel${voteFx ? " cx-split-panel--votefx" : ""}${isVotingClosed ? " cx-split-panel--final" : ""}`}
                aria-live="polite"
              >
                <div className="cx-split-panel-head">
                  <div className="cx-split-panel-title-wrap">
                    {isVotingClosed ? (
                      <span className="cx-split-final-badge">Final</span>
                    ) : (
                      <span className="cx-split-live-badge" aria-hidden>
                        <span className="cx-split-live-dot" />
                        Live
                      </span>
                    )}
                    <span className="cx-split-panel-title">
                      {isVotingClosed ? "Results" : "Vote breakdown"}
                    </span>
                  </div>
                  <span className="cx-split-panel-metric">
                    {multiTotalVotes > 0
                      ? `${multiTotalVotes.toLocaleString()} votes`
                      : "No votes yet"}
                  </span>
                </div>
                <div className="cx-split-rows">
                  {compareUrls?.map((_, idx) => {
                    const pctVal = multiPercents[idx] ?? 0;
                    const count =
                      activeOptionStats?.find((s) => s.index === idx)?.count ??
                      multiCounts[idx] ??
                      0;
                    const label = compareOptionLabel(post, idx);
                    const isLeader =
                      multiLeaderPct != null &&
                      multiLeaderPct > 0 &&
                      multiLeaderCount === 1 &&
                      pctVal === multiLeaderPct;
                    const isFinalWinner = isMultiWinnerIndex(idx);
                    return (
                      <div
                        key={`${post.id}-split-${idx}`}
                        className={`cx-split-row cx-split-row--c${idx % 10}${isLeader ? " cx-split-row--leader" : ""}${isFinalWinner ? " cx-split-row--winner" : ""}${isVotingClosed && !isFinalWinner ? " cx-split-row--loser" : ""}`}
                      >
                        <div
                          className="cx-split-row-fill"
                          style={{ width: `${pctVal}%` }}
                          aria-hidden
                        />
                        <div className="cx-split-row-inner">
                          <span className="cx-split-swatch" aria-hidden />
                          <span className="cx-split-row-label">
                            {isFinalWinner ? (
                              <span className="cx-split-medal" aria-hidden>
                                🥇{" "}
                              </span>
                            ) : null}
                            {label}
                          </span>
                          <div className="cx-split-row-stats">
                            <span className="cx-split-row-pct">{pctVal}%</span>
                            <span className="cx-split-row-count">
                              {count.toLocaleString()}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="cx-split-voters-btn"
                            onClick={() => void openVotersList(idx)}
                          >
                            <span aria-hidden>👥</span>
                            <span className="cx-split-voters-label">Voters</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isAnnouncement && !compareUrls && !isPoll ? (
          <div
            className={`cx-pulse-card cx-pulse-card--compact${voteFx ? " cx-pulse-card--votefx" : ""}`}
            aria-live="polite"
          >
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
                className={`ig-vote-btn${viewer === "UP" ? " ig-vote-btn--active-up" : ""}${justVotedIndex === 0 ? " ig-vote-btn--just-voted" : ""}`}
                disabled={voteControlsDisabled}
                aria-pressed={viewer === "UP"}
                aria-label={viewer === "UP" ? "Remove upvote" : "Upvote"}
                onClick={(e) => void handleVote("UP", e.currentTarget)}
              >
                <IconChevronUp active={viewer === "UP"} />
                <span>{up.toLocaleString()}</span>
              </button>
              <button
                type="button"
                className={`ig-vote-btn${viewer === "DOWN" ? " ig-vote-btn--active-down" : ""}${justVotedIndex === 1 ? " ig-vote-btn--just-voted" : ""}`}
                disabled={voteControlsDisabled}
                aria-pressed={viewer === "DOWN"}
                aria-label={viewer === "DOWN" ? "Remove downvote" : "Downvote"}
                onClick={(e) => void handleVote("DOWN", e.currentTarget)}
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

        <div className="cx-action-rail">
          <div className="cx-action-rail-icons" role="toolbar" aria-label="Post actions">
          <button
            type="button"
            className={`cx-action-chip cx-action-chip--discuss${commentsOpen ? " cx-action-chip--pressed cx-action-chip--discuss-open" : ""}`}
            aria-label={
              commentsOpen
                ? "Hide comments"
                : `Discuss${commentCount > 0 ? `, ${commentCount} comments` : ""}`
            }
            title={commentsOpen ? "Hide comments" : "Discuss"}
            aria-expanded={commentsOpen}
            aria-controls={`post-discuss-${post.id}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleDiscuss();
            }}
          >
            <IconComment />
            <span className="cx-action-chip-label">{commentsOpen ? "Hide" : "Discuss"}</span>
            {!commentsOpen && commentCount > 0 ? (
              <span className="cx-action-chip-count">{commentCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            className="cx-action-chip"
            aria-label="Share link to this post"
            title="Copy or share post link"
            onClick={() => void handleSharePostLink()}
          >
            <IconShare />
          </button>
          {showPermalinkToolbar ? (
            <NavLink
              to={`/post/${post.id}`}
              className="cx-action-chip"
              aria-label="View full post"
              title="Open post on its own page"
            >
              <IconOpenPost />
            </NavLink>
          ) : null}
          <button
            type="button"
            className={`cx-action-chip${liked ? " cx-action-chip--heart" : ""}`}
            aria-label={liked ? "Unhype" : "Hype"}
            title={liked ? "Unhype" : "Hype"}
            aria-pressed={liked}
            disabled={hypeUpdating}
            onClick={(e) => void handleToggleHype(e)}
          >
            <IconHeart filled={liked} />
            {hypeCount > 0 ? (
              <span
                className="cx-action-chip-count cx-action-chip-count--tappable"
                role="button"
                tabIndex={0}
                title="See who hyped"
                aria-label="See who hyped this post"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); void openHypers(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); void openHypers(); } }}
              >
                {hypeCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className={`cx-action-chip${saved ? " cx-action-chip--saved" : ""}`}
            aria-label={saved ? "Unsave" : "Save"}
            title={saved ? "Unsave" : "Keep"}
            aria-pressed={saved}
            disabled={keepUpdating}
            onClick={() => void handleToggleKeep()}
          >
            <IconBookmark filled={saved} />
            {saveLiveCount > 0 ? (
              <span className="cx-action-chip-count">{saveLiveCount}</span>
            ) : null}
          </button>
          {!isAnnouncement ? (
            <button
              type="button"
              className="cx-action-chip"
              aria-label="See who voted"
              title="Voters"
              onClick={() => void openVotersList()}
            >
              <IconUsers />
              {totalVoteCount > 0 ? (
                <span className="cx-action-chip-count">{totalVoteCount}</span>
              ) : null}
            </button>
          ) : null}
          </div>
          {!isAnnouncement ? (
            <div className="cx-action-rail-context">
              <span
                className={`cx-action-status-line${isVotingClosed ? " cx-action-status-line--result" : ""}`}
              >
                {isVotingClosed
                  ? `${isMatchPost ? "📊" : "🏆"} ${votingWinnerSummary || "Results are in"}`
                  : `${votingHasEndDate ? "⏳ " : ""}${votingStatusLabel}`}
              </span>
              {!isPoll ? (
                <button
                  type="button"
                  className="cx-action-rail-details"
                  aria-expanded={detailsOpen}
                  aria-controls={`post-details-${post.id}`}
                  onClick={() => setDetailsOpen((prev) => !prev)}
                >
                  {detailsOpen ? "Hide details" : "See details"}
                  <span className="cx-action-rail-details-arrow" aria-hidden>
                    {detailsOpen ? "‹" : "›"}
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {commentsOpen ? (
          <div id={`post-discuss-${post.id}`} className="cx-discuss-slot">
            <PostCommentsPanel
              postId={post.id}
              voteMode={voteMode}
              isAuthenticated={isAuthenticated}
              meLabel={meLabel}
              highlightCommentId={highlightCommentId}
              onClose={closeDiscuss}
            />
          </div>
        ) : null}

        {shareHint ? (
          <p className="ig-share-hint" role="status">
            {shareHint}
          </p>
        ) : null}

        {timeLabel ? <p className="cx-post-meta-time">{timeLabel}</p> : null}
      </div>
      {showVoters ? (
        <div
          className="ig-modal-overlay cx-voters-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Voter list"
        >
          <section ref={votersModalCardRef} className="ig-modal-card cx-voters-card">
            <div className="ig-post-comments-head cx-voters-head">
              <div className="cx-voters-head-titles">
                <h3 className="ig-post-comments-title">Voted by</h3>
                {!votersInitialLoading && !votersError ? (
                  <span className="cx-voters-total">
                    {loadedVotersCount}
                    {votersHasMore ? "+" : ""}{" "}
                    {loadedVotersCount === 1 && !votersHasMore ? "voter" : "voters"}
                  </span>
                ) : null}
              </div>
              <button type="button" className="cx-modal-close" onClick={closeVotersList}>
                Close
              </button>
            </div>
            {voteMode === "api" ? (
              <div className="cx-voters-search">
                <svg className="cx-voters-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15" aria-hidden>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  className="cx-voters-search-input"
                  placeholder="Search voters by name…"
                  value={voterSearch}
                  onChange={(e) => setVoterSearch(e.target.value)}
                  aria-label="Search voters"
                />
                {voterSearch ? (
                  <button
                    type="button"
                    className="cx-voters-search-clear"
                    aria-label="Clear search"
                    onClick={() => setVoterSearch("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ) : null}
            {voteMode === "api" && voterFilterTabs.length > 1 ? (
              <div className="cx-voters-tabs" role="tablist" aria-label="Filter voters by option">
                {voterFilterTabs.map((tab) => {
                  const active = voterOptionIndex === tab.value;
                  return (
                    <button
                      key={tab.value ?? "all"}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`cx-voters-tab${active ? " cx-voters-tab--active" : ""}`}
                      onClick={() => setVoterOptionIndex(tab.value)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {votersInitialLoading ? (
              <div className="cx-voters-loading">
                <span className="cx-voters-spinner" aria-hidden />
                <span className="muted small">Loading voters…</span>
              </div>
            ) : null}
            {votersError ? (
              <p className="ig-post-comments-error" role="alert">
                {votersError}
              </p>
            ) : null}
            {!votersInitialLoading && !votersError && loadedVotersCount === 0 ? (
              <p className="cx-voters-empty muted small">
                {voterSearch.trim()
                  ? `No voters match “${voterSearch.trim()}”.`
                  : "No votes yet — be the first."}
              </p>
            ) : null}
            {!votersInitialLoading && loadedVotersCount > 0 ? (
              <div
                className="cx-voters-scroll"
                onScroll={handleVotersScroll}
              >
                <ul className="cx-voter-list">
                  {voters.map((v) => {
                    const src = voterAvatarSrc(v);
                    const name = voterDisplayName(v);
                    const isAnon = v.anonymous || !v.user;
                    const RowInner = (
                      <>
                        <span className={`cx-voter-avatar${isAnon ? " cx-voter-avatar--anon" : ""}`}>
                          {src ? (
                            <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" />
                          ) : (
                            <span className="cx-voter-avatar-initial">{voterInitial(v)}</span>
                          )}
                        </span>
                        <span className="cx-voter-meta">
                          <span className="cx-voter-name">{name}</span>
                          <span className="cx-voter-sub">
                            {showVoterOptionTag ? (
                              <span className={`cx-voter-tag cx-voter-tag--c${v.selectedOptionIndex % 4}`}>
                                {compareOptionLabel(post, v.selectedOptionIndex)}
                              </span>
                            ) : null}
                            <time className="cx-voter-time" dateTime={v.createdAt}>
                              {formatRelativeTime(v.createdAt) || "just now"}
                            </time>
                          </span>
                        </span>
                      </>
                    );
                    return (
                      <li key={v.voteId} className="cx-voter-row">
                        {isAnon ? (
                          <span className="cx-voter-rowlink cx-voter-rowlink--anon">{RowInner}</span>
                        ) : (
                          <NavLink to={`/profile/${v.user!.id}`} className="cx-voter-rowlink">
                            {RowInner}
                          </NavLink>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {votersLoadingMore ? (
                  <div className="cx-voters-more">
                    <span className="cx-voters-spinner cx-voters-spinner--sm" aria-hidden />
                  </div>
                ) : null}
                {!votersHasMore && loadedVotersCount > VOTERS_PAGE_SIZE ? (
                  <p className="cx-voters-end">That’s everyone</p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {showHypers ? (
        <div
          className="ig-modal-overlay cx-voters-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Hyped by list"
          onClick={() => setShowHypers(false)}
        >
          <section className="ig-modal-card cx-voters-card">
            <div className="ig-post-comments-head cx-voters-head">
              <div className="cx-voters-head-titles">
                <h3 className="ig-post-comments-title">Hyped by</h3>
                {!hypersLoading && !hypersError ? (
                  <span className="cx-voters-total">
                    {hypers.length} {hypers.length === 1 ? "person" : "people"}
                  </span>
                ) : null}
              </div>
              <button type="button" className="cx-modal-close" onClick={() => setShowHypers(false)}>
                Close
              </button>
            </div>
            {hypersLoading ? (
              <div className="cx-voters-loading">
                <span className="cx-voters-spinner" aria-hidden />
                <span className="muted small">Loading…</span>
              </div>
            ) : null}
            {hypersError ? (
              <p className="ig-post-comments-error" role="alert">{hypersError}</p>
            ) : null}
            {!hypersLoading && !hypersError && hypers.length === 0 ? (
              <p className="cx-voters-empty muted small">No hypes yet.</p>
            ) : null}
            {!hypersLoading && hypers.length > 0 ? (
              <div className="cx-voters-scroll">
                <ul className="cx-voter-list">
                  {hypers.map((h) => {
                    const src = normalizeProfileImageUrl(h.profileImageUrl);
                    const name = hyperDisplayName(h);
                    return (
                      <li key={h.id} className="cx-voter-row">
                        <NavLink
                          to={`/profile/${h.id}`}
                          className="cx-voter-rowlink"
                          onClick={() => setShowHypers(false)}
                        >
                          <span className="cx-voter-avatar">
                            {src ? (
                              <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" />
                            ) : (
                              <span className="cx-voter-avatar-initial">
                                {name.replace(/^@/, "").slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span className="cx-voter-meta">
                            <span className="cx-voter-name">{name}</span>
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <ContentReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="post"
        targetId={post.id}
        reporterLabel={
          authUser?.displayName?.trim() ||
          authUser?.username ||
          authUser?.email ||
          "Signed-in user"
        }
        contextUrl={postPermalink(post.id)}
      />

      {editModalOpen && (
        <EditPostModal
          post={{
            id: post.id,
            format: post.format,
            caption: post.caption,
            imageUrls: post.imageUrls ?? [],
            options: post.postOptions,
            category: post.category ? { id: post.category.id, name: post.category.name } : undefined,
            campaign: post.campaign ? { id: post.campaign.id, name: post.campaign.name, slug: post.campaign.slug ?? "" } : undefined,
            votingEndsAt: post.votingEndsAt,
            isVotingOpen: post.isVotingOpen,
            upvoteCount: post.upvoteCount,
            downvoteCount: post.downvoteCount,
            optionStats: post.optionStats,
            status: post.status,
            scheduledAt: post.scheduledAt,
          }}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => setEditModalOpen(false)}
        />
      )}
    </article>
  );
}

function areFeedPostCardPropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.voteMode === next.voteMode &&
    prev.showPermalinkToolbar === next.showPermalinkToolbar &&
    prev.post.id === next.post.id &&
    prev.post.upvoteCount === next.post.upvoteCount &&
    prev.post.downvoteCount === next.post.downvoteCount &&
    prev.post.viewerVote === next.post.viewerVote &&
    prev.post.commentCount === next.post.commentCount &&
    prev.post.hypeCount === next.post.hypeCount &&
    prev.post.saveCount === next.post.saveCount &&
    prev.post.viewerHasSaved === next.post.viewerHasSaved &&
    prev.post.viewerHasHyped === next.post.viewerHasHyped &&
    prev.post.mySelectedOptionIndex === next.post.mySelectedOptionIndex &&
    prev.post.isVotingOpen === next.post.isVotingOpen &&
    prev.post.votingEndsAt === next.post.votingEndsAt &&
    prev.post.endingSoonLeadMinutes === next.post.endingSoonLeadMinutes &&
    prev.post.matchScore?.status === next.post.matchScore?.status &&
    prev.post.matchScore?.home === next.post.matchScore?.home &&
    prev.post.matchScore?.away === next.post.matchScore?.away &&
    prev.post.matchScore?.minute === next.post.matchScore?.minute
  );
}

export const FeedPostCard = memo(FeedPostCardComponent, areFeedPostCardPropsEqual);
