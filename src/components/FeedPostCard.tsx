import { useLazyQuery, useMutation, useSubscription } from "@apollo/client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  DELETE_POST,
  FEED_POSTS,
  GET_POST_BY_ID,
  MY_SAVED_POSTS,
  POST_VOTE_UPDATED,
  SET_POST_HYPE,
  SET_POST_KEEP,
  VOTERS_BY_POST,
  VOTE_POST,
} from "../graphql/feed";
import { apolloClient } from "../lib/apolloClient";
import { postPermalink } from "../lib/postPermalink";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { playVoteSound } from "../lib/notificationSound";
import type { FeedPostView, VoteDirectionGql } from "../types/feed";

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
    } | null;
  }>;
};

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

type Props = {
  post: FeedPostView;
  /** `local` = demo feed only; `api` = call GraphQL `votePost`. */
  voteMode: "api" | "local";
  /** When false, hide “open post page” (e.g. on `/post/:id` itself). Share still works. */
  showPermalinkToolbar?: boolean;
};

function FeedPostCardComponent({
  post,
  voteMode,
  showPermalinkToolbar = true,
}: Props) {
  const { user: authUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [liked, setLiked] = useState(false);
  const [hypeCountLive, setHypeCountLive] = useState(post.hypeCount ?? 0);
  const [saved, setSaved] = useState(Boolean(post.viewerHasSaved));
  const [anonymousVote, setAnonymousVote] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [localComments, setLocalComments] = useState<LocalCommentRow[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
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

  const [fetchComments, { data: commentsData, loading: commentsLoading, error: commentsQueryError }] =
    useLazyQuery<CommentsByPostQueryData>(COMMENTS_BY_POST, { fetchPolicy: "network-only" });
  const [fetchVoters, { data: votersData, loading: votersLoading, error: votersError }] =
    useLazyQuery<VotersByPostData>(VOTERS_BY_POST, { fetchPolicy: "network-only" });

  const [commentMut, { loading: commentPosting }] = useMutation(COMMENT_POST, {
    refetchQueries: [{ query: COMMENTS_BY_POST, variables: { postId: post.id } }],
  });
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
      setVoteFx(true);
      setTimeout(() => setVoteFx(false), 280);
    },
  });

  useEffect(() => {
    if (commentsOpen && voteMode === "api") {
      void fetchComments({ variables: { postId: post.id } });
    }
  }, [commentsOpen, voteMode, post.id, fetchComments]);

  useEffect(() => {
    if (!commentsOpen) {
      setShowAllComments(false);
    }
  }, [commentsOpen]);

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

    function handleOutsidePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (votersModalCardRef.current?.contains(target)) {
        return;
      }
      setShowVoters(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowVoters(false);
      }
    }

    document.addEventListener("mousedown", handleOutsidePointerDown);
    document.addEventListener("touchstart", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
      document.removeEventListener("touchstart", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showVoters]);

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
    setSaved(Boolean(post.viewerHasSaved));
    setLiked(false);
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
    }
  }

  async function openVotersList(optionIndex?: number) {
    setShowVoters(true);
    if (voteMode !== "api") {
      return;
    }
    await fetchVoters({ variables: { postId: post.id, optionIndex } });
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
      : (optimisticVote?.viewerVote ?? post.viewerVote);
  const activeOptionStats = optimisticVote?.optionStats ?? post.optionStats;
  const activeMySelectedOptionIndex =
    optimisticVote?.mySelectedOptionIndex ?? post.mySelectedOptionIndex ?? null;
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

  const timeLabel =
    formatRelativeTime(post.createdAt) || (voteMode === "local" ? "demo" : "");
  const votingEndsDate = activeVotingEndsAt ? new Date(activeVotingEndsAt) : null;
  const votingHasEndDate =
    votingEndsDate != null && !Number.isNaN(votingEndsDate.getTime());
  const votingEndedByTime =
    votingHasEndDate && votingEndsDate.getTime() <= nowMs;
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
      mySelectedOptionIndex: selectedOptionIndex,
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

    // Arm the subscription guard so a concurrent broadcast can't overwrite our state.
    voteGuardUntilRef.current = Date.now() + 2000;
    if (voteInFlight.current) {
      // A mutation is already in flight — queue this as the latest intent and
      // let the running loop pick it up when it completes.
      pendingVoteRef.current = { selectedOptionIndex };
      return;
    }
    voteInFlight.current = true;
    let currentIdx = selectedOptionIndex;
    // Loop: after each mutation, check whether a newer tap came in.  If so,
    // skip applying that result and immediately fire another mutation for the
    // latest intent — ensuring the server always lands on the user's last choice.
    while (true) {
      try {
        const { data } = await voteMut({
          variables: {
            postId: post.id,
            selectedOptionIndex: currentIdx,
            anonymous: anonymousVote,
          },
        });
        const pending = pendingVoteRef.current;
        pendingVoteRef.current = null;
        if (!pending) {
          applyServerVoteSnapshot(data?.votePost, currentIdx);
          break;
        }
        // Newer intent queued — discard this stale result and loop.
        currentIdx = pending.selectedOptionIndex;
      } catch (err: unknown) {
        pendingVoteRef.current = null;
        setOptimisticVote(null); // revert on error
        const message = getApolloErrorMessage(err);
        await refreshPostVotingState();
        if (/voting period has ended/i.test(message)) break;
        break;
      }
    }
    voteInFlight.current = false;
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

      voteGuardUntilRef.current = Date.now() + 2000;
      if (voteInFlight.current) {
        pendingVoteRef.current = { selectedOptionIndex: index };
        return;
      }
      voteInFlight.current = true;
      let currentMultiIdx = index;
      while (true) {
        try {
          const { data } = await voteMut({
            variables: {
              postId: post.id,
              selectedOptionIndex: currentMultiIdx,
              anonymous: anonymousVote,
            },
          });
          const pending = pendingVoteRef.current;
          pendingVoteRef.current = null;
          if (!pending) {
            applyServerVoteSnapshot(data?.votePost, currentMultiIdx);
            break;
          }
          currentMultiIdx = pending.selectedOptionIndex;
        } catch (err: unknown) {
          pendingVoteRef.current = null;
          setOptimisticVote(null);
          const message = getApolloErrorMessage(err);
          await refreshPostVotingState();
          if (/voting period has ended/i.test(message)) break;
          break;
        }
      }
      voteInFlight.current = false;
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
  const hypeCount = hypeCountLive;
  const apiComments = commentsData?.commentsByPost ?? [];
  const displayedApiComments = showAllComments ? apiComments : apiComments.slice(0, 2);
  const hasMoreApiComments = apiComments.length > 2;
  const displayedLocalComments = showAllComments ? localComments : localComments.slice(0, 2);
  const hasMoreLocalComments = localComments.length > 2;
  const recentPreviewComments = (post.recentComments ?? []).slice(0, 2);
  const hasMorePreviewComments = (post.commentCount ?? recentPreviewComments.length) > 2;
  const groupedVoters = useMemo(() => {
    const rows = votersData?.votersByPost ?? [];
    const groups = new Map<number, typeof rows>();
    for (const row of rows) {
      const existing = groups.get(row.selectedOptionIndex) ?? [];
      existing.push(row);
      groups.set(row.selectedOptionIndex, existing);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [votersData]);
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

  return (
    <article className="ig-post">
      <header className="ig-post-header">
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
              {post.authorDisplayName?.trim() || post.authorUsername}
            </span>
            <span className="ig-post-meta">{formatRelativeTime(post.createdAt)}</span>
          </div>
        </div>
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
                    <img src={url} alt="" width={1080} height={1080} loading="lazy" decoding="async" />
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
                  <img src={url} alt="" width={1080} height={1080} loading="lazy" decoding="async" />
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
                  onChange={(e) => setAnonymousVote(e.target.checked)}
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

      <div className="cx-post-footer">
        <div className="cx-post-details-head">
          <div className="cx-post-details-status">
            <span
              className={`cx-voting-badge${isVotingClosed ? " cx-voting-badge--closed" : ""}`}
            >
              {isVotingClosed ? "🏆 Result" : votingStatusLabel}
            </span>
            {isVotingClosed && votingWinnerSummary ? (
              <span className="cx-voting-result">{votingWinnerSummary}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="cx-details-toggle"
            aria-expanded={detailsOpen}
            aria-controls={`post-details-${post.id}`}
            onClick={() => setDetailsOpen((prev) => !prev)}
          >
            {detailsOpen ? "Hide details" : "See details"}
          </button>
        </div>

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

        <div className="cx-action-rail" role="toolbar" aria-label="Post actions">
          <button
            type="button"
            className={`cx-action-chip${commentsOpen ? " cx-action-chip--pressed" : ""}`}
            aria-label={commentsOpen ? "Hide comments" : "Show comments"}
            aria-expanded={commentsOpen}
            onClick={() => {
              setCommentsOpen((v) => !v);
              setCommentError(null);
              setShowAllComments(false);
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
            disabled={hypeUpdating}
            onClick={() => void handleToggleHype()}
          >
            <IconHeart filled={liked} />
            <span className="cx-action-chip-label">Hype {hypeCount}</span>
          </button>
          <button
            type="button"
            className={`cx-action-chip${saved ? " cx-action-chip--saved" : ""}`}
            aria-label={saved ? "Unsave" : "Save"}
            aria-pressed={saved}
            disabled={keepUpdating}
            onClick={() => void handleToggleKeep()}
          >
            <IconBookmark filled={saved} />
            <span className="cx-action-chip-label">Keep</span>
          </button>
          <button
            type="button"
            className="cx-action-chip"
            aria-label="See who voted"
            onClick={() => void openVotersList()}
          >
            <span className="cx-action-chip-label">Voters</span>
          </button>
        </div>

        {!commentsOpen && recentPreviewComments.length > 0 ? (
          <div className="ig-post-comments-preview">
            {recentPreviewComments.map((c) => (
              <p key={c.id} className="muted small">
                <strong>{c.author.displayName?.trim() || c.author.username}</strong>: {c.content}
              </p>
            ))}
            {hasMorePreviewComments ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setCommentsOpen(true);
                  setShowAllComments(true);
                }}
              >
                Show more
              </button>
            ) : null}
          </div>
        ) : null}

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
              ? displayedApiComments.map((c) => (
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
              : displayedLocalComments.map((c) => (
                  <li key={c.id} className="ig-post-comment">
                    <span className="ig-post-comment-author">{c.authorLabel}</span>
                    <p className="ig-post-comment-body">{c.content}</p>
                    <time className="ig-post-comment-time" dateTime={c.createdAt}>
                      {formatRelativeTime(c.createdAt) || "just now"}
                    </time>
                  </li>
                ))}
          </ul>
          {(voteMode === "api" ? hasMoreApiComments : hasMoreLocalComments) ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowAllComments((v) => !v)}
            >
              {showAllComments ? "Show less" : "Show more"}
            </button>
          ) : null}
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
      {showVoters ? (
        <div
          className="ig-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Voter list"
        >
          <section ref={votersModalCardRef} className="ig-modal-card">
            <div className="ig-post-comments-head">
              <h3 className="ig-post-comments-title">Voted by</h3>
            <button type="button" className="cx-modal-close" onClick={() => setShowVoters(false)}>
                Close
              </button>
            </div>
            {votersLoading ? <p className="muted small">Loading voters…</p> : null}
            {votersError ? (
              <p className="ig-post-comments-error" role="alert">
                {votersError.message}
              </p>
            ) : null}
            <div className="ig-voter-list-scroll">
              {groupedVoters.map(([optionIndex, voters]) => (
                <div key={`option-group-${optionIndex}`} className="ig-voter-group">
                  <div className="ig-voter-group-head">
                    <span>Chose {compareOptionLabel(post, optionIndex)}</span>
                  </div>
                  <ul className="ig-post-comments-list">
                    {voters.map((v) => (
                      <li key={v.voteId} className="ig-post-comment">
                        <span className="ig-post-comment-author">
                          {v.anonymous || !v.user
                            ? "Anonymous voter"
                            : v.user.displayName?.trim() || v.user.username || "Voter"}
                        </span>
                        <time className="ig-post-comment-time" dateTime={v.createdAt}>
                          {formatRelativeTime(v.createdAt) || ""}
                        </time>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
    prev.post.mySelectedOptionIndex === next.post.mySelectedOptionIndex &&
    prev.post.isVotingOpen === next.post.isVotingOpen &&
    prev.post.votingEndsAt === next.post.votingEndsAt
  );
}

export const FeedPostCard = memo(FeedPostCardComponent, areFeedPostCardPropsEqual);
