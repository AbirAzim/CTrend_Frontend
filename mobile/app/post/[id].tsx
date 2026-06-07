import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  COMMENTS_BY_POST,
  COMMENT_POST,
  SET_COMMENT_LIKE,
  SET_COMMENT_REACTION,
} from "@ctrend/shared/graphql/comments";
import { GET_POST_BY_ID } from "@ctrend/shared/graphql/feed";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useBackToFeed } from "../../hooks/useBackToFeed";
import { useTheme } from "../../context/ThemeContext";
import type { ColorPalette } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";
import { postWebUrl } from "../../lib/postPermalink";
import * as Clipboard from "expo-clipboard";
import { FeedPostCard } from "../../components/FeedPostCard";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const IMG_W = (SCREEN_W - 2) / 2;
// Full-width compare cells, capped at 58% of screen height (single-post only)
const IMG_H = Math.min(IMG_W * 1.55, Math.round(SCREEN_H * 0.58));

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

type CommentsData = { commentsByPost: GqlComment[] };
type PostData = { getPostById: unknown };

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1, backgroundColor: c.bg },
    headerBack: { paddingHorizontal: 4 },
    headerBackText: { fontSize: 16, color: c.accent, fontWeight: "700" },
    headerCopy: { paddingHorizontal: 8, paddingVertical: 4 },
    headerCopyText: { fontSize: 14, color: c.accent, fontWeight: "700" },

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

    // ── Facebook-style comment input ──
    inputWrap: {
      borderTopWidth: 1, borderTopColor: c.border,
      backgroundColor: c.card,
      flexDirection: "row" as const, alignItems: "flex-end" as const,
      paddingHorizontal: 10, paddingTop: 8, gap: 8,
    },
    inputAvatar: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: isDark ? "#312e81" : "#6366f1",
      alignItems: "center" as const, justifyContent: "center" as const,
      overflow: "hidden" as const,
      marginBottom: 8,
    },
    inputAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" as const },
    inputPill: {
      flex: 1,
      flexDirection: "row" as const, alignItems: "flex-end" as const,
      backgroundColor: c.section,
      borderRadius: 22, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 0,
      minHeight: 38,
    },
    inputBox: {
      flex: 1,
      fontSize: 14, color: c.text,
      maxHeight: 120,
      paddingTop: 9, paddingBottom: 9,
    },
    postBtn: {
      paddingVertical: 9, paddingHorizontal: 6,
      alignSelf: "flex-end" as const,
    },
    postBtnText: { fontSize: 14, fontWeight: "800" as const, color: c.accent },
    replyingBanner: {
      paddingHorizontal: 14, paddingVertical: 6,
      backgroundColor: isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)",
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
      borderTopWidth: 1, borderTopColor: isDark ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.15)",
    },
    replyingText: { fontSize: 12, color: isDark ? "#818cf8" : "#4338ca", fontWeight: "500" as const },
    replyingCancel: { fontSize: 12, color: c.muted, fontWeight: "700" as const },
    // legacy (keep for reference)
    sendBtn: { width: 0, height: 0 },
    sendBtnText: { fontSize: 0 },
    // "View older comments" button at top of list
    viewOlderBtn: {
      paddingVertical: 10, paddingHorizontal: 14,
      alignItems: "center" as const,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    viewOlderText: { fontSize: 13, fontWeight: "700" as const, color: c.accent },

    // ── Voters floating panel (non-blocking) ──
    votersPanel: {
      position: "absolute" as const,
      left: 12, right: 12,
      maxHeight: Math.round(Dimensions.get("window").height * 0.72),
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1, borderColor: isDark ? "rgba(148,163,184,0.24)" : "rgba(67,56,202,0.14)",
      overflow: "hidden" as const,
      // shadow
      elevation: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 20,
      zIndex: 49,
    },
    votersPanelHeader: {
      flexDirection: "row" as const, alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    votersPanelTitle: { fontSize: 15, fontWeight: "800" as const, color: c.text },
    votersPanelClose: { padding: 4 },
    votersPanelCloseText: { fontSize: 16, color: c.muted, fontWeight: "700" as const },
    votersPanelSearch: {
      flexDirection: "row" as const, alignItems: "center" as const,
      gap: 8, paddingHorizontal: 12, paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    votersPanelSearchInput: {
      flex: 1, fontSize: 14, color: c.text,
      backgroundColor: c.section, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    votersTabRow: { flexDirection: "row" as const, gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
    votersTab: {
      paddingHorizontal: 14, paddingVertical: 5,
      borderRadius: 999, borderWidth: 1, borderColor: c.border,
    },
    votersTabActive: { backgroundColor: c.accent, borderColor: c.accent },
    votersTabText: { fontSize: 12, fontWeight: "700" as const, color: c.subtext },
    votersTabTextActive: { color: "#fff" },
    voterRow: {
      flexDirection: "row" as const, alignItems: "center" as const,
      paddingHorizontal: 14, paddingVertical: 10, gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    voterAvatar: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: "#312e81",
      alignItems: "center" as const, justifyContent: "center" as const, overflow: "hidden" as const,
    },
    voterAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" as const },
    voterName: { fontSize: 14, fontWeight: "700" as const, color: c.text },
    voterTime: { fontSize: 12, color: c.muted },
    voterOptionTag: {
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999, borderWidth: 1,
    },
    voterOptionTagText: { fontSize: 10, fontWeight: "700" as const },
    voterEmpty: { textAlign: "center" as const, paddingVertical: 24, color: c.muted, fontSize: 14 },

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
    commentRowHighlighted: {
      backgroundColor: isDark ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.08)",
      borderLeftWidth: 3, borderLeftColor: isDark ? "#6366f1" : "#818cf8",
    },
    showMoreBtn: {
      paddingVertical: 12, paddingHorizontal: 16,
      alignItems: "center" as const,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border,
    },
    showMoreText: { fontSize: 13, fontWeight: "700" as const, color: c.accent },

    // ── Emoji reaction picker (Facebook-style floating modal) ──
    reactionPickerOverlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center" as const, alignItems: "center" as const,
    },
    reactionPickerPill: {
      flexDirection: "row" as const, gap: 4,
      backgroundColor: c.card,
      borderRadius: 999,
      paddingVertical: 10, paddingHorizontal: 12,
      borderWidth: 1, borderColor: c.border,
      elevation: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28, shadowRadius: 20,
    },
    reactionPickerBtn: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: "center" as const, justifyContent: "center" as const,
    },
    reactionPickerBtnActive: {
      backgroundColor: isDark ? "rgba(99,102,241,0.22)" : "rgba(99,102,241,0.12)",
      transform: [{ scale: 1.18 }] as unknown as never,
    },
    reactionPickerEmoji: { fontSize: 28, lineHeight: 34 },
    // Compact reaction pills (only shown when count > 0)
    reactionPillsRow: {
      flexDirection: "row" as const, flexWrap: "wrap" as const,
      gap: 5, marginTop: 6, marginLeft: 36,
    },
    reactionPill: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 3,
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999, borderWidth: 1,
      backgroundColor: c.section, borderColor: c.border,
    },
    reactionPillActive: {
      backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)",
      borderColor: isDark ? "#6366f1" : "#818cf8",
    },
    reactionTotal: {
      alignSelf: "center" as const,
      fontSize: 11,
      fontWeight: "600" as const,
      color: c.muted,
      marginLeft: 2,
    },
    reactionPillEmoji: { fontSize: 13 },
    reactionPillCount: { fontSize: 11, fontWeight: "700" as const, color: c.subtext },
    reactionPillCountActive: { color: isDark ? "#818cf8" : "#4338ca" },
    // React chip button — labeled pill (replaces invisible 😊)
    reactChip: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 4,
      borderWidth: 1, borderColor: c.border,
      borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
      backgroundColor: c.section,
    },
    reactChipActive: {
      borderColor: isDark ? "#6366f1" : "#818cf8",
      backgroundColor: isDark ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.08)",
    },
    reactChipEmoji: { fontSize: 13, lineHeight: 18 },
    reactChipLabel: { fontSize: 11, fontWeight: "600" as const, color: c.subtext, lineHeight: 16 },
    reactChipLabelActive: { color: isDark ? "#818cf8" : "#4338ca" },
    // legacy (unused, kept so existing references compile)
    reactBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 2 },
    reactBtnText: { fontSize: 13, color: c.subtext },
    reactBtnActive: { fontSize: 13, color: isDark ? "#818cf8" : "#4338ca", fontWeight: "700" as const },

    loadingRow: { paddingVertical: 24, alignItems: "center" },
    errorRow: { paddingHorizontal: 14, paddingVertical: 12 },
    errorText: { fontSize: 14, color: "#f87171" },

    // ── Two-zone action rail (post detail) ──
    actionRail: {
      marginHorizontal: 12, marginBottom: 8, borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(148,163,184,0.24)" : "rgba(67,56,202,0.14)",
      backgroundColor: isDark ? "rgba(15,23,42,0.64)" : "rgba(255,255,255,0.72)",
      overflow: "hidden" as const,
    },
    actionRailIcons: {
      flexDirection: "row" as const, justifyContent: "space-evenly" as const,
      alignItems: "center" as const, flexWrap: "wrap" as const,
      paddingVertical: 7, paddingHorizontal: 8, gap: 2,
    },
    actionChipFlat: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 3,
      borderRadius: 999, paddingVertical: 8, paddingHorizontal: 10,
    },
    actionChipFlatHypeActive: { backgroundColor: isDark ? "rgba(251,113,133,0.14)" : "rgba(159,23,77,0.1)" },
    actionChipFlatSaveActive: { backgroundColor: isDark ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.1)" },
    actionChipFlatIcon: { fontSize: 19, lineHeight: 22, color: c.subtext },
    actionChipFlatIconHype: { color: "#fb7185" },
    actionChipFlatIconSave: { color: "#f59e0b" },
    actionChipBadge: {
      minWidth: 18, height: 17, paddingHorizontal: 5, marginLeft: -1,
      borderRadius: 999, justifyContent: "center" as const, alignItems: "center" as const,
      backgroundColor: isDark ? "rgba(129,140,248,0.2)" : "rgba(67,56,202,0.14)",
    },
    actionChipBadgeRose: { backgroundColor: isDark ? "rgba(251,113,133,0.22)" : "rgba(159,23,77,0.16)" },
    actionChipBadgeAmber: { backgroundColor: isDark ? "rgba(245,158,11,0.22)" : "rgba(245,158,11,0.18)" },
    actionChipBadgeText: {
      fontSize: 10, fontWeight: "800" as const,
      color: isDark ? "#c7d0ff" : "#312e81",
      fontVariant: ["tabular-nums"] as const, lineHeight: 14,
    },
    actionChipBadgeTextRose: { color: isDark ? "#fda4af" : "#be123c" },
    actionChipBadgeTextAmber: { color: isDark ? "#fcd34d" : "#b45309" },
    actionRailContext: {
      flexDirection: "row" as const, alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 10, paddingVertical: 8, paddingHorizontal: 14,
      borderTopWidth: 1 as const,
      borderTopColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(67,56,202,0.12)",
      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(21,20,27,0.025)",
    },
    actionStatusText: {
      flex: 1, fontSize: 12, fontWeight: "700" as const,
      color: isDark ? "#818cf8" : "#312e81",
    },
    actionStatusTextResult: { color: isDark ? "#fcd34d" : "#b45309" },
    seeDetailsBtn2: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, flexShrink: 0 },
    seeDetailsBtnText2: { fontSize: 12, fontWeight: "800" as const, color: isDark ? "#818cf8" : "#312e81" },

    // Inline post card
    postCard: { backgroundColor: c.card, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    postCardPlatform: { borderWidth: 1.5, borderColor: c.accentLight, backgroundColor: c.accent + "14" },
    postHeader: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    postAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#312e81", alignItems: "center" as const, justifyContent: "center" as const },
    postAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" as const },
    postAuthorRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 7 },
    postAuthor: { fontSize: 14, fontWeight: "700" as const, color: c.text },
    platformBadge: {
      fontSize: 9, fontWeight: "700" as const, letterSpacing: 0.6,
      textTransform: "uppercase" as const, color: c.accent,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
      borderWidth: 1, borderColor: c.accentLight, overflow: "hidden" as const,
    },
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

