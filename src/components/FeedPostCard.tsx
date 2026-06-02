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
  FEED_POSTS,
  GET_POST_BY_ID,
  MY_SAVED_POSTS,
  POST_VOTE_UPDATED,
  REMOVE_VOTE,
  SET_POST_HYPE,
  SET_POST_KEEP,
  VOTERS_BY_POST,
  VOTE_POST,
} from "../graphql/feed";
import { apolloClient } from "../lib/apolloClient";
import { postPermalink } from "../lib/postPermalink";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { playVoteSound } from "../lib/notificationSound";
import type { FeedPostView, VoteDirectionGql } from "../types/feed";
import { MODERATOR_PLATFORM_NAME, PLATFORM_BRAND_LOGO_URL } from "../lib/moderatorBrand";
import { PostCampaignBadge } from "./PostCampaignBadge";
import { PostVoteWinnerBanner } from "./PostVoteWinnerBanner";
import { imageObjectPosition } from "../lib/imageFocal";

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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const isOwner = !!authUser && !!post.authorId && authUser.id === post.authorId;
  const isAdmin = authUser?.role === "admin";
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

  const [fetchVoters] = useLazyQuery<VotersByPostData>(VOTERS_BY_POST, {
    fetchPolicy: "network-only",
  });
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
    post.votingEndsAt && (post.isVotingOpen ?? true),
  );
  useEffect(() => {
    if (!hasActiveCountdown) {
      return;
    }
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasActiveCountdown]);

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
        setShowVoters(false);
      }
    }
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && votersModalCardRef.current?.contains(target)) {
        return;
      }
      setShowVoters(false);
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

  async function handleToggleHype() {
    const nextActive = !liked;
    const delta = nextActive ? 1 : -1;
    setLiked(nextActive);
    setHypeCountLive((prev) => Math.max(0, prev + delta));

    if (voteMode !== "api") {
      return;
    }

    try {
      await setPostHypeMut({
        variables: { postId: post.id, active: nextActive },
      });
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

  async function handleVote(clicked: "UP" | "DOWN") {
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

    await processVoteIntent(selectedOptionIndex);
  }

  function handleBinaryCompareTap(side: 0 | 1) {
    void handleVote(side === 0 ? "UP" : "DOWN");
  }

  async function handleMultiCompareTap(index: number) {
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
      if (activeMySelectedOptionIndex === index) {
        // Re-tapped the option they already chose → withdraw the vote.
        void withdrawVote(index);
        return;
      }

      // Compute instant optimistic counts — increment new pick, decrement old.
      const curPickMulti  = activeMySelectedOptionIndex;
      const curStatsMulti = optimisticVote?.optionStats ?? activeOptionStats ?? null;
      const newStatsMulti = (() => {
        if (!curStatsMulti) return null;
        const updated = curStatsMulti.map((s) => {
          let c = s.count;
          if (s.index === index) c += 1;
          if (curPickMulti !== null && s.index === curPickMulti) c = Math.max(0, c - 1);
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
      if (curPickMulti !== null && curPickMulti !== index) {
        setJustUnvoted(curPickMulti); // exit animation on the cell being left
      }
      setOptimisticVote({
        upvoteCount:           optimisticVote?.upvoteCount  ?? post.upvoteCount,
        downvoteCount:         optimisticVote?.downvoteCount ?? post.downvoteCount,
        viewerVote:            optimisticVote?.viewerVote   ?? post.viewerVote,
        mySelectedOptionIndex: index,
        optionStats:           newStatsMulti,
        isVotingOpen:          optimisticVote?.isVotingOpen  ?? activeIsVotingOpen,
        votingEndsAt:          optimisticVote?.votingEndsAt  ?? activeVotingEndsAt,
      });
      setJustVoted(index);
      setDetailsOpen(true);

      await processVoteIntent(index);
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
  /** Total votes cast on this post (binary or multi) — shown on the Voters chip. */
  const totalVoteCount = isMultiCompare ? multiTotalVotes : binaryTotal;
  const hypeCount = hypeCountLive;
  const commentCount = post.commentCount ?? 0;
  // Flat, chronologically-sorted list (newest first, as returned by the server).
  // A flat list keeps infinite-scroll stable — appending a page never reflows
  // rows above the viewport the way regrouping would.
  const showVoterOptionTag = voterOptionIndex === undefined;
  const loadedVotersCount = voters.length;
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
      return `${winnerLabel} won · ${topPct}% (${winnerVotes.toLocaleString()} votes)`;
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
    return `${winnerLabel} won · ${winnerPct}% (${winnerVotes.toLocaleString()} votes)`;
  }, [
    isVotingClosed,
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

  // Winner indices used to visually highlight the winning option when voting is closed
  const binaryWinnerSide: 0 | 1 | null =
    isVotingClosed && isBinaryCompare && binaryTotal > 0
      ? up > down
        ? 0
        : down > up
          ? 1
          : null
      : null;
  const multiWinnerIndex: number | null = (() => {
    if (!isVotingClosed || !isMultiCompare || multiTotalVotes <= 0 || multiPercents.length === 0) {
      return null;
    }
    const topPct = Math.max(...multiPercents);
    const leaders = multiPercents.filter((p) => p === topPct);
    return leaders.length === 1 ? multiPercents.indexOf(topPct) : null;
  })();

  // True once the viewer has cast at least one vote on this post
  const hasVoted = isBinaryCompare
    ? viewer !== null
    : isMultiCompare
      ? multiPickDisplayed !== null
      : viewer !== null; // classic UP/DOWN bar

  const showClassicVoteBar = !compareUrls;
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
  const hasCampaign = Boolean(post.campaign);
  const showVoteWinner =
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

  return (
    <article
      className={`ig-post${isPlatformPost ? " ig-post--platform" : ""}${hasCampaign ? " ig-post--campaign" : ""}`}
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
              <span className="ig-post-username">
                {post.authorDisplayName?.trim() || `@${post.authorUsername}`}
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
              <span className="ig-post-username">
                {post.authorDisplayName?.trim() || `@${post.authorUsername}`}
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
                <button type="button" className="ig-more-item" role="menuitem" onClick={() => setMoreOpen(false)}>
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

      {/* Caption — always visible above the compare images */}
      {post.caption && (
        <div className="cx-post-caption-bar">
          {post.caption}
        </div>
      )}

      {compareUrls ? (
        <>
          <div
            className={`ig-post-media-wrap ig-post-media-wrap--compare${
              compareUrls.length === 3
                ? " ig-post-media-wrap--compare-grid ig-post-media-wrap--compare-grid--3"
                : compareUrls.length === 4
                  ? " ig-post-media-wrap--compare-grid ig-post-media-wrap--compare-grid--4"
                  : compareUrls.length >= 5
                    ? " ig-post-media-wrap--compare-grid ig-post-media-wrap--compare-grid--many"
                    : ""
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
            {/* Floating vote-status chip — binary compare only */}
            {!isVotingClosed && isBinaryCompare && (
              <span
                className={`cx-vote-status-chip cx-vote-status-chip--overlay${
                  hasVoted
                    ? " cx-vote-status-chip--voted" +
                      (viewer === "DOWN"
                        ? " cx-vote-status-chip--side-b cx-vote-status-chip--pos-right"
                        : " cx-vote-status-chip--pos-left")
                    : " cx-vote-status-chip--pending"
                }`}
                aria-label={hasVoted ? "You have voted on this post" : "You haven't voted yet"}
              >
                {hasVoted ? (
                  <>
                    <svg viewBox="0 0 14 14" fill="currentColor" width="10" height="10" aria-hidden style={{opacity: 0.9}}>
                      <path d="M7 12.5C7 12.5 1 8.5 1 4.5A3 3 0 0 1 7 3.1 3 3 0 0 1 13 4.5C13 8.5 7 12.5 7 12.5Z"/>
                    </svg>
                    Voted
                  </>
                ) : (
                  "Cast Vote"
                )}
              </span>
            )}
            {compareUrls.map((url, i) => {
              if (isBinaryCompare) {
                const side = i as 0 | 1;
                const pct = side === 0 ? leftPct : rightPct;
                const picked =
                  (side === 0 && viewer === "UP") ||
                  (side === 1 && viewer === "DOWN");
                const colTitle = compareOptionLabel(post, side);
                const isWinner = binaryWinnerSide === side;
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
                    onClick={() => handleBinaryCompareTap(side)}
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
                        <svg viewBox="0 0 14 14" fill="currentColor" width="12" height="12" aria-hidden>
                          <path d="M7 12.5C7 12.5 1 8.5 1 4.5A3 3 0 0 1 7 3.1 3 3 0 0 1 13 4.5C13 8.5 7 12.5 7 12.5Z"/>
                        </svg>
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
                    <span className={`ig-compare-pct${isVotingClosed && isWinner ? " ig-compare-pct--winner" : ""}${isVotingClosed && !isWinner ? " ig-compare-pct--loser" : ""}`}>
                      <span className="ig-compare-pct-main">{pct !== null ? `${pct}%` : "—"}</span>
                      <span className="ig-compare-pct-sub">{colTitle}</span>
                      <span className="ig-compare-meter" aria-hidden>
                        <span
                          className="ig-compare-meter-fill"
                          style={{ width: `${clampPercent(pct)}%` }}
                        />
                      </span>
                    </span>
                  </button>
                );
              }

              const pct = multiPercents[i] ?? 0;
              const picked = multiPickDisplayed === i;
              const colTitle = compareOptionLabel(post, i);
              const isWinnerCell = multiWinnerIndex === i;
              return (
                <button
                  key={`${post.id}-cmp-${i}`}
                  type="button"
                  className={`ig-compare-cell ig-compare-cell--multi ig-compare-cell--multi-${i % 10}${picked ? " ig-compare-cell--picked" : ""}${hasVoted && !picked && !isVotingClosed ? " ig-compare-cell--unchosen" : ""}${isVotingClosed ? " ig-compare-cell--closed" : ""}${isWinnerCell ? " ig-compare-cell--winner" : ""}${!isVotingClosed && !hasVoted ? " ig-compare-cell--unvoted" : ""}${justVotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-voted" : ""}${justUnvotedIndex === i && !isVotingClosed ? " ig-compare-cell--just-unvoted" : ""}`}
                  disabled={voteControlsDisabled}
                  aria-pressed={picked}
                  aria-label={
                    picked
                      ? `Your choice: ${colTitle} — tap to change`
                      : `Vote for ${colTitle}`
                  }
                  onClick={() => void handleMultiCompareTap(i)}
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
                      <svg viewBox="0 0 14 14" fill="currentColor" width="12" height="12" aria-hidden>
                        <path d="M7 12.5C7 12.5 1 8.5 1 4.5A3 3 0 0 1 7 3.1 3 3 0 0 1 13 4.5C13 8.5 7 12.5 7 12.5Z"/>
                      </svg>
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
                  <span className={`ig-compare-pct${isVotingClosed && isWinnerCell ? " ig-compare-pct--winner" : ""}${isVotingClosed && !isWinnerCell ? " ig-compare-pct--loser" : ""}`}>
                    <span className="ig-compare-pct-main">{`${pct}%`}</span>
                    <span className="ig-compare-pct-sub">{colTitle}</span>
                    <span className="ig-compare-meter" aria-hidden>
                      <span
                        className="ig-compare-meter-fill"
                        style={{ width: `${clampPercent(pct)}%` }}
                      />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {/* Tap-to-vote hint — visible before any vote is cast, hidden once voted or closed */}
          {!isVotingClosed && (
            <div
              className={`cx-tap-to-vote-hint${hasVoted ? " cx-tap-to-vote-hint--voted" : ""}`}
              aria-live="polite"
            >
              {hasVoted ? (
                <>
                  <span className="cx-tap-to-vote-icon">✓</span>
                  <span>Vote recorded — tap to change</span>
                </>
              ) : (
                <>
                  <span className="cx-tap-to-vote-icon">👆</span>
                  <span>Tap an image to cast your vote</span>
                </>
              )}
            </div>
          )}
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

      <div className="cx-post-footer">
        {detailsOpen ? (
          <div className="cx-post-details-panel" id={`post-details-${post.id}`}>
            {compareUrls ? (
              <p className="cx-vote-hint-chip">
                {isVotingClosed
                  ? votingWinnerSummary
                    ? `Final: ${votingWinnerSummary}`
                    : "Voting closed for this post."
                  : voteMode === "api"
                  ? "Tap a side to vote — switch anytime with another tap"
                  : "Tap a side to vote — tap again to clear your pick"}
              </p>
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
                className={`cx-pulse-card${voteFx ? " cx-pulse-card--votefx" : ""}${isVotingClosed ? " cx-pulse-card--final" : ""}`}
                aria-live="polite"
              >
                <div className="cx-pulse-card-head">
                  <span className={`cx-pulse-card-title${isVotingClosed ? " cx-pulse-card-title--final" : ""}`}>
                    {isVotingClosed ? "Final results" : "Live split"}
                  </span>
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
                  const isLeader =
                    !binaryHasTie &&
                    binaryLeaderPct != null &&
                    pct != null &&
                    pct === binaryLeaderPct &&
                    pct > 0;
                  const isFinalWinner = isVotingClosed && binaryWinnerSide === side;
                  return (
                    <div key={side} className={`cx-pulse-row${isLeader ? " cx-pulse-row--leader" : ""}${isFinalWinner ? " cx-pulse-row--final-winner" : ""}${isVotingClosed && !isFinalWinner ? " cx-pulse-row--final-loser" : ""}`}>
                      <div className="cx-pulse-row-top">
                        <span className="cx-pulse-name">
                          {isFinalWinner && <span className="cx-pulse-medal" aria-hidden>🥇 </span>}
                          {label}
                        </span>
                        <div className="cx-pulse-row-actions">
                          <span className="cx-pulse-count">
                            {count.toLocaleString()}
                            {pct != null ? ` · ${pct}%` : ""}
                          </span>
                          <button
                            type="button"
                            className="cx-see-voters-btn"
                            onClick={() => void openVotersList(side)}
                          >
                            See voters
                          </button>
                        </div>
                      </div>
                      <div className="cx-pulse-track" aria-hidden>
                        <div
                          className={`cx-pulse-fill cx-pulse-fill--${side === 0 ? "a" : "b"}${isFinalWinner ? " cx-pulse-fill--winner" : ""}`}
                          style={{ width: pct != null ? `${pct}%` : "0%" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : isMultiCompare ? (
              <div
                className={`cx-pulse-card${voteFx ? " cx-pulse-card--votefx" : ""}${isVotingClosed ? " cx-pulse-card--final" : ""}`}
                aria-live="polite"
              >
                <div className="cx-pulse-card-head">
                  <span className={`cx-pulse-card-title${isVotingClosed ? " cx-pulse-card-title--final" : ""}`}>
                    {isVotingClosed ? "Final results" : "Breakdown"}
                  </span>
                  <span className="cx-pulse-card-metric">
                    {multiTotalVotes.toLocaleString()} votes
                  </span>
                </div>
                {compareUrls?.map((_, idx) => {
                  const pctVal = multiPercents[idx] ?? 0;
                  const label = compareOptionLabel(post, idx);
                  const isLeader =
                    multiLeaderPct != null &&
                    multiLeaderPct > 0 &&
                    multiLeaderCount === 1 &&
                    pctVal === multiLeaderPct;
                  return (
                    <div
                      key={`${post.id}-pulse-${idx}`}
                      className={`cx-pulse-row${isLeader ? " cx-pulse-row--leader" : ""}`}
                    >
                      <div className="cx-pulse-row-top">
                        <span className="cx-pulse-name">{label}</span>
                        <div className="cx-pulse-row-actions">
                          <span className="cx-pulse-count">{pctVal}%</span>
                          <button
                            type="button"
                            className="cx-see-voters-btn"
                            onClick={() => void openVotersList(idx)}
                          >
                            See voters
                          </button>
                        </div>
                      </div>
                      <div className="cx-pulse-track" aria-hidden>
                        <div
                          className={`cx-pulse-fill cx-pulse-fill--opt-${idx % 10}`}
                          style={{ width: `${pctVal}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {!compareUrls ? (
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
                onClick={() => void handleVote("UP")}
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
            onClick={() => void handleToggleHype()}
          >
            <IconHeart filled={liked} />
            {hypeCount > 0 ? (
              <span className="cx-action-chip-count">{hypeCount}</span>
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
          </div>
          <div className="cx-action-rail-context">
            <span
              className={`cx-action-status-line${isVotingClosed ? " cx-action-status-line--result" : ""}`}
            >
              {isVotingClosed
                ? `🏆 ${votingWinnerSummary || "Results are in"}`
                : `${votingHasEndDate ? "⏳ " : ""}${votingStatusLabel}`}
            </span>
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
          </div>
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
              <button type="button" className="cx-modal-close" onClick={() => setShowVoters(false)}>
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
    prev.post.endingSoonLeadMinutes === next.post.endingSoonLeadMinutes
  );
}

export const FeedPostCard = memo(FeedPostCardComponent, areFeedPostCardPropsEqual);
