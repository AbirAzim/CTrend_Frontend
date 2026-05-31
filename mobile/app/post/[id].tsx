import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COMMENTS_BY_POST,
  COMMENT_POST,
  SET_COMMENT_LIKE,
  SET_COMMENT_REACTION,
} from "@ctrend/shared/graphql/comments";
import {
  DELETE_POST,
  EXTEND_POST_VOTING,
  GET_POST_BY_ID,
  SET_POST_HYPE,
  SET_POST_KEEP,
  VOTERS_BY_POST,
  VOTE_POST,
} from "@ctrend/shared/graphql/feed";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import type { ColorPalette } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";
import { postPermalink } from "../../lib/postPermalink";

const { width: SCREEN_W } = Dimensions.get("window");
const IMG_W = (SCREEN_W - 2) / 2;
const IMG_H = IMG_W * 1.55;

// ─── Types ───────────────────────────────────────────────────────────────────

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

type GqlComment = {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  viewerHasLiked: boolean;
  postId: string;
  parentId: string | null;
  viewerReaction: string | null;
  reactions: Array<{ emoji: string; count: number }>;
  author: { id: string; username: string; displayName: string | null; profileImageUrl?: string | null };
};

type GqlVoter = {
  voteId: string;
  selectedOptionIndex: number;
  anonymous: boolean;
  createdAt: string;
  user: { id: string; username: string; displayName: string | null; profileImageUrl?: string | null } | null;
};

type CommentsData = { commentsByPost: GqlComment[] };
type PostData = { getPostById: unknown };
type VotersData = { votersByPost: GqlVoter[] };

// ─── Duration options for extend voting ──────────────────────────────────────

