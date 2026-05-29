import { useMutation, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  VOTE_POST,
  SET_POST_HYPE,
  SET_POST_KEEP,
  POST_VOTE_UPDATED,
} from "@ctrend/shared/graphql/feed";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";
import { postPermalink } from "../lib/postPermalink";

const { width: SCREEN_W } = Dimensions.get("window");
const IMG_W = (SCREEN_W - 2) / 2;
const IMG_H = IMG_W * 1.55;

const GREEN = "#22c55e";
const ORANGE = "#f97316";

type Props = { post: FeedPostView };

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
    optionStats?: Array<{ index: number; label: string; count: number; percentage: number }> | null;
  };
};

type VotePostData = {
  votePost?: {
    postId: string;
    totalVotes: number;
    countsPerOption: number[];
    percentages: number[];
  } | null;
};

function compareLabel(post: FeedPostView, idx: number): string {
  const stat = post.optionStats?.find((s) => s.index === idx)?.label?.trim();
  if (stat) return stat;
  return post.postOptions?.[idx]?.label?.trim() ?? `Side ${idx + 1}`;
}

function calcCountdown(endsAt: string | null | undefined): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}D ${h}H ${m}M ${pad(s)}S`;
  if (h > 0) return `${h}H ${m}M ${pad(s)}S`;
  return `${m}M ${pad(s)}S`;
}

function makeStyles(c: ColorPalette) {
  return {
    card: { backgroundColor: c.card, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    header: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 14, paddingVertical: 12 },
    authorRow: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, gap: 10 },
    avatarWrap: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" as const },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarFallback: { backgroundColor: "#312e81", justifyContent: "center" as const, alignItems: "center" as const },
    avatarText: { color: "#ffffff", fontSize: 16, fontWeight: "700" as const },
    authorMeta: { flex: 1 },
    authorName: { fontSize: 14, fontWeight: "700" as const, color: c.text },
    timeLabel: { fontSize: 12, color: c.muted, marginTop: 1 },
    moreBtn: { padding: 6 },
    moreBtnText: { fontSize: 22, color: c.subtext },
    caption: { paddingHorizontal: 14, paddingBottom: 10, fontSize: 14, color: c.text, lineHeight: 20 },
    compareWrap: { flexDirection: "row" as const, gap: 2 },
    compareCell: { flex: 1, height: IMG_H, overflow: "hidden" as const },
    compareCellLoser: { opacity: 0.5 },
    compareImg: { width: "100%" as const, height: "100%" as const },
    pctOverlay: {
      position: "absolute" as const, bottom: 0, left: 0, right: 0,
      paddingVertical: 8, paddingHorizontal: 8,
      backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center" as const,
    },
    pctText: { color: "#ffffff", fontSize: 18, fontWeight: "900" as const },
    pctLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 1 },
    votedBadgeRow: { position: "absolute" as const, top: 10, left: 0, right: 0, alignItems: "center" as const },
    votedBadge: { backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    votedBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" as const },
    winnerBadgeRow: { position: "absolute" as const, top: 10, left: 0, right: 0, alignItems: "center" as const },
    winnerBadge: { backgroundColor: "#f59e0b", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    winnerBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" as const },
    splitBar: { flexDirection: "row" as const, height: 4 },
    splitBarLeft: { backgroundColor: GREEN },
    splitBarRight: { backgroundColor: ORANGE },
    voteHintRow: { paddingVertical: 8, alignItems: "center" as const },
    voteHintText: { fontSize: 12, color: c.subtext },
    voteHintRecorded: { color: GREEN, fontWeight: "600" as const },
    countdownRow: {
      flexDirection: "row" as const, alignItems: "center" as const,
      justifyContent: "space-between" as const, paddingHorizontal: 14, paddingBottom: 10,
    },
    countdownPill: {
      backgroundColor: c.section, borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: c.border,
    },
    countdownText: { fontSize: 12, fontWeight: "700" as const, color: c.text },
    seeDetailsBtn: {
      borderWidth: 1, borderColor: c.subtext, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 5,
    },
    seeDetailsBtnText: { fontSize: 11, fontWeight: "700" as const, color: c.text },
    liveSplit: { paddingHorizontal: 14, paddingBottom: 10 },
    liveSplitHeader: {
      flexDirection: "row" as const, justifyContent: "space-between" as const,
      alignItems: "center" as const, marginBottom: 8,
    },
    liveSplitTitle: { fontSize: 11, fontWeight: "800" as const, color: c.text, letterSpacing: 0.8 },
    liveSplitTotal: { fontSize: 11, color: c.muted },
    splitOptionRow: {
      backgroundColor: c.section, borderRadius: 10, padding: 10,
      marginBottom: 6, borderWidth: 1, borderColor: c.border,
    },
    splitOptionMeta: {
      flexDirection: "row" as const, alignItems: "center" as const,
      justifyContent: "space-between" as const, marginBottom: 6,
    },
    splitOptionLabel: { fontSize: 13, fontWeight: "600" as const, color: c.text, flex: 1 },
    splitOptionRight: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    splitOptionCount: { fontSize: 12, color: c.subtext, fontWeight: "600" as const },
    seeVotersBtn: {
      borderWidth: 1, borderColor: c.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    },
    seeVotersBtnText: { fontSize: 10, color: c.subtext, fontWeight: "700" as const },
    optionBarTrack: {
      height: 4, flexDirection: "row" as const, borderRadius: 2,
      overflow: "hidden" as const, backgroundColor: c.border,
    },
    optionBarFill: { borderRadius: 2 },
    optionBarEmpty: { backgroundColor: c.border },
    singleImg: { width: "100%" as const, height: 280 },
    actionsScroll: {},
    actionsContent: {
      flexDirection: "row" as const,
      paddingHorizontal: 12, paddingVertical: 8, gap: 7,
      alignItems: "center" as const,
    },
    actionChip: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 5,
      borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13,
      borderWidth: 1, borderColor: c.border,
    },
    actionChipHypeActive: { borderColor: "#fb7185", backgroundColor: "rgba(251,113,133,0.12)" },
    actionChipSaveActive: { borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.12)" },
    actionChipIcon: { fontSize: 13, lineHeight: 18, color: c.subtext },
    actionChipLabel: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.3, color: c.subtext },
    // legacy (kept for reference, unused)
    actions: {
      flexDirection: "row" as const, borderTopWidth: 1, borderTopColor: c.border,
      paddingVertical: 10, paddingHorizontal: 4,
    },
    actionBtn: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, paddingVertical: 4, gap: 5 },
    actionLabel: { fontSize: 9, color: c.subtext, fontWeight: "700" as const, letterSpacing: 0.3 },
    iconDiscussOuter: { width: 20, height: 19 },
    iconDiscussBubble: { width: 18, height: 15, borderWidth: 1.5, borderColor: c.subtext, borderRadius: 8 },
    iconDiscussTail: {
      position: "absolute" as const, bottom: 0, left: 4,
      width: 7, height: 6,
      borderRightWidth: 1.5, borderBottomWidth: 1.5,
      borderColor: c.subtext, borderBottomRightRadius: 5,
      backgroundColor: c.card,
    },
    iconShareOuter: { width: 18, height: 18 },
    iconShareBox: { width: 13, height: 13, borderWidth: 1.5, borderColor: c.subtext, borderRadius: 3 },
    iconShareDiag: {
      position: "absolute" as const, top: 0, right: 0,
      width: 9, height: 1.5, backgroundColor: c.subtext,
      transform: [{ rotate: "-45deg" }, { translateX: 2 }, { translateY: -2 }],
    },
    iconShareVert: { position: "absolute" as const, top: 0, right: 0, width: 1.5, height: 7, backgroundColor: c.subtext },
    iconShareHoriz: { position: "absolute" as const, top: 0, right: 0, width: 7, height: 1.5, backgroundColor: c.subtext },
    iconFullOuter: { width: 18, height: 18 },
    iconFullInner: { width: 12, height: 12, borderWidth: 1.5, borderColor: c.subtext, borderRadius: 2 },
    iconFullCorner: { position: "absolute" as const, top: 0, right: 0, width: 9, height: 9, borderTopWidth: 1.5, borderRightWidth: 1.5, borderColor: c.subtext, borderTopRightRadius: 3 },
    iconBmOuter: { width: 14, height: 18 },
    iconBmBody: { width: 14, height: 16, borderWidth: 1.5, borderColor: c.subtext, borderRadius: 2 },
    iconBmNotchWrap: { position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 7, flexDirection: "row" as const },
    iconBmNotchL: { flex: 1, borderTopRightRadius: 7, backgroundColor: c.card },
    iconBmNotchR: { flex: 1, borderTopLeftRadius: 7, backgroundColor: c.card },
    iconVotersOuter: { width: 22, height: 16 },
    iconVotersHead1: { position: "absolute" as const, left: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.subtext },
    iconVotersHead2: { position: "absolute" as const, left: 7, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: c.subtext, backgroundColor: c.card },
    iconVotersBody1: { position: "absolute" as const, bottom: 0, left: 0, width: 13, height: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 1.5, borderColor: c.subtext },
    iconVotersBody2: { position: "absolute" as const, bottom: 0, right: 0, width: 13, height: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderWidth: 1.5, borderColor: c.subtext, backgroundColor: c.card },
  };
}

function FeedPostCardComponent({ post }: Props) {
  const { user, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);

  const [optimisticVote, setOptimisticVote] = useState<VoteLiveState | null>(null);
  const [liked, setLiked] = useState(false);
  const [hypeCount, setHypeCount] = useState(post.hypeCount ?? 0);
  const [saved, setSaved] = useState(Boolean(post.viewerHasSaved));
  const [countdownStr, setCountdownStr] = useState(() => calcCountdown(post.votingEndsAt));
  const voteInFlight = useRef(false);
  const voteGuardUntil = useRef(0);
  const pendingVote = useRef<{ idx: number } | null>(null);

  // Animation values
  const cellScale = useRef([new Animated.Value(1), new Animated.Value(1)]).current;
  const cellOpacity = useRef([new Animated.Value(1), new Animated.Value(1)]).current;
  const flashOpacity = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const badgeScale = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const splitLeftAnim = useRef(new Animated.Value(50)).current;
  const splitRightAnim = useRef(new Animated.Value(50)).current;
  const splitAnimMounted = useRef(false);
  const badgeInit = useRef(false);
  const prevViewer = useRef<FeedPostView["viewerVote"] | undefined>(undefined);
  const chipScales = useRef([1, 1, 1, 1, 1, 1].map(() => new Animated.Value(1))).current;

  const isOwner = !!user && !!post.authorId && user.id === post.authorId;
  void isOwner;

  function goToPost() {
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    router.push(`/post/${post.id}` as `/${string}`);
  }

  const up = optimisticVote?.upvoteCount ?? post.upvoteCount;
  const down = optimisticVote?.downvoteCount ?? post.downvoteCount;
  const viewer = optimisticVote?.viewerVote ?? post.viewerVote;
  const activeStats = optimisticVote?.optionStats ?? post.optionStats;
  const activeIsVotingOpen = optimisticVote?.isVotingOpen ?? post.isVotingOpen ?? null;
  const isVotingClosed = activeIsVotingOpen === false;
  const activeMyIdx = optimisticVote?.mySelectedOptionIndex ?? post.mySelectedOptionIndex ?? null;
  const activeVotingEndsAt = optimisticVote?.votingEndsAt ?? post.votingEndsAt ?? null;

  void activeStats;
  void activeMyIdx;

  const compareUrls = post.imageUrls.length >= 2 ? post.imageUrls : null;
  const isBinary = compareUrls?.length === 2;
  const binaryTotal = up + down;
  const leftPct = binaryTotal > 0 ? Math.round((100 * up) / binaryTotal) : 50;
  const rightPct = binaryTotal > 0 ? Math.round((100 * down) / binaryTotal) : 50;
  const binaryWinner: 0 | 1 | null = isVotingClosed && binaryTotal > 0
    ? up > down ? 0 : down > up ? 1 : null : null;
  const hasVoted = viewer !== null || (optimisticVote?.mySelectedOptionIndex ?? post.mySelectedOptionIndex) !== null;

  useEffect(() => {
    if (!activeVotingEndsAt || isVotingClosed) return;
    const timer = setInterval(() => {
      const r = calcCountdown(activeVotingEndsAt);
      setCountdownStr(r);
      if (!r) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [activeVotingEndsAt, isVotingClosed]);

  useSubscription<PostVoteUpdatedData>(POST_VOTE_UPDATED, {
    variables: { postId: post.id },
    onData: ({ data }) => {
      const next = data.data?.postVoteUpdated;
      if (!next || next.id !== post.id) return;
      if (voteInFlight.current || Date.now() < voteGuardUntil.current) return;
      setOptimisticVote({
        upvoteCount: next.upvoteCount,
        downvoteCount: next.downvoteCount,
        viewerVote: next.viewerVote ?? null,
        mySelectedOptionIndex: next.mySelectedOptionIndex ?? null,
        optionStats: next.optionStats?.map((s) => ({ ...s, count: Math.round(s.count) })) ?? null,
        isVotingOpen: next.isVotingOpen ?? null,
        votingEndsAt: next.votingEndsAt ?? null,
      });
    },
  });

  useEffect(() => {
    if (voteInFlight.current || Date.now() < voteGuardUntil.current) return;
    setOptimisticVote(null);
    setHypeCount(post.hypeCount ?? 0);
    setSaved(Boolean(post.viewerHasSaved));
  }, [post.id, post.upvoteCount, post.downvoteCount, post.viewerVote,
    post.mySelectedOptionIndex, post.isVotingOpen, post.votingEndsAt,
    post.hypeCount, post.viewerHasSaved]);

  // Set initial badge scale for pre-voted cards (no animation)
  useEffect(() => {
    if (badgeInit.current) return;
    badgeInit.current = true;
    const v = post.viewerVote;
    if (v === "UP") badgeScale[0].setValue(1);
    else if (v === "DOWN") badgeScale[1].setValue(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Badge spring entrance + cell dim when viewer vote changes
  useEffect(() => {
    const prev = prevViewer.current;
    prevViewer.current = viewer;
    const isNew = viewer !== prev && prev !== undefined;
    if (viewer === "UP") {
      if (isNew) {
        badgeScale[0].setValue(0);
        Animated.spring(badgeScale[0], { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }).start();
      }
      Animated.timing(cellOpacity[1], { toValue: 0.55, duration: 280, useNativeDriver: true }).start();
      Animated.timing(cellOpacity[0], { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else if (viewer === "DOWN") {
      if (isNew) {
        badgeScale[1].setValue(0);
        Animated.spring(badgeScale[1], { toValue: 1, useNativeDriver: true, tension: 220, friction: 8 }).start();
      }
      Animated.timing(cellOpacity[0], { toValue: 0.55, duration: 280, useNativeDriver: true }).start();
      Animated.timing(cellOpacity[1], { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else if (prev !== undefined) {
      Animated.timing(cellOpacity[0], { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(cellOpacity[1], { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [viewer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animated split bar
  useEffect(() => {
    if (!splitAnimMounted.current) {
      splitLeftAnim.setValue(leftPct || 50);
      splitRightAnim.setValue(rightPct || 50);
      splitAnimMounted.current = true;
      return;
    }
    Animated.parallel([
      Animated.timing(splitLeftAnim, { toValue: leftPct || 50, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(splitRightAnim, { toValue: rightPct || 50, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
  }, [leftPct, rightPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const [voteMut] = useMutation<VotePostData>(VOTE_POST);
  const [setHypeMut] = useMutation(SET_POST_HYPE);
  const [setKeepMut] = useMutation(SET_POST_KEEP);

  function triggerVotePop(idx: number) {
    Animated.sequence([
      Animated.timing(cellScale[idx], { toValue: 1.065, duration: 80, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(cellScale[idx], { toValue: 0.975, duration: 80, useNativeDriver: true }),
      Animated.timing(cellScale[idx], { toValue: 1.018, duration: 100, useNativeDriver: true }),
      Animated.timing(cellScale[idx], { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    Animated.sequence([
      Animated.timing(flashOpacity[idx], { toValue: 0.38, duration: 80, useNativeDriver: true }),
      Animated.timing(flashOpacity[idx], { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }

  function chipPressIn(i: number) {
    Animated.spring(chipScales[i], { toValue: 0.92, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  }
  function chipPressOut(i: number) {
    Animated.spring(chipScales[i], { toValue: 1, useNativeDriver: true, tension: 180, friction: 12 }).start();
  }

  async function castVote(idx: number) {
    if (isVotingClosed) return;
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    const curVote = optimisticVote?.viewerVote ?? post.viewerVote;
    if ((idx === 0 && curVote === "UP") || (idx === 1 && curVote === "DOWN")) return;
    triggerVotePop(idx);

    const curUp = optimisticVote?.upvoteCount ?? post.upvoteCount;
    const curDown = optimisticVote?.downvoteCount ?? post.downvoteCount;
    let newUp = curUp; let newDown = curDown;
    if (idx === 0) { newUp += 1; if (curVote === "DOWN") newDown = Math.max(0, newDown - 1); }
    else { newDown += 1; if (curVote === "UP") newUp = Math.max(0, newUp - 1); }
    const total = newUp + newDown;
    const curStats = optimisticVote?.optionStats ?? post.optionStats ?? null;
    const newStats = curStats?.map((s) => {
      const c = s.index === 0 ? newUp : s.index === 1 ? newDown : s.count;
      return { ...s, count: c, percentage: total > 0 ? (c / total) * 100 : 0 };
    }) ?? null;
    setOptimisticVote({
      upvoteCount: newUp, downvoteCount: newDown,
      viewerVote: idx === 0 ? "UP" : "DOWN",
      mySelectedOptionIndex: idx,
      optionStats: newStats,
      isVotingOpen: activeIsVotingOpen,
      votingEndsAt: activeVotingEndsAt,
    });
    voteGuardUntil.current = Date.now() + 2000;

    if (voteInFlight.current) { pendingVote.current = { idx }; return; }
    voteInFlight.current = true;
    let currentIdx = idx;
    while (true) {
      try {
        const result = await voteMut({ variables: { postId: post.id, selectedOptionIndex: currentIdx, anonymous: false } });
        const payload = result.data?.votePost;
        if (payload?.countsPerOption && payload.countsPerOption.length >= 2) {
          const counts = payload.countsPerOption.map((n) => Math.max(0, Math.round(n)));
          const pcts = payload.percentages ?? [];
          const st2 = counts.reduce((a, b) => a + b, 0);
          setOptimisticVote((prev) => ({
            upvoteCount: counts[0] ?? (prev?.upvoteCount ?? 0),
            downvoteCount: counts[1] ?? (prev?.downvoteCount ?? 0),
            viewerVote: currentIdx === 0 ? "UP" : "DOWN",
            mySelectedOptionIndex: currentIdx,
            optionStats: prev?.optionStats?.map((s, i) => ({
              ...s, count: counts[i] ?? s.count,
              percentage: pcts[i] ?? (st2 > 0 ? ((counts[i] ?? 0) / st2) * 100 : 0),
            })) ?? null,
            isVotingOpen: prev?.isVotingOpen ?? null,
            votingEndsAt: prev?.votingEndsAt ?? null,
          }));
          voteGuardUntil.current = Date.now() + 500;
        }
        const pending = pendingVote.current; pendingVote.current = null;
        if (!pending) break;
        currentIdx = pending.idx;
      } catch {
        pendingVote.current = null; setOptimisticVote(null); break;
      }
    }
    voteInFlight.current = false;
  }

  async function handleHype() {
    const next = !liked;
    setLiked(next); setHypeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try { await setHypeMut({ variables: { postId: post.id, active: next } }); }
    catch { setLiked(!next); setHypeCount((n) => Math.max(0, n + (next ? -1 : 1))); }
  }

  async function handleSave() {
    const next = !saved; setSaved(next);
    try { await setKeepMut({ variables: { postId: post.id, keep: next } }); }
    catch { setSaved(!next); }
  }

  async function handleShare() {
    try { await Share.share({ url: postPermalink(post.id), title: "Ke Jitbe post" }); }
    catch { /* cancelled */ }
  }

  const authorName = post.authorDisplayName?.trim() || post.authorUsername;
  const authorInitial = authorName.slice(0, 1).toUpperCase();
  const uiAvatarName = encodeURIComponent(authorName.slice(0, 2));
  const authorAvatarUrl = post.authorProfileImageUrl
    || `https://ui-avatars.com/api/?name=${uiAvatarName}&background=312e81&color=ffffff&size=96&format=png`;
  const timeLabel = formatRelativeTime(post.createdAt);

  return (
    <View style={st.card}>
      {/* Header */}
      <View style={st.header}>
        <Pressable
          style={st.authorRow}
          onPress={() => post.authorId && router.push(`/profile/${post.authorId}` as `/${string}`)}
        >
          <View style={st.avatarWrap}>
            <Image source={{ uri: authorAvatarUrl }} style={st.avatar} contentFit="cover" cachePolicy="memory-disk" />
          </View>
          <View style={st.authorMeta}>
            <Text style={st.authorName}>{authorName}</Text>
            {timeLabel ? <Text style={st.timeLabel}>{timeLabel}</Text> : null}
          </View>
        </Pressable>
        <Pressable style={st.moreBtn} hitSlop={8}>
          <Text style={st.moreBtnText}>⋯</Text>
        </Pressable>
      </View>

      {/* Caption */}
      {post.caption ? <Text style={st.caption}>{post.caption}</Text> : null}

      {/* Compare images */}
      {compareUrls ? (
        <>
          <View style={st.compareWrap}>
            {compareUrls.slice(0, 2).map((url, i) => {
              const picked = (i === 0 && viewer === "UP") || (i === 1 && viewer === "DOWN");
              const pct = i === 0 ? leftPct : rightPct;
              const label = compareLabel(post, i);
              const isWinner = isVotingClosed && binaryWinner === i;
              return (
                <Animated.View
                  key={`${post.id}-${i}`}
                  style={[
                    st.compareCell,
                    isVotingClosed && !isWinner && st.compareCellLoser,
                    { transform: [{ scale: cellScale[i] }], opacity: cellOpacity[i] },
                  ]}
                >
                  <Pressable style={styles.fill} onPress={() => void castVote(i)} disabled={isVotingClosed}>
                    <Image source={{ uri: url }} style={st.compareImg} contentFit="cover" cachePolicy="memory-disk" />
                    <View style={st.pctOverlay}>
                      <Text style={st.pctText}>{pct}%</Text>
                      <Text style={st.pctLabel} numberOfLines={1}>{label}</Text>
                    </View>
                    {/* Vote flash */}
                    <Animated.View pointerEvents="none" style={[styles.absoluteFill, { backgroundColor: "rgba(255,255,255,0.8)", opacity: flashOpacity[i] }]} />
                    {picked && !isVotingClosed && (
                      <Animated.View style={[st.votedBadgeRow, { transform: [{ scale: badgeScale[i] }] }]}>
                        <View style={st.votedBadge}>
                          <Text style={st.votedBadgeText}>♥ VOTED</Text>
                        </View>
                      </Animated.View>
                    )}
                    {isWinner && (
                      <View style={st.winnerBadgeRow}>
                        <View style={st.winnerBadge}>
                          <Text style={st.winnerBadgeText}>👑 WINNER</Text>
                        </View>
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          {/* Split bar — animated flex */}
          <View style={st.splitBar}>
            <Animated.View style={[st.splitBarLeft, { flex: splitLeftAnim }]} />
            <Animated.View style={[st.splitBarRight, { flex: splitRightAnim }]} />
          </View>
        </>
      ) : post.imageUrls[0] ? (
        <Image source={{ uri: post.imageUrls[0] }} style={st.singleImg} contentFit="cover" cachePolicy="memory-disk" />
      ) : null}

      {/* Vote hint */}
      {compareUrls && !isVotingClosed ? (
        <View style={st.voteHintRow}>
          <Text style={[st.voteHintText, hasVoted && st.voteHintRecorded]}>
            {hasVoted ? "✓ Vote recorded — tap to change" : "👆 Tap an image to cast your vote"}
          </Text>
        </View>
      ) : null}

      {/* Countdown */}
      {countdownStr && !isVotingClosed ? (
        <View style={st.countdownRow}>
          <View style={st.countdownPill}>
            <Text style={st.countdownText}>{countdownStr} LEFT</Text>
          </View>
          <Pressable style={st.seeDetailsBtn} onPress={() => goToPost()}>
            <Text style={st.seeDetailsBtnText}>SEE DETAILS</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Live Split */}
      {isBinary && binaryTotal > 0 ? (
        <View style={st.liveSplit}>
          <View style={st.liveSplitHeader}>
            <Text style={st.liveSplitTitle}>LIVE SPLIT</Text>
            <Text style={st.liveSplitTotal}>{binaryTotal} votes</Text>
          </View>
          {([0, 1] as const).map((i) => {
            const count = i === 0 ? up : down;
            const pct = i === 0 ? leftPct : rightPct;
            const label = compareLabel(post, i);
            const barColor = i === 0 ? GREEN : ORANGE;
            return (
              <View key={i} style={st.splitOptionRow}>
                <View style={st.splitOptionMeta}>
                  <Text style={st.splitOptionLabel} numberOfLines={1}>{label}</Text>
                  <View style={st.splitOptionRight}>
                    <Text style={st.splitOptionCount}>{count} · {pct}%</Text>
                    <Pressable style={st.seeVotersBtn} onPress={() => goToPost()}>
                      <Text style={st.seeVotersBtnText}>SEE VOTERS</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={st.optionBarTrack}>
                  <View style={[st.optionBarFill, { flex: pct, backgroundColor: barColor }]} />
                  <View style={[st.optionBarEmpty, { flex: 100 - pct }]} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Action chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[st.actionsScroll, { borderTopWidth: 1, borderTopColor: colors.border }]}
        contentContainerStyle={st.actionsContent}
      >
        {(([
          { i: 0, label: "DISCUSS", icon: "💬", onPress: goToPost },
          { i: 1, label: "SHARE", icon: "↗", onPress: () => void handleShare() },
          { i: 2, label: "OPEN", icon: "⛶", onPress: goToPost },
          {
            i: 3,
            label: `HYPE${hypeCount > 0 ? " " + String(hypeCount) : ""}`,
            icon: liked ? "♥" : "♡",
            onPress: () => void handleHype(),
            active: liked,
            activeStyle: st.actionChipHypeActive,
            activeTextColor: "#fb7185",
          },
          {
            i: 4,
            label: "KEEP",
            icon: "🔖",
            onPress: () => void handleSave(),
            active: saved,
            activeStyle: st.actionChipSaveActive,
            activeTextColor: "#f59e0b",
          },
          { i: 5, label: "VOTERS", icon: "👥", onPress: goToPost },
        ]) as Array<{
          i: number; label: string; icon: string; onPress: () => void;
          active?: boolean; activeStyle?: object; activeTextColor?: string;
        }>).map(({ i, label, icon, onPress, active, activeStyle, activeTextColor }) => (
          <Animated.View key={i} style={{ transform: [{ scale: chipScales[i] }] }}>
            <Pressable
              style={[st.actionChip, active && activeStyle]}
              onPressIn={() => chipPressIn(i)}
              onPressOut={() => chipPressOut(i)}
              onPress={onPress}
              hitSlop={4}
            >
              <Text style={[st.actionChipIcon, active && activeTextColor ? { color: activeTextColor } : null]}>
                {icon}
              </Text>
              <Text style={[st.actionChipLabel, active && activeTextColor ? { color: activeTextColor } : null]}>
                {label}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

export const FeedPostCard = memo(FeedPostCardComponent);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
