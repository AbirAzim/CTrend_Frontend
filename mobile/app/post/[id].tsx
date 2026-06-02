import { useApolloClient, useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
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
  REMOVE_VOTE,
  SET_POST_HYPE,
  SET_POST_KEEP,
  VOTERS_BY_POST,
  VOTE_POST,
} from "@ctrend/shared/graphql/feed";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { MODERATOR_PLATFORM_NAME } from "@ctrend/shared/lib/moderatorBrand";
import logoAsset from "../../assets/logo.png";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
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
// VotersData used as generic for client.query
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

function makeStyles(c: ColorPalette, isDark: boolean) {
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
  return { localReaction, reactionCounts, activeReactions, handleReact };
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
};

function CommentItem({ comment, replies, st, onReply, onLike, forceExpanded }: CommentItemProps) {
  const [localLiked, setLocalLiked] = useState(comment.viewerHasLiked);
  const [localCount, setLocalCount] = useState(comment.likeCount);
  const [showReplies, setShowReplies] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const { localReaction, reactionCounts, activeReactions, handleReact } = useReactions(
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

          {/* React chip — clearly labeled, opens emoji picker */}
          <Pressable
            style={[st.reactChip, localReaction ? st.reactChipActive : null]}
            onPress={() => setShowPicker(true)}
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

        {/* Compact reaction pills — only those with count > 0 */}
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
  const { localReaction, reactionCounts, activeReactions, handleReact } = useReactions(
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
            onPress={() => setShowPicker(true)}
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

// ─── Voters floating panel (non-blocking, paginated, searchable) ─────────────

const VOTERS_PAGE_SIZE = 10;
const OPTION_TAG_COLORS = ["#6366f1", "#f97316", "#22c55e", "#a855f7"];

type VotersPanelProps = {
  postId: string;
  visible: boolean;
  onClose: () => void;
  optionLabels: string[];
  st: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  bottomOffset: number;
};

function VotersPanel({ postId, visible, onClose, optionLabels, st, colors, bottomOffset }: VotersPanelProps) {
  const client = useApolloClient();
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [voters, setVoters] = useState<GqlVoter[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);
  const votersRef = useRef<GqlVoter[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVoters = useCallback(async (append: boolean) => {
    const reqId = ++reqIdRef.current;
    if (append) setLoadingMore(true);
    else { setLoadingInitial(true); votersRef.current = []; }
    try {
      const base = append ? votersRef.current : [];
      const { data } = await client.query<VotersData>({
        query: VOTERS_BY_POST,
        variables: {
          postId,
          optionIndex: activeTab ?? undefined,
          search: debouncedSearch || null,
          skip: base.length,
          take: VOTERS_PAGE_SIZE,
        },
        fetchPolicy: "network-only",
      });
      if (reqIdRef.current !== reqId) return;
      const rows: GqlVoter[] = data?.votersByPost ?? [];
      const next = [...base, ...rows];
      votersRef.current = next;
      setVoters(next);
      setHasMore(rows.length === VOTERS_PAGE_SIZE);
    } catch { /* silent */ }
    finally {
      if (reqIdRef.current === reqId) { setLoadingInitial(false); setLoadingMore(false); }
    }
  }, [client, postId, activeTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    void fetchVoters(false);
  }, [visible, activeTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const tabs = [{ label: "All", value: null }, ...optionLabels.map((l, i) => ({ label: l || `Option ${i + 1}`, value: i }))];

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <View style={[st.votersPanel, { bottom: bottomOffset }]} pointerEvents="auto">
        {/* Header */}
        <View style={st.votersPanelHeader}>
          <Text style={st.votersPanelTitle}>
            Voted by {voters.length}{hasMore ? "+" : ""}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={st.votersPanelClose}>
            <Text style={st.votersPanelCloseText}>✕</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={st.votersPanelSearch}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search voters…"
            placeholderTextColor={colors.muted}
            style={st.votersPanelSearchInput}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.votersTabRow}
        >
          {tabs.map((t) => (
            <Pressable
              key={String(t.value)}
              style={[st.votersTab, activeTab === t.value && st.votersTabActive]}
              onPress={() => setActiveTab(t.value)}
            >
              <Text style={[st.votersTabText, activeTab === t.value && st.votersTabTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Voter list */}
        <FlatList
          data={voters}
          keyExtractor={(v) => v.voteId}
          onEndReached={() => { if (hasMore && !loadingMore && !loadingInitial) void fetchVoters(true); }}
          onEndReachedThreshold={0.3}
          style={{ height: 340 }}
          ListEmptyComponent={
            loadingInitial
              ? <ActivityIndicator style={{ margin: 24 }} color={colors.accent} />
              : <Text style={st.voterEmpty}>
                  {debouncedSearch ? "No voters match your search" : "No voters yet"}
                </Text>
          }
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator style={{ marginVertical: 12 }} color={colors.accent} />
              : !hasMore && voters.length > 0
                ? <Text style={[st.voterEmpty, { fontSize: 12, paddingVertical: 12 }]}>That's everyone</Text>
                : null
          }
          renderItem={({ item: v }) => {
            const name = v.anonymous
              ? "Anonymous"
              : v.user?.displayName?.trim() || v.user?.username || "Unknown";
            const initial = name.slice(0, 1).toUpperCase();
            const img = !v.anonymous ? normalizeProfileImageUrl(v.user?.profileImageUrl) : null;
            const tagLabel = optionLabels[v.selectedOptionIndex];
            const tagColor = OPTION_TAG_COLORS[v.selectedOptionIndex % OPTION_TAG_COLORS.length];
            return (
              <Pressable
                style={st.voterRow}
                onPress={() => {
                  if (!v.anonymous && v.user) {
                    onClose();
                    router.push(`/profile/${v.user.id}` as `/${string}`);
                  }
                }}
              >
                <View style={st.voterAvatar}>
                  {img
                    ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                    : <Text style={st.voterAvatarText}>{v.anonymous ? "?" : initial}</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.voterName}>{name}</Text>
                  <Text style={st.voterTime}>{formatRelativeTime(v.createdAt)}</Text>
                </View>
                {activeTab === null && tagLabel ? (
                  <View style={[st.voterOptionTag, { backgroundColor: tagColor + "22", borderColor: tagColor + "44" }]}>
                    <Text style={[st.voterOptionTagText, { color: tagColor }]}>{tagLabel}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </View>
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
  const { adjustSavedCount } = useTabBar();
  const [voteMut] = useMutation(VOTE_POST);
  const [removeVoteMut] = useMutation(REMOVE_VOTE);
  const [hypeMut] = useMutation(SET_POST_HYPE);
  const [keepMut] = useMutation(SET_POST_KEEP);
  const [viewerVote, setViewerVote] = useState(post.viewerVote);
  const [up, setUp] = useState(post.upvoteCount);
  const [down, setDown] = useState(post.downvoteCount);
  const [anonymous, setAnonymous] = useState(Boolean(post.myVoteAnonymous));
  const [hyped, setHyped] = useState(Boolean(post.viewerHasHyped));
  const [hypeCount, setHypeCount] = useState(post.hypeCount ?? 0);
  const [kept, setKept] = useState(Boolean(post.viewerHasSaved));
  const [saveCount, setSaveCount] = useState(post.saveCount ?? 0);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const total = up + down;
  const leftPct = total > 0 ? Math.round((100 * up) / total) : 50;
  const rightPct = 100 - leftPct;
  const isVotingClosed = post.isVotingOpen === false;
  const hasVoted = viewerVote !== null;

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
    const newVote: "UP" | "DOWN" = idx === 0 ? "UP" : "DOWN";

    if (prev === newVote) {
      // Same option tapped — withdraw
      setViewerVote(null);
      setUp((n) => n - (idx === 0 ? 1 : 0));
      setDown((n) => n - (idx === 1 ? 1 : 0));
      try {
        await removeVoteMut({ variables: { postId: post.id } });
      } catch {
        setViewerVote(prev);
        setUp(post.upvoteCount);
        setDown(post.downvoteCount);
      }
      return;
    }

    // New or switched vote
    setViewerVote(newVote);
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
    setSaveCount((n) => Math.max(0, n + (next ? 1 : -1)));
    adjustSavedCount(next ? 1 : -1);
    try { await keepMut({ variables: { postId: post.id, keep: next } }); }
    catch {
      setKept(!next);
      setSaveCount((n) => Math.max(0, n + (next ? -1 : 1)));
      adjustSavedCount(next ? -1 : 1);
    }
  }

  async function handleShare() {
    try {
      await Share.share({ url: postPermalink(post.id), message: post.caption ?? "Check out this comparison!" });
    } catch { /* ignore */ }
  }

  const isPlatformPost = post.postType === "system";
  const authorName = isPlatformPost
    ? MODERATOR_PLATFORM_NAME
    : post.authorDisplayName?.trim() || post.authorUsername;
  const initial = authorName.slice(0, 1).toUpperCase();
  const authorAvatarUrl = isPlatformPost ? null : post.authorProfileImageUrl ?? null;
  const compareUrls = post.imageUrls.length >= 2 ? post.imageUrls.slice(0, 2) : null;

  return (
    <View style={st.postCard}>
      <Pressable
        style={st.postHeader}
        onPress={() =>
          !isPlatformPost &&
          post.authorId &&
          router.push(`/profile/${post.authorId}` as `/${string}`)
        }
        disabled={isPlatformPost}
      >
        <View style={[st.postAvatar, { overflow: "hidden" }]}>
          {isPlatformPost ? (
            <Image
              source={logoAsset}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : authorAvatarUrl ? (
            <Image source={{ uri: authorAvatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <Text style={st.postAvatarText}>{initial}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.postAuthor}>{authorName}</Text>
          <Text style={st.postTime}>
            {isPlatformPost
              ? `Platform poll · ${formatRelativeTime(post.createdAt)}`
              : formatRelativeTime(post.createdAt)}
          </Text>
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
            {hasVoted ? "✓ Voted — tap again to unvote · tap other to switch" : "👆 Tap an image to vote"}
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
      {compareUrls && detailsOpen && (
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

      {/* ── Two-zone action rail ── */}
      {(() => {
        const commentCount = post.commentCount ?? 0;
        const total = up + down;
        const isVotingClosedCard = post.isVotingOpen === false;
        const statusText = compareUrls
          ? isVotingClosedCard
            ? (() => {
                if (total === 0) return "🏆 No votes were cast";
                if (up === down) return "🏆 Tie · 50% each";
                const wLabel = up > down
                  ? (post.optionStats?.find((s) => s.index === 0)?.label?.trim() || "Side 1")
                  : (post.optionStats?.find((s) => s.index === 1)?.label?.trim() || "Side 2");
                const pct = Math.round((100 * Math.max(up, down)) / total);
                return `🏆 ${wLabel} won · ${pct}% (${total.toLocaleString()} votes)`;
              })()
            : timeLeft
              ? `⏳ ${timeLeft}`
              : "Voting open"
          : null;

        type ChipDef = { i: number; icon: string; label: string; onPress: () => void; count?: number; isHype?: boolean; isSave?: boolean; active?: boolean };
        const chips: ChipDef[] = [
          { i: 0, icon: "💬", label: "Comments", onPress: () => {}, count: commentCount },
          { i: 1, icon: "📤", label: "Share", onPress: () => void handleShare() },
          { i: 2, icon: hyped ? "♥" : "♡", label: "Hype", onPress: () => void handleHype(), count: hypeCount, isHype: true, active: hyped },
          { i: 3, icon: "🔖", label: "Keep", onPress: () => void handleKeep(), count: saveCount, isSave: true, active: kept },
          { i: 4, icon: "👥", label: "Voters", onPress: onVoters, count: total },
        ];

        return (
          <View style={st.actionRail}>
            <View style={st.actionRailIcons}>
              {chips.map(({ i, icon, label, onPress, count, isHype, isSave, active }) => (
                <Pressable
                  key={i}
                  style={[
                    st.actionChipFlat,
                    isHype && active && st.actionChipFlatHypeActive,
                    isSave && active && st.actionChipFlatSaveActive,
                  ]}
                  onPress={onPress}
                  accessibilityLabel={label}
                  hitSlop={4}
                >
                  <Text style={[
                    st.actionChipFlatIcon,
                    isHype && active && st.actionChipFlatIconHype,
                    isSave && active && st.actionChipFlatIconSave,
                  ]}>
                    {icon}
                  </Text>
                  {count != null && count > 0 ? (
                    <View style={[
                      st.actionChipBadge,
                      isHype && st.actionChipBadgeRose,
                      isSave && st.actionChipBadgeAmber,
                    ]}>
                      <Text style={[
                        st.actionChipBadgeText,
                        isHype && st.actionChipBadgeTextRose,
                        isSave && st.actionChipBadgeTextAmber,
                      ]}>
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
            {statusText ? (
              <View style={st.actionRailContext}>
                <Text
                  style={[st.actionStatusText, isVotingClosedCard && st.actionStatusTextResult]}
                  numberOfLines={1}
                >
                  {statusText}
                </Text>
                <Pressable style={st.seeDetailsBtn2} onPress={() => setDetailsOpen((v) => !v)}>
                  <Text style={st.seeDetailsBtnText2}>
                    {detailsOpen ? "Hide ‹" : "See details ›"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })()}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
  // ALL hooks must come before any conditional returns (Rules of Hooks)
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const isOwner = !!user && !!post?.authorId && user.id === post.authorId;

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

  // Oldest-first (natural conversation order, newest at bottom like Facebook)
  const topComments = useMemo(
    () => allComments
      .filter((c) => !c.parentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
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
  const [deleteMut, { loading: deleting }] = useMutation(DELETE_POST);
  const [extendMut, { loading: extending }] = useMutation(EXTEND_POST_VOTING);

  const { showToast, ToastView } = useToast();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<typeof ScrollView>(null);
  const [votersVisible, setVotersVisible] = useState(false);
  const [optimisticComments, setOptimisticComments] = useState<GqlComment[]>([]);
  const [showAllComments, setShowAllComments] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
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

    // Scroll to show the new comment (slight delay so optimistic renders first)
    setTimeout(() => {
      (scrollRef.current as unknown as { scrollToEnd: (opts: { animated: boolean }) => void })
        ?.scrollToEnd({ animated: true });
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
              <>
                <View style={st.sectionHeader}>
                  <Text style={st.sectionTitle}>COMMENTS</Text>
                  {totalCount > 0 ? <Text style={st.commentCount}>{totalCount}</Text> : null}
                </View>

                {commentsLoading && totalCount === 0 ? (
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
                      <CommentItem
                        key={c.id}
                        comment={c}
                        replies={repliesMap.get(c.id) ?? []}
                        colors={colors}
                        st={st}
                        onReply={handleReply}
                        onLike={handleLike}
                        forceExpanded={expandedIds.has(c.id)}
                      />
                    ))}
                  </>
                )}
              </>
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

      {/* Voters non-blocking floating panel */}
      {post ? (
        <VotersPanel
          postId={id ?? ""}
          visible={votersVisible}
          onClose={() => setVotersVisible(false)}
          optionLabels={optionLabels}
          st={st}
          colors={colors}
          bottomOffset={insets.bottom + 70}
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