const EXTEND_OPTS = [
  { label: "+1h", ms: 1 * 60 * 60 * 1000 },
  { label: "+12h", ms: 12 * 60 * 60 * 1000 },
  { label: "+1d", ms: 24 * 60 * 60 * 1000 },
  { label: "+3d", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "+7d", ms: 7 * 24 * 60 * 60 * 1000 },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1, backgroundColor: c.bg },
    headerBack: { paddingHorizontal: 4 },
    headerBackText: { fontSize: 16, color: c.accent, fontWeight: "700" },

    // Comments section
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    sectionTitle: { fontSize: 13, fontWeight: "800", color: c.text, letterSpacing: 0.5 },
    commentCount: { fontSize: 12, color: c.muted },

    // Comment rows
    commentRow: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    replyRow: {
      paddingHorizontal: 14,
      paddingLeft: 42,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    commentAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#312e81",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    commentAvatarText: { color: "#fff", fontSize: 11, fontWeight: "700" },
    commentAuthor: { fontSize: 13, fontWeight: "700", color: c.text },
    commentTime: { fontSize: 11, color: c.muted },
    commentContent: { fontSize: 14, color: c.text, lineHeight: 20, marginLeft: 36 },
    commentActions: { flexDirection: "row", gap: 16, marginTop: 6, marginLeft: 36 },
    commentActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    commentActionText: { fontSize: 12, color: c.subtext },
    commentActionLiked: { color: "#f87171" },
    replyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
    replyBtnText: { fontSize: 12, color: c.accent, fontWeight: "600" },

    // Input area
    inputWrap: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.card,
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 10,
    },
    replyingBanner: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: c.section,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    replyingText: { fontSize: 12, color: c.subtext },
    replyingCancel: { fontSize: 12, color: c.accent, fontWeight: "700" },
    inputBox: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      maxHeight: 100,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

    // Voter modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
    modalSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "70%",
    },
    modalHandle: {
      width: 36,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 10,
      marginBottom: 6,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: c.text,
      textAlign: "center",
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginHorizontal: 16,
    },
    tabRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 10, gap: 8 },
    tabBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabBtnActive: { backgroundColor: c.accent, borderColor: c.accent },
    tabBtnText: { fontSize: 12, fontWeight: "700", color: c.subtext },
    tabBtnTextActive: { color: "#fff" },
    voterRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    voterAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#312e81",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    voterAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    voterName: { fontSize: 14, fontWeight: "700", color: c.text },
    voterTime: { fontSize: 12, color: c.muted },
    voterEmpty: { textAlign: "center", paddingVertical: 24, color: c.muted, fontSize: 14 },

    // Owner actions
    ownerActions: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    ownerBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
    },
    ownerBtnDelete: { borderColor: "#f87171" },
    ownerBtnText: { fontSize: 13, fontWeight: "700", color: c.text },
    ownerBtnDeleteText: { color: "#f87171" },

    // Extend modal
    extendModal: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    extendSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      gap: 12,
    },
    extendTitle: { fontSize: 16, fontWeight: "800", color: c.text, textAlign: "center", marginBottom: 4 },
    extendOptsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    extendOpt: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: c.section,
      borderWidth: 1,
      borderColor: c.border,
    },
    extendOptText: { fontSize: 14, fontWeight: "700", color: c.text },
    extendCancel: {
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    extendCancelText: { fontSize: 14, color: c.muted },

    reactionStrip: {
      flexDirection: "row" as const, flexWrap: "wrap" as const,
      gap: 4, marginTop: 6, marginLeft: 36,
    },
    reactionBtn: {
      flexDirection: "row" as const, alignItems: "center" as const,
      paddingHorizontal: 7, paddingVertical: 3,
      borderRadius: 12, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.section,
    },
    reactionBtnActive: { borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,0.14)" },
    reactionText: { fontSize: 11, color: c.text },

    empty: { paddingVertical: 24, alignItems: "center" },
    emptyText: { fontSize: 13, color: c.muted },

    loadingRow: { paddingVertical: 24, alignItems: "center" },
    errorRow: { paddingHorizontal: 14, paddingVertical: 12 },
    errorText: { fontSize: 14, color: "#f87171" },

    // Action chips
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
    actionChipIcon: { fontSize: 13, lineHeight: 18 as number, color: c.subtext },
    actionChipLabel: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.3, color: c.subtext },

    // Inline post card
    postCard: { backgroundColor: c.card, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    postHeader: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    postAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#312e81", alignItems: "center" as const, justifyContent: "center" as const },
    postAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" as const },
    postAuthor: { fontSize: 14, fontWeight: "700" as const, color: c.text },
    postTime: { fontSize: 12, color: c.muted, marginTop: 1 },
    postCaption: { paddingHorizontal: 14, paddingBottom: 10, fontSize: 14, color: c.text, lineHeight: 20 },
    postImages: { flexDirection: "row" as const, gap: 2 },
    postImgCell: { width: IMG_W, height: IMG_H, overflow: "hidden" as const },
    postImg: { width: "100%" as const, height: "100%" as const },
    postPctOverlay: { position: "absolute" as const, bottom: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 8, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center" as const },
    postPctText: { color: "#fff", fontSize: 18, fontWeight: "900" as const },
    postPctLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 1 },
    postVotedBadge: { position: "absolute" as const, top: 10, left: 0, right: 0, alignItems: "center" as const },
    postVotedBadgeInner: { backgroundColor: "#22c55e", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    postVotedBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" as const },
    postSplitBar: { flexDirection: "row" as const, height: 4 },
    postVoteHint: { paddingVertical: 8, alignItems: "center" as const },
    postVoteHintText: { fontSize: 12, color: c.subtext },
    postVoteHintVoted: { color: "#22c55e", fontWeight: "600" as const },
  });
}

// ─── Comment component ────────────────────────────────────────────────────────

type CommentItemProps = {
  comment: GqlComment;
  replies: GqlComment[];
  colors: ColorPalette;
  st: ReturnType<typeof makeStyles>;
  onReply: (id: string, name: string) => void;
  onLike: (id: string, liked: boolean) => void;
};