// ─── Emoji picker modal (Facebook-style) ─────────────────────────────────────

type EmojiPickerProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  currentReaction: string | null;
  st: ReturnType<typeof makeStyles>;
};

function EmojiPickerModal({ visible, onClose, onSelect, currentReaction, st }: EmojiPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.reactionPickerOverlay} onPress={onClose}>
        <Pressable style={st.reactionPickerPill}>
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              style={[st.reactionPickerBtn, currentReaction === emoji && st.reactionPickerBtnActive]}
              onPress={() => { onSelect(emoji); onClose(); }}
              hitSlop={4}
            >
              <Text style={st.reactionPickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Shared reaction logic ────────────────────────────────────────────────────

function useReactions(initialReaction: string | null, initialCounts: Array<{ emoji: string; count: number }>, commentId: string) {
  const [localReaction, setLocalReaction] = useState<string | null>(initialReaction);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    Object.fromEntries(initialCounts.map((r) => [r.emoji, r.count])),
  );
  const [reactMut] = useMutation(SET_COMMENT_REACTION);

  async function handleReact(emoji: string) {
    const prev = localReaction;
    const next = prev === emoji ? null : emoji;
    setLocalReaction(next);
    setReactionCounts((c) => {
      const u = { ...c };
      if (prev) u[prev] = Math.max(0, (u[prev] ?? 1) - 1);
      if (next) u[next] = (u[next] ?? 0) + 1;
      return u;
    });
    try {
      await reactMut({ variables: { commentId, emoji: next } });
    } catch {
      setLocalReaction(prev);
      setReactionCounts(Object.fromEntries(initialCounts.map((r) => [r.emoji, r.count])));
    }
  }

  const activeReactions = REACTION_EMOJIS.filter((e) => (reactionCounts[e] ?? 0) > 0);
  const totalReactions = activeReactions.reduce((sum, e) => sum + (reactionCounts[e] ?? 0), 0);
  return { localReaction, reactionCounts, activeReactions, totalReactions, handleReact };
}