function CommentItem({ comment, replies, st, onReply, onLike }: CommentItemProps) {
  const [localLiked, setLocalLiked] = useState(comment.viewerHasLiked);
  const [localCount, setLocalCount] = useState(comment.likeCount);
  const [showReplies, setShowReplies] = useState(false);
  const [localReaction, setLocalReaction] = useState<string | null>(comment.viewerReaction ?? null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    Object.fromEntries((comment.reactions ?? []).map((r) => [r.emoji, r.count])),
  );
  const [reactMut] = useMutation(SET_COMMENT_REACTION);

  const authorName = comment.author.displayName?.trim() || comment.author.username;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorImg = normalizeProfileImageUrl(comment.author.profileImageUrl);

  function handleLike() {
    const next = !localLiked;
    setLocalLiked(next);
    setLocalCount((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike(comment.id, next);
  }

  async function handleReact(emoji: string) {
    const prev = localReaction;
    const next = prev === emoji ? null : emoji;
    setLocalReaction(next);
    setReactionCounts((c) => {
      const updated = { ...c };
      if (prev) updated[prev] = Math.max(0, (updated[prev] ?? 1) - 1);
      if (next) updated[next] = (updated[next] ?? 0) + 1;
      return updated;
    });
    try {
      await reactMut({ variables: { commentId: comment.id, emoji: next } });
    } catch {
      setLocalReaction(prev);
      setReactionCounts(Object.fromEntries((comment.reactions ?? []).map((r) => [r.emoji, r.count])));
    }
  }

  return (
    <>
      <View style={st.commentRow}>
        <Pressable
          style={st.commentHeader}
          onPress={() => router.push(`/profile/${comment.author.id}` as `/${string}`)}
        >
          <View style={st.commentAvatar}>
            {authorImg
              ? <Image source={{ uri: authorImg }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              : <Text style={st.commentAvatarText}>{initial}</Text>
            }
          </View>
          <Text style={st.commentAuthor}>{authorName}</Text>
          <Text style={st.commentTime}>{formatRelativeTime(comment.createdAt)}</Text>
        </Pressable>
        <Text style={st.commentContent}>{comment.content}</Text>
        <View style={st.commentActions}>
          <Pressable style={st.commentActionBtn} onPress={handleLike} hitSlop={8}>
            <Text style={[st.commentActionText, localLiked && st.commentActionLiked]}>
              {localLiked ? "♥" : "♡"} {localCount > 0 ? localCount : ""}
            </Text>
          </Pressable>
          <Pressable style={st.replyBtn} onPress={() => onReply(comment.id, authorName)} hitSlop={8}>
            <Text style={st.replyBtnText}>↩ Reply</Text>
          </Pressable>
          {replies.length > 0 && (
            <Pressable onPress={() => setShowReplies((v) => !v)} hitSlop={8}>
              <Text style={st.replyBtnText}>
                {showReplies ? "Hide" : `${replies.length} repl${replies.length === 1 ? "y" : "ies"}`}
              </Text>
            </Pressable>
          )}
        </View>
        {/* Emoji reaction strip */}
        <View style={st.reactionStrip}>
          {REACTION_EMOJIS.map((emoji) => {
            const count = reactionCounts[emoji] ?? 0;
            const isActive = localReaction === emoji;
            return (
              <Pressable key={emoji} onPress={() => void handleReact(emoji)} hitSlop={4}>
                <View style={[st.reactionBtn, isActive && st.reactionBtnActive]}>
                  <Text style={st.reactionText}>{emoji}{count > 0 ? ` ${count}` : ""}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      {showReplies && replies.map((r) => (
        <ReplyItem key={r.id} reply={r} st={st} onLike={onLike} />
      ))}
    </>
  );
}

type ReplyItemProps = {
  reply: GqlComment;
  st: ReturnType<typeof makeStyles>;
  onLike: (id: string, liked: boolean) => void;
};

function ReplyItem({ reply, st, onLike }: ReplyItemProps) {
  const [localLiked, setLocalLiked] = useState(reply.viewerHasLiked);
  const [localCount, setLocalCount] = useState(reply.likeCount);
  const [localReaction, setLocalReaction] = useState<string | null>(reply.viewerReaction ?? null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    Object.fromEntries((reply.reactions ?? []).map((r) => [r.emoji, r.count])),
  );
  const [reactMut] = useMutation(SET_COMMENT_REACTION);

  const authorName = reply.author.displayName?.trim() || reply.author.username;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorImg = normalizeProfileImageUrl(reply.author.profileImageUrl);

  function handleLike() {
    const next = !localLiked;
    setLocalLiked(next);
    setLocalCount((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike(reply.id, next);
  }

  async function handleReact(emoji: string) {
    const prev = localReaction;
    const next = prev === emoji ? null : emoji;
    setLocalReaction(next);
    setReactionCounts((c) => {
      const updated = { ...c };
      if (prev) updated[prev] = Math.max(0, (updated[prev] ?? 1) - 1);
      if (next) updated[next] = (updated[next] ?? 0) + 1;
      return updated;
    });
    try {
      await reactMut({ variables: { commentId: reply.id, emoji: next } });
    } catch {
      setLocalReaction(prev);
      setReactionCounts(Object.fromEntries((reply.reactions ?? []).map((r) => [r.emoji, r.count])));
    }
  }

  return (
    <View style={st.replyRow}>
      <Pressable
        style={st.commentHeader}
        onPress={() => router.push(`/profile/${reply.author.id}` as `/${string}`)}
      >
        <View style={[st.commentAvatar, { width: 24, height: 24, borderRadius: 12 }]}>
          {authorImg
            ? <Image source={{ uri: authorImg }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={[st.commentAvatarText, { fontSize: 9 }]}>{initial}</Text>
          }
        </View>
        <Text style={st.commentAuthor}>{authorName}</Text>
        <Text style={st.commentTime}>{formatRelativeTime(reply.createdAt)}</Text>
      </Pressable>
      <Text style={[st.commentContent, { marginLeft: 32 }]}>{reply.content}</Text>
      <View style={[st.commentActions, { marginLeft: 32 }]}>
        <Pressable style={st.commentActionBtn} onPress={handleLike} hitSlop={8}>
          <Text style={[st.commentActionText, localLiked && st.commentActionLiked]}>
            {localLiked ? "♥" : "♡"} {localCount > 0 ? localCount : ""}
          </Text>
        </Pressable>
      </View>
      {/* Emoji reactions on replies */}
      <View style={[st.reactionStrip, { marginLeft: 32 }]}>
        {REACTION_EMOJIS.map((emoji) => {
          const count = reactionCounts[emoji] ?? 0;
          const isActive = localReaction === emoji;
          return (
            <Pressable key={emoji} onPress={() => void handleReact(emoji)} hitSlop={4}>
              <View style={[st.reactionBtn, isActive && st.reactionBtnActive]}>
                <Text style={st.reactionText}>{emoji}{count > 0 ? ` ${count}` : ""}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Voters bottom sheet ──────────────────────────────────────────────────────

type VotersSheetProps = {
  postId: string;
  visible: boolean;
  onClose: () => void;
  optionLabels: string[];
  st: ReturnType<typeof makeStyles>;
  insets: { bottom: number };
};

function VotersSheet({ postId, visible, onClose, optionLabels, st, insets }: VotersSheetProps) {
  const [activeTab, setActiveTab] = useState<number | null>(null);

  const { data, loading } = useQuery<VotersData>(VOTERS_BY_POST, {
    variables: { postId, optionIndex: activeTab ?? undefined },
    skip: !visible,
    fetchPolicy: "network-only",
  });

  const voters = data?.votersByPost ?? [];
  const tabs = [{ label: "All", value: null }, ...optionLabels.map((l, i) => ({ label: l, value: i }))];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.modalOverlay} onPress={onClose}>
        <View style={[st.modalSheet, { paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
          <View style={st.modalHandle} />
          <Text style={st.modalTitle}>Voters</Text>

          <View style={st.tabRow}>
            {tabs.map((t) => (
              <Pressable
                key={String(t.value)}
                style={[st.tabBtn, activeTab === t.value && st.tabBtnActive]}
                onPress={() => setActiveTab(t.value)}
              >
                <Text style={[st.tabBtnText, activeTab === t.value && st.tabBtnTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={{ marginTop: 8 }}>
            {loading ? (
              <ActivityIndicator style={{ margin: 24 }} />
            ) : voters.length === 0 ? (
              <Text style={st.voterEmpty}>No voters yet</Text>
            ) : (
              voters.map((v) => {
                const name = v.anonymous
                  ? "Anonymous"
                  : v.user?.displayName?.trim() || v.user?.username || "Unknown";
                const initial = name.slice(0, 1).toUpperCase();
                const voterImg = !v.anonymous ? normalizeProfileImageUrl(v.user?.profileImageUrl) : null;
                return (
                  <Pressable
                    key={v.voteId}
                    style={st.voterRow}
                    onPress={() => {
                      if (!v.anonymous && v.user) {
                        onClose();
                        router.push(`/profile/${v.user.id}` as `/${string}`);
                      }
                    }}
                  >
                    <View style={st.voterAvatar}>
                      {voterImg
                        ? <Image source={{ uri: voterImg }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                        : <Text style={st.voterAvatarText}>{initial}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.voterName}>{name}</Text>
                      <Text style={st.voterTime}>{formatRelativeTime(v.createdAt)}</Text>
                    </View>
                    {optionLabels[v.selectedOptionIndex] ? (
                      <Text style={[st.voterTime, { fontSize: 11 }]}>
                        {optionLabels[v.selectedOptionIndex]}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Extend voting modal ──────────────────────────────────────────────────────

type ExtendSheetProps = {
  visible: boolean;
  onClose: () => void;
  onExtend: (ms: number) => void;
  extending: boolean;
  st: ReturnType<typeof makeStyles>;
  insets: { bottom: number };
};

function ExtendSheet({ visible, onClose, onExtend, extending, st, insets }: ExtendSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.extendModal}>
        <View style={[st.extendSheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={st.extendTitle}>Extend voting</Text>
          <View style={st.extendOptsRow}>
            {EXTEND_OPTS.map((o) => (
              <Pressable
                key={o.label}
                style={st.extendOpt}
                onPress={() => onExtend(o.ms)}
                disabled={extending}
              >
                {extending ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <Text style={st.extendOptText}>{o.label}</Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable style={st.extendCancel} onPress={onClose}>
            <Text style={st.extendCancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Inline post card — no subscription, avoids dual-screen native view conflict ─

type PostDetailCardProps = {
  post: ReturnType<typeof mapGqlPostToFeedView>;
  st: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  onVoters: () => void;
};

function PostDetailCard({ post, st, colors, onVoters }: PostDetailCardProps) {
  const { isAuthenticated } = useAuth();
  const [voteMut] = useMutation(VOTE_POST);
  const [hypeMut] = useMutation(SET_POST_HYPE);
  const [keepMut] = useMutation(SET_POST_KEEP);
  const [viewerVote, setViewerVote] = useState(post.viewerVote);
  const [up, setUp] = useState(post.upvoteCount);
  const [down, setDown] = useState(post.downvoteCount);
  const [anonymous, setAnonymous] = useState(Boolean(post.myVoteAnonymous));
  const [hyped, setHyped] = useState(Boolean(post.viewerHasHyped));
  const [hypeCount, setHypeCount] = useState(post.hypeCount ?? 0);
  const [kept, setKept] = useState(Boolean(post.viewerHasSaved));

  const total = up + down;
  const leftPct = total > 0 ? Math.round((100 * up) / total) : 50;
  const rightPct = 100 - leftPct;
  const isVotingClosed = post.isVotingOpen === false;

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    if (!post.votingEndsAt || isVotingClosed) return;
    function calc() {
      const diff = new Date(post.votingEndsAt!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Voting ended"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m ${s}s left`);
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [post.votingEndsAt, isVotingClosed]);

  function labelFor(i: number) {
    return post.optionStats?.find((s) => s.index === i)?.label?.trim()
      || post.postOptions?.[i]?.label?.trim()
      || `Side ${i + 1}`;
  }

  async function castVote(idx: number) {
    if (isVotingClosed) return;
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    const prev = viewerVote;
    const newVote = idx === 0 ? "UP" : "DOWN";
    if (prev === newVote) return;
    setViewerVote(newVote as "UP" | "DOWN");
    setUp((n) => n + (idx === 0 ? 1 : 0) - (prev === "UP" ? 1 : 0));
    setDown((n) => n + (idx === 1 ? 1 : 0) - (prev === "DOWN" ? 1 : 0));
    try {
      await voteMut({ variables: { postId: post.id, selectedOptionIndex: idx, anonymous } });
    } catch {
      setViewerVote(prev);
      setUp(post.upvoteCount);
      setDown(post.downvoteCount);
    }
  }

  async function handleAnonymousToggle(val: boolean) {
    setAnonymous(val);
    const curIdx = viewerVote === "UP" ? 0 : viewerVote === "DOWN" ? 1 : null;
    if (hasVoted && curIdx !== null) {
      try { await voteMut({ variables: { postId: post.id, selectedOptionIndex: curIdx, anonymous: val } }); }
      catch { setAnonymous(!val); }
    }
  }

  async function handleHype() {
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    const next = !hyped;
    setHyped(next);
    setHypeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try { await hypeMut({ variables: { postId: post.id, active: next } }); }
    catch { setHyped(!next); setHypeCount((n) => Math.max(0, n + (next ? -1 : 1))); }
  }

  async function handleKeep() {
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    const next = !kept;
    setKept(next);
    try { await keepMut({ variables: { postId: post.id, keep: next } }); }
    catch { setKept(!next); }
  }

  async function handleShare() {
    try {
      await Share.share({ url: postPermalink(post.id), message: post.caption ?? "Check out this comparison!" });
    } catch { /* ignore */ }
  }

  const authorName = post.authorDisplayName?.trim() || post.authorUsername;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorAvatarUrl = post.authorProfileImageUrl ?? null;
  const compareUrls = post.imageUrls.length >= 2 ? post.imageUrls.slice(0, 2) : null;
  const hasVoted = viewerVote !== null;

  return (
    <View style={st.postCard}>
      <Pressable
        style={st.postHeader}
        onPress={() => post.authorId && router.push(`/profile/${post.authorId}` as `/${string}`)}
      >
        <View style={[st.postAvatar, { overflow: "hidden" }]}>
          {authorAvatarUrl
            ? <Image source={{ uri: authorAvatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={st.postAvatarText}>{initial}</Text>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.postAuthor}>{authorName}</Text>
          <Text style={st.postTime}>{formatRelativeTime(post.createdAt)}</Text>
        </View>
      </Pressable>

      {post.caption ? <Text style={st.postCaption}>{post.caption}</Text> : null}

      {compareUrls ? (
        <View style={st.postImages}>
          {compareUrls.map((url, i) => {
            const picked = (i === 0 && viewerVote === "UP") || (i === 1 && viewerVote === "DOWN");
            return (
              <Pressable
                key={i}
                style={[st.postImgCell, isVotingClosed && { opacity: 0.85 }]}
                onPress={() => void castVote(i)}
                disabled={isVotingClosed}
              >
                <Image source={{ uri: url }} style={st.postImg} contentFit="cover" cachePolicy="memory-disk" />
                <View style={st.postPctOverlay}>
                  <Text style={st.postPctText}>{i === 0 ? leftPct : rightPct}%</Text>
                  <Text style={st.postPctLabel} numberOfLines={1}>{labelFor(i)}</Text>
                </View>
                {picked && !isVotingClosed && (
                  <View style={st.postVotedBadge}>
                    <View style={st.postVotedBadgeInner}>
                      <Text style={st.postVotedBadgeText}>♥ VOTED</Text>
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : post.imageUrls[0] ? (
        <Image source={{ uri: post.imageUrls[0] }} style={{ width: "100%", height: 280 }} contentFit="cover" cachePolicy="memory-disk" />
      ) : null}

      {compareUrls ? (
        <View style={st.postSplitBar}>
          <View style={{ flex: up || 1, backgroundColor: "#22c55e" }} />
          <View style={{ flex: down || 1, backgroundColor: "#f97316" }} />
        </View>
      ) : null}

      {/* Vote hint */}
      {compareUrls && !isVotingClosed && (
        <View style={st.postVoteHint}>
          <Text style={[st.postVoteHintText, hasVoted && st.postVoteHintVoted]}>
            {hasVoted ? "✓ Vote recorded — tap to change" : "👆 Tap an image to vote"}
          </Text>
          {timeLeft ? (
            <Text style={[st.postVoteHintText, { marginTop: 4, color: "#f59e0b", fontWeight: "700" }]}>
              ⏱ {timeLeft}
            </Text>
          ) : null}
        </View>
      )}

      {/* Anonymous toggle — same Switch as feed card */}
      {compareUrls && !isVotingClosed && (
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 14, paddingVertical: 8, gap: 8,
          backgroundColor: colors.section,
        }}>
          <Text style={{ fontSize: 13 }}>👻</Text>
          <Text style={{ flex: 1, fontSize: 12, color: colors.subtext, fontWeight: "500" }}>
            Vote anonymously
          </Text>
          <Switch
            value={anonymous}
            onValueChange={(val) => void handleAnonymousToggle(val)}
            trackColor={{ false: colors.border, true: "#8b5cf6" }}
            thumbColor="#ffffff"
          />
        </View>
      )}

      {isVotingClosed && (
        <View style={st.postVoteHint}>
          <Text style={st.postVoteHintText}>{total} votes · Voting closed</Text>
        </View>
      )}

      {/* LIVE SPLIT section */}
      {compareUrls && (
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.accent, letterSpacing: 1 }}>LIVE SPLIT</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{total} vote{total !== 1 ? "s" : ""}</Text>
          </View>
          {[0, 1].map((i) => {
            const count = i === 0 ? up : down;
            const pct = total > 0 ? Math.round((100 * count) / total) : 50;
            const barColor = i === 0 ? "#22c55e" : "#f97316";
            return (
              <View key={i} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, flex: 1 }} numberOfLines={1}>
                    {labelFor(i)}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.subtext, marginLeft: 8 }}>{count} · {pct}%</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.section }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: barColor, width: `${pct}%` }} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Action chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ borderTopWidth: 1, borderTopColor: colors.border }}
        contentContainerStyle={st.actionsContent}
      >
        {([
          { i: 0, label: "DISCUSS", icon: "💬", onPress: () => {} },
          { i: 1, label: "SHARE", icon: "↗", onPress: () => void handleShare() },
          {
            i: 2,
            label: `HYPE${hypeCount > 0 ? " " + String(hypeCount) : ""}`,
            icon: hyped ? "♥" : "♡",
            onPress: () => void handleHype(),
            active: hyped,
            activeStyle: st.actionChipHypeActive,
            activeTextColor: "#fb7185",
          },
          {
            i: 3,
            label: "KEEP",
            icon: "🔖",
            onPress: () => void handleKeep(),
            active: kept,
            activeStyle: st.actionChipSaveActive,
            activeTextColor: "#f59e0b",
          },
          { i: 4, label: "VOTERS", icon: "👥", onPress: onVoters },
        ] as Array<{ i: number; label: string; icon: string; onPress: () => void; active?: boolean; activeStyle?: object; activeTextColor?: string }>)
          .map(({ i, label, icon, onPress, active, activeStyle, activeTextColor }) => (
            <Pressable
              key={i}
              style={[st.actionChip, active && activeStyle]}
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
          ))}
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  // ALL hooks must come before any conditional returns (Rules of Hooks)
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, isAuthenticated, hydrated } = useAuth();
  const st = useMemo(() => makeStyles(colors), [colors]);

  const { data: postData, loading: postLoading, error: postError } = useQuery<PostData>(
    GET_POST_BY_ID,
    { variables: { id }, skip: !id || !isAuthenticated, fetchPolicy: "cache-first" },
  );
  const post = postData?.getPostById
    ? mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0])
    : null;
  const isOwner = !!user && !!post?.authorId && user.id === post.authorId;

  const {
    data: commentsData,
    loading: commentsLoading,
    refetch: refetchComments,
  } = useQuery<CommentsData>(COMMENTS_BY_POST, {
    variables: { postId: id },
    skip: !id || !isAuthenticated,
    fetchPolicy: "network-only",
  });
  const allComments = commentsData?.commentsByPost ?? [];
  const topComments = allComments.filter((c) => !c.parentId);
  const repliesMap = useMemo(() => {
    const m = new Map<string, GqlComment[]>();
    allComments.filter((c) => c.parentId).forEach((c) => {
      const arr = m.get(c.parentId!) ?? [];
      arr.push(c);
      m.set(c.parentId!, arr);
    });
    return m;
  }, [allComments]);

  const [commentMut, { loading: commentSending }] = useMutation(COMMENT_POST);
  const [likeMut] = useMutation(SET_COMMENT_LIKE);
  const [deleteMut, { loading: deleting }] = useMutation(DELETE_POST);
  const [extendMut, { loading: extending }] = useMutation(EXTEND_POST_VOTING);

  const { showToast, ToastView } = useToast();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [votersVisible, setVotersVisible] = useState(false);
  const [extendVisible, setExtendVisible] = useState(false);

  const optionLabels = useMemo(() => {
    if (!post) return ["Option A", "Option B"];
    if (post.optionStats && post.optionStats.length > 0) {
      return post.optionStats.map((s) => s.label || `Option ${s.index + 1}`);
    }
    if (post.postOptions && post.postOptions.length > 0) {
      return post.postOptions.map((o, i) => o.label || `Option ${i + 1}`);
    }
    return ["Option A", "Option B"];
  }, [post]);

  const handleReply = useCallback((commentId: string, name: string) => {
    setReplyTo({ id: commentId, name });
    inputRef.current?.focus();
  }, []);

  const handleLike = useCallback(
    async (commentId: string, liked: boolean) => {
      try {
        await likeMut({ variables: { commentId, liked } });
      } catch {
        /* optimistic already applied */
      }
    },
    [likeMut],
  );

  // Redirect unauthenticated users — useEffect fires imperatively after mount
  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  // Show spinner until auth is known or while redirecting
  if (!hydrated || !isAuthenticated) {
    return (
      <View style={[st.flex, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  async function handleSend() {
    const content = text.trim();
    if (!content) return;
    if (!isAuthenticated) { router.push("/auth/login"); return; }
    try {
      await commentMut({
        variables: {
          postId: id,
          input: { content, parentId: replyTo?.id ?? undefined },
        },
      });
      setText("");
      setReplyTo(null);
      void refetchComments();
      showToast("Comment posted ✓", "success");
    } catch {
      showToast("Failed to post comment", "error");
    }
  }

  async function handleDelete() {
    Alert.alert("Delete post", "This cannot be undone. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMut({ variables: { postId: id } });
            router.replace("/tabs" as `/${string}`);
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not delete post");
          }
        },
      },
    ]);
  }

  async function handleExtend(addMs: number) {
    try {
      const base = post?.votingEndsAt ? new Date(post.votingEndsAt).getTime() : Date.now();
      const newEndsAt = new Date(base + addMs).toISOString();
      await extendMut({ variables: { postId: id, newVotingEndsAt: newEndsAt } });
      setExtendVisible(false);
      showToast("Voting extended ✓", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Could not extend voting", "error");
    }
  }

  return (
    <View style={st.flex}>
      <ToastView />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Post",
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={st.headerBack}>
              <Text style={st.headerBackText}>← Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
          {/* Post card */}
          {postLoading && !post ? (
            <View style={st.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : postError && !post ? (
            <View style={st.errorRow}>
              <Text style={st.errorText}>Could not load post.</Text>
            </View>
          ) : post ? (
            <PostDetailCard post={post} st={st} colors={colors} onVoters={() => setVotersVisible(true)} />
          ) : null}

          {/* Owner actions */}
          {isOwner && post ? (
            <View style={st.ownerActions}>
              {post.isVotingOpen ? (
                <Pressable
                  style={st.ownerBtn}
                  onPress={() => setExtendVisible(true)}
                >
                  <Text style={st.ownerBtnText}>⏱ Extend voting</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[st.ownerBtn, st.ownerBtnDelete]}
                onPress={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#f87171" />
                ) : (
                  <Text style={st.ownerBtnDeleteText}>🗑 Delete post</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {/* Comments */}
          <View style={st.sectionHeader}>
            <Text style={st.sectionTitle}>COMMENTS</Text>
            {allComments.length > 0 ? (
              <Text style={st.commentCount}>{allComments.length}</Text>
            ) : null}
          </View>

          {commentsLoading ? (
            <View style={st.loadingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : topComments.length === 0 ? (
            <View style={st.empty}>
              <Text style={st.emptyText}>No comments yet — be the first!</Text>
            </View>
          ) : (
            topComments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                replies={repliesMap.get(c.id) ?? []}
                colors={colors}
                st={st}
                onReply={handleReply}
                onLike={handleLike}
              />
            ))
          )}
        </ScrollView>

        {/* Comment input */}
        <View style={{ backgroundColor: colors.card }}>
          {replyTo ? (
            <View style={st.replyingBanner}>
              <Text style={st.replyingText}>Replying to {replyTo.name}</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={st.replyingCancel}>✕ Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[st.inputWrap, { paddingBottom: insets.bottom + 10 }]}>
            <TextInput
              ref={inputRef}
              style={st.inputBox}
              value={text}
              onChangeText={setText}
              placeholder={replyTo ? `Reply to ${replyTo.name}…` : "Write a comment…"}
              placeholderTextColor={colors.muted}
              multiline
              returnKeyType="default"
            />
            <Pressable
              style={[st.sendBtn, (!text.trim() || commentSending) && { opacity: 0.5 }]}
              onPress={() => void handleSend()}
              disabled={!text.trim() || commentSending}
            >
              {commentSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={st.sendBtnText}>↑</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Modals — outside KeyboardAvoidingView to avoid view-parent conflicts */}
      {post ? (
        <VotersSheet
          postId={id ?? ""}
          visible={votersVisible}
          onClose={() => setVotersVisible(false)}
          optionLabels={optionLabels}
          st={st}
          insets={insets}
        />
      ) : null}
      <ExtendSheet
        visible={extendVisible}
        onClose={() => setExtendVisible(false)}
        onExtend={(ms) => void handleExtend(ms)}
        extending={extending}
        st={st}
        insets={insets}
      />
    </View>
  );
}