// ─── Comment component ────────────────────────────────────────────────────────

type CommentItemProps = {
  comment: GqlComment;
  replies: GqlComment[];
  colors: ColorPalette;
  st: ReturnType<typeof makeStyles>;
  onReply: (id: string, name: string) => void;
  onLike: (id: string, liked: boolean) => void;
  forceExpanded?: boolean;
  highlightedCommentId?: string | null;
};

function CommentItem({ comment, replies, st, onReply, onLike, forceExpanded, highlightedCommentId }: CommentItemProps) {
  const isHighlighted = highlightedCommentId === comment.id;
  const [localLiked, setLocalLiked] = useState(comment.viewerHasLiked);
  const [localCount, setLocalCount] = useState(comment.likeCount);
  const [showReplies, setShowReplies] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const { localReaction, reactionCounts, activeReactions, totalReactions, handleReact } = useReactions(
    comment.viewerReaction ?? null,
    comment.reactions ?? [],
    comment.id,
  );

  // Auto-expand replies when a reply was just posted to this comment
  useEffect(() => {
    if (forceExpanded) setShowReplies(true);
  }, [forceExpanded]);

  const authorName = comment.author.displayName?.trim() || comment.author.username;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorImg = normalizeProfileImageUrl(comment.author.profileImageUrl);

  function handleLike() {
    const next = !localLiked;
    setLocalLiked(next);
    setLocalCount((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike(comment.id, next);
  }

  return (
    <>
      <View style={[st.commentRow, isHighlighted && st.commentRowHighlighted]}>
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
          {/* Like — tap to toggle, long-press to open reaction picker */}
          <Pressable
            style={st.commentActionBtn}
            onPress={handleLike}
            onLongPress={() => setShowPicker(true)}
            delayLongPress={400}
            hitSlop={8}
          >
            <Text style={[st.commentActionText, localLiked && st.commentActionLiked]}>
              {localLiked ? "♥" : "♡"}{localCount > 0 ? ` ${localCount}` : ""}
            </Text>
          </Pressable>

          {/* React chip — tap = quick toggle default reaction, long-press = emoji tray */}
          <Pressable
            style={[st.reactChip, localReaction ? st.reactChipActive : null]}
            onPress={() => void handleReact(localReaction ?? REACTION_EMOJIS[0])}
            onLongPress={() => setShowPicker(true)}
            delayLongPress={300}
            hitSlop={6}
          >
            <Text style={st.reactChipEmoji}>{localReaction ?? "❤️"}</Text>
            <Text style={[st.reactChipLabel, localReaction ? st.reactChipLabelActive : null]}>
              {localReaction ? "Reacted" : "React"}
            </Text>
          </Pressable>

          <Pressable style={st.replyBtn} onPress={() => onReply(comment.id, authorName)} hitSlop={8}>
            <Text style={st.replyBtnText}>↩ Reply</Text>
          </Pressable>

          {replies.length > 0 && (
            <Pressable onPress={() => setShowReplies((v) => !v)} hitSlop={8}>
              <Text style={st.replyBtnText}>
                {showReplies ? "Hide replies" : `${replies.length} repl${replies.length === 1 ? "y" : "ies"} ▸`}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Compact reaction summary — top emojis + total count */}
        {activeReactions.length > 0 && (
          <View style={st.reactionPillsRow}>
            {activeReactions.map((emoji) => (
              <Pressable key={emoji} onPress={() => void handleReact(emoji)} hitSlop={4}>
                <View style={[st.reactionPill, localReaction === emoji && st.reactionPillActive]}>
                  <Text style={st.reactionPillEmoji}>{emoji}</Text>
                  <Text style={[st.reactionPillCount, localReaction === emoji && st.reactionPillCountActive]}>
                    {reactionCounts[emoji]}
                  </Text>
                </View>
              </Pressable>
            ))}
            {totalReactions > 1 && (
              <Text style={st.reactionTotal}>{totalReactions} reactions</Text>
            )}
          </View>
        )}
      </View>

      {/* Replies — shown when expanded */}
      {showReplies && replies.map((r) => (
        <ReplyItem key={r.id} reply={r} st={st} onLike={onLike} />
      ))}

      {/* Emoji picker modal */}
      <EmojiPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(emoji) => void handleReact(emoji)}
        currentReaction={localReaction}
        st={st}
      />
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
  const [showPicker, setShowPicker] = useState(false);
  const { localReaction, reactionCounts, activeReactions, totalReactions, handleReact } = useReactions(
    reply.viewerReaction ?? null,
    reply.reactions ?? [],
    reply.id,
  );

  const authorName = reply.author.displayName?.trim() || reply.author.username;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorImg = normalizeProfileImageUrl(reply.author.profileImageUrl);

  function handleLike() {
    const next = !localLiked;
    setLocalLiked(next);
    setLocalCount((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike(reply.id, next);
  }

  return (
    <>
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
          <Pressable
            style={st.commentActionBtn}
            onPress={handleLike}
            onLongPress={() => setShowPicker(true)}
            delayLongPress={400}
            hitSlop={8}
          >
            <Text style={[st.commentActionText, localLiked && st.commentActionLiked]}>
              {localLiked ? "♥" : "♡"}{localCount > 0 ? ` ${localCount}` : ""}
            </Text>
          </Pressable>
          <Pressable
            style={[st.reactChip, localReaction ? st.reactChipActive : null]}
            onPress={() => void handleReact(localReaction ?? REACTION_EMOJIS[0])}
            onLongPress={() => setShowPicker(true)}
            delayLongPress={300}
            hitSlop={6}
          >
            <Text style={st.reactChipEmoji}>{localReaction ?? "❤️"}</Text>
            <Text style={[st.reactChipLabel, localReaction ? st.reactChipLabelActive : null]}>
              {localReaction ? "Reacted" : "React"}
            </Text>
          </Pressable>
        </View>

        {activeReactions.length > 0 && (
          <View style={[st.reactionPillsRow, { marginLeft: 32 }]}>
            {activeReactions.map((emoji) => (
              <Pressable key={emoji} onPress={() => void handleReact(emoji)} hitSlop={4}>
                <View style={[st.reactionPill, localReaction === emoji && st.reactionPillActive]}>
                  <Text style={st.reactionPillEmoji}>{emoji}</Text>
                  <Text style={[st.reactionPillCount, localReaction === emoji && st.reactionPillCountActive]}>
                    {reactionCounts[emoji]}
                  </Text>
                </View>
              </Pressable>
            ))}
            {totalReactions > 1 && (
              <Text style={st.reactionTotal}>{totalReactions} reactions</Text>
            )}
          </View>
        )}
      </View>

      <EmojiPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(emoji) => void handleReact(emoji)}
        currentReaction={localReaction}
        st={st}
      />

    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  // ALL hooks must come before any conditional returns (Rules of Hooks)
  const { id, commentId: deepLinkCommentId } = useLocalSearchParams<{ id: string; commentId?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { user, isAuthenticated, hydrated } = useAuth();
  const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const { data: postData, loading: postLoading, error: postError } = useQuery<PostData>(
    GET_POST_BY_ID,
    { variables: { id }, skip: !id || !isAuthenticated, fetchPolicy: "cache-first" },
  );
  const post = postData?.getPostById
    ? mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0])
    : null;

  const {
    data: commentsData,
    loading: commentsLoading,
    refetch: refetchComments,
  } = useQuery<CommentsData>(COMMENTS_BY_POST, {
    variables: { postId: id },
    skip: !id || !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const allComments = commentsData?.commentsByPost ?? [];

  // Newest-first for top-level comments (matches the web version).
  const topComments = useMemo(
    () => allComments
      .filter((c) => !c.parentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allComments],
  );
  const repliesMap = useMemo(() => {
    const m = new Map<string, GqlComment[]>();
    allComments.filter((c) => c.parentId).forEach((c) => {
      const arr = m.get(c.parentId!) ?? [];
      arr.push(c);
      m.set(c.parentId!, arr);
    });
    // Replies oldest-first within each thread
    m.forEach((arr) => arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    return m;
  }, [allComments]);

  const [commentMut, { loading: commentSending }] = useMutation(COMMENT_POST);
  const [likeMut] = useMutation(SET_COMMENT_LIKE);

  const { showToast, ToastView } = useToast();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<typeof ScrollView>(null);
  const [optimisticComments, setOptimisticComments] = useState<GqlComment[]>([]);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(deepLinkCommentId ?? null);

  // Track Y positions for scroll-to-comment
  const commentsSectionY = useRef(0);
  const commentLocalYs = useRef<Record<string, number>>({});

  // When arriving from a comment deep-link: expand all, scroll to exact comment
  useEffect(() => {
    if (!deepLinkCommentId) return;
    setShowAllComments(true);
    const scrollTimer = setTimeout(() => {
      const sectionY = commentsSectionY.current;
      const localY = commentLocalYs.current[deepLinkCommentId] ?? 0;
      const targetY = Math.max(0, sectionY + localY - 100);
      (scrollRef.current as unknown as { scrollTo: (opts: { y: number; animated: boolean }) => void })
        ?.scrollTo({ y: targetY, animated: true });
    }, 550);
    const highlightTimer = setTimeout(() => setHighlightedCommentId(null), 4000);
    return () => { clearTimeout(scrollTimer); clearTimeout(highlightTimer); };
  }, [deepLinkCommentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the comments section — used by the post card's Comments chip
  const scrollToComments = useCallback(() => {
    setCommentsCollapsed(false);
    const y = Math.max(0, commentsSectionY.current - 60);
    (scrollRef.current as unknown as { scrollTo: (opts: { y: number; animated: boolean }) => void })
      ?.scrollTo({ y, animated: true });
  }, []);

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

  // Back falls through to the feed when opened cold from a notification.
  const goBack = useBackToFeed();

  // Show spinner until auth is known or while redirecting
  if (!hydrated || !isAuthenticated) {
    return (
      <View style={[st.flex, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  async function submitComment() {
    const content = text.trim();
    if (!content || commentSending) return;
    if (!isAuthenticated) { router.push("/auth/login"); return; }

    const parentId = replyTo?.id ?? null;
    const currentReplyTo = replyTo;

    // Optimistic: add comment immediately with timestamp "now"
    const optimistic: GqlComment = {
      id: `optimistic-${Date.now()}`,
      content,
      postId: id ?? "",
      parentId,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      viewerHasLiked: false,
      reactions: [],
      viewerReaction: null,
      author: {
        id: user?.id ?? "",
        username: user?.username ?? "",
        displayName: user?.displayName ?? null,
        profileImageUrl: user?.profileImageUrl ?? null,
      },
    };
    setOptimisticComments((prev) => [optimistic, ...prev]);
    setText("");
    setReplyTo(null);

    // If replying to a comment, auto-expand its replies immediately
    if (currentReplyTo) {
      setExpandedIds((prev) => new Set([...prev, currentReplyTo.id]));
    }

    // Scroll to show the new comment (slight delay so optimistic renders first).
    // Top-level comments are newest-first → they appear at the top of the list, so
    // scroll up to the comments section; replies are appended within their thread.
    setTimeout(() => {
      if (currentReplyTo) {
        (scrollRef.current as unknown as { scrollToEnd: (opts: { animated: boolean }) => void })
          ?.scrollToEnd({ animated: true });
      } else {
        scrollToComments();
      }
    }, 80);

    try {
      await commentMut({
        variables: { postId: id, input: { content, parentId: parentId ?? undefined } },
      });
      void refetchComments().then(() => {
        setOptimisticComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      });
      showToast("Comment posted ✓", "success");
    } catch {
      setOptimisticComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      if (currentReplyTo) {
        setExpandedIds((prev) => { const s = new Set(prev); s.delete(currentReplyTo.id); return s; });
      }
      showToast("Failed to post comment", "error");
    }
  }

  async function copyLink() {
    if (!id) return;
    try {
      await Clipboard.setStringAsync(postWebUrl(id));
      showToast("Copied ✓", "success");
    } catch { /* ignore */ }
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
            <TouchableOpacity onPress={goBack} style={st.headerBack}>
              <Text style={st.headerBackText}>← Back</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={() => void copyLink()} style={st.headerCopy} accessibilityLabel="Copy link">
              <Text style={st.headerCopyText}>🔗 Copy link</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView ref={scrollRef as never} style={st.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
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
            <FeedPostCard post={post} variant="detail" onCommentsPress={scrollToComments} />
          ) : null}

          {/* Owner-only edit shortcut — visible right on the full view. */}
          {post && user && post.authorId === user.id ? (
            <View style={st.ownerActions}>
              <TouchableOpacity
                style={st.ownerBtn}
                onPress={() => router.push({ pathname: "/tabs/create", params: { editId: post.id } })}
                accessibilityLabel="Edit this post"
              >
                <Text style={st.ownerBtnText}>✏️ Edit post</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Comments — onLayout tracks section Y for deep-link scrolling */}
          {(() => {
            const PREVIEW = 5;
            // Merge server (oldest-first) + optimistic at end; deduplicate by id
            const seen = new Set<string>();
            const merged = [...topComments, ...optimisticComments.filter((c) => !c.parentId)]
              .filter((c) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
            const totalCount = merged.length;
            // Show last PREVIEW (most recent); "View older" reveals the rest at top
            const hiddenCount = Math.max(0, totalCount - PREVIEW);
            const visible = showAllComments ? merged : merged.slice(hiddenCount);

            return (
              <View onLayout={(e) => { commentsSectionY.current = e.nativeEvent.layout.y; }}>
                <Pressable
                  style={st.sectionHeader}
                  onPress={() => setCommentsCollapsed((v) => !v)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={st.sectionTitle}>COMMENTS</Text>
                    {totalCount > 0 ? <Text style={st.commentCount}>{totalCount}</Text> : null}
                  </View>
                  <Text style={st.commentCount}>
                    {commentsCollapsed ? "Show ▾" : "Hide ▴"}
                  </Text>
                </Pressable>

                {commentsCollapsed ? null : commentsLoading && totalCount === 0 ? (
                  <View style={st.loadingRow}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : totalCount === 0 ? (
                  <View style={st.empty}>
                    <Text style={st.emptyText}>No comments yet — be the first!</Text>
                  </View>
                ) : (
                  <>
                    {/* "View older" at the TOP — reveals older comments */}
                    {!showAllComments && hiddenCount > 0 && (
                      <Pressable style={st.viewOlderBtn} onPress={() => setShowAllComments(true)}>
                        <Text style={st.viewOlderText}>
                          View {hiddenCount} older comment{hiddenCount !== 1 ? "s" : ""} ▴
                        </Text>
                      </Pressable>
                    )}
                    {showAllComments && totalCount > PREVIEW && (
                      <Pressable style={st.viewOlderBtn} onPress={() => setShowAllComments(false)}>
                        <Text style={st.viewOlderText}>Show fewer ▾</Text>
                      </Pressable>
                    )}

                    {visible.map((c) => (
                      <View
                        key={c.id}
                        onLayout={(e) => { commentLocalYs.current[c.id] = e.nativeEvent.layout.y; }}
                      >
                        <CommentItem
                          comment={c}
                          replies={repliesMap.get(c.id) ?? []}
                          colors={colors}
                          st={st}
                          onReply={handleReply}
                          onLike={handleLike}
                          forceExpanded={expandedIds.has(c.id)}
                          highlightedCommentId={highlightedCommentId}
                        />
                      </View>
                    ))}
                  </>
                )}
              </View>
            );
          })()}
        </ScrollView>

        {/* Comment input — Facebook-style */}
        <View style={{ backgroundColor: colors.card }}>
          {replyTo ? (
            <View style={st.replyingBanner}>
              <Text style={st.replyingText}>↩ Replying to {replyTo.name}</Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={12}>
                <Text style={st.replyingCancel}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[st.inputWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* User avatar */}
            <View style={st.inputAvatar}>
              {user?.profileImageUrl ? (
                <Image source={{ uri: normalizeProfileImageUrl(user.profileImageUrl) ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={st.inputAvatarText}>
                  {(user?.displayName ?? user?.username ?? "?").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            {/* Pill input + Post button */}
            <View style={st.inputPill}>
              <TextInput
                ref={inputRef}
                style={st.inputBox}
                value={text}
                onChangeText={setText}
                placeholder={replyTo ? `Reply to ${replyTo.name}…` : "Write a comment…"}
                placeholderTextColor={colors.muted}
                multiline
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => void submitComment()}
              />
              {(text.trim() || commentSending) ? (
                <Pressable
                  style={st.postBtn}
                  onPress={() => void submitComment()}
                  disabled={!text.trim() || commentSending}
                >
                  {commentSending
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={st.postBtnText}>Post</Text>
                  }
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
