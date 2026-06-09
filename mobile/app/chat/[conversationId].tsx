import { useApolloClient, useMutation, useQuery, useSubscription } from "@apollo/client/react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DELETE_MESSAGE,
  GET_MESSAGES,
  MARK_CONVERSATION_READ,
  MESSAGE_DELETED_SUB,
  MESSAGE_REACTION_CHANGED,
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_RECEIVED,
  MESSAGE_READ_SUB,
  MY_CONVERSATIONS,
  PRESENCE_CHANGED,
  REACT_MESSAGE,
  SEND_MESSAGE,
  SET_TYPING,
  TYPING_INDICATOR_SUB,
} from "@ctrend/shared/graphql/messages";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { MODERATOR_BRAND_NAME } from "@ctrend/shared/lib/moderatorBrand";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { LinkText } from "../../components/LinkText";
import { useToast } from "../../components/useToast";
import logoAsset from "../../assets/logo.png";

// Official platform sender id used for moderator/admin broadcast messages.
const MODERATOR_SENDER_ID = "moderator";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useBackToFeed } from "../../hooks/useBackToFeed";
import { useSounds } from "../../context/SoundContext";
import { clearConversationNotification } from "../../lib/messageNotifications";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageReaction = { emoji: string; count: number };

type ReplyPreview = {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
};

type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string | null;
  deleted?: boolean | null;
  readBy: Array<{ userId: string; readAt: string }>;
  reactions?: MessageReaction[] | null;
  viewerReaction?: string | null;
  replyTo?: ReplyPreview | null;
  createdAt: string;
};

/** Snippet text for a quoted message: trimmed text, else "📷 Photo". */
function replySnippet(text?: string | null, imageUrl?: string | null): string {
  if (text && text.trim()) return text.trim();
  if (imageUrl) return "📷 Photo";
  return "";
}

type MessagesData = { messages: Message[] };
type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string } };

type Participant = {
  id: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  online?: boolean | null;
};

type Conversation = {
  id: string;
  type: string;
  name?: string | null;
  participantIds: string[];
  participants: Participant[];
};

type ConversationsData = { myConversations: Conversation[] };

type ReactionChangedData = {
  messageReactionChanged: {
    messageId: string;
    conversationId: string;
    reactions: MessageReaction[];
    actorUserId: string | null;
    actorEmoji: string | null;
  };
};

const PAGE_SIZE = 30;

const EMOJI_PRESETS = [
  "😂", "❤️", "🔥", "👍", "😍",
  "🥺", "😭", "✨", "🎉", "😎",
  "🤔", "💯", "🙏", "😅", "🤣",
  "😊", "💪", "👀", "🫡", "🤝",
];

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  showAvatar,
  colors,
  isReacting,
  isReplying,
  isFlashing,
  onTap,
  onLongPress,
  onReact,
  onReply,
  onImagePress,
  onJumpToOriginal,
  onDelete,
  onCopy,
  onForward,
}: {
  msg: Message;
  isOwn: boolean;
  showAvatar: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  isReacting: boolean;
  isReplying: boolean;
  isFlashing: boolean;
  onTap: () => void;
  onLongPress: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onImagePress: (uri: string) => void;
  onJumpToOriginal: (messageId: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onForward: () => void;
}) {
  const isModerator = msg.senderId === MODERATOR_SENDER_ID;
  const avatar = isModerator ? null : normalizeProfileImageUrl(msg.senderAvatar);
  const initial = (msg.senderName ?? "?").slice(0, 1).toUpperCase();
  const activeReactions = (msg.reactions ?? []).filter((r) => r.count > 0);

  // Deleted ("unsent") message → muted placeholder, no reactions/reply/tray.
  if (msg.deleted) {
    return (
      <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
        {!isOwn && <View style={styles.bubbleAvatarSlot} />}
        <View style={[styles.bubbleGroup, isOwn ? { alignItems: "flex-end" } : { alignItems: "flex-start" }]}>
          <View style={[styles.bubble, styles.bubbleDeleted, { borderColor: colors.border }]}>
            <Text style={[styles.deletedText, { color: colors.muted }]}>
              🚫 {isOwn ? "You unsent this message" : "Message deleted"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={isFlashing ? styles.bubbleFlash : undefined}>
      {/* Long-press action tray — Reply + quick-react emojis above the bubble */}
      {isReacting && (
        <View
          style={[
            styles.quickReactRow,
            isOwn ? styles.quickReactOwn : styles.quickReactOther,
          ]}
        >
          {MESSAGE_REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              style={[
                styles.quickReactBtn,
                msg.viewerReaction === emoji && styles.quickReactBtnActive,
              ]}
              onPress={() => onReact(emoji)}
            >
              <Text style={styles.quickReactEmoji}>{emoji}</Text>
            </Pressable>
          ))}
          {msg.text && msg.text.trim() ? (
            <Pressable style={styles.quickReactClose} onPress={onCopy} hitSlop={4}>
              <Ionicons name="copy-outline" size={15} color="rgba(255,255,255,0.9)" />
            </Pressable>
          ) : null}
          <Pressable style={styles.quickReactClose} onPress={onForward} hitSlop={4}>
            <Ionicons name="arrow-redo-outline" size={16} color="rgba(255,255,255,0.9)" />
          </Pressable>
          {isOwn && (
            <Pressable style={styles.quickReactClose} onPress={onDelete} hitSlop={4}>
              <Ionicons name="trash-outline" size={15} color="rgba(248,113,113,0.95)" />
            </Pressable>
          )}
          <Pressable style={styles.quickReactClose} onPress={onLongPress} hitSlop={4}>
            <Ionicons name="close" size={17} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>
      )}

      <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
        {/* Standalone reply arrow — inner side of own bubbles (Messenger-style).
            Single-tap shows it on text; for images (tap opens the photo) it rides
            along with the long-press tray so images stay replyable. */}
        {isOwn && (isReplying || (isReacting && !!msg.imageUrl)) && (
          <Pressable style={styles.sideReply} onPress={onReply} hitSlop={6}>
            <Text style={[styles.sideReplyText, { color: colors.text }]}>↩</Text>
          </Pressable>
        )}

        {/* Other-side avatar */}
        {!isOwn && (
          <View style={styles.bubbleAvatarSlot}>
            {showAvatar && (
              <View style={[styles.bubbleAvatar, { overflow: "hidden" }, isModerator && styles.bubbleAvatarOfficial]}>
                {isModerator
                  ? <Image source={logoAsset} style={styles.bubbleAvatarLogo} contentFit="contain" />
                  : avatar
                    ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                    : <Text style={styles.bubbleAvatarText}>{initial}</Text>
                }
              </View>
            )}
          </View>
        )}

        <View style={[styles.bubbleGroup, isOwn ? { alignItems: "flex-end" } : { alignItems: "flex-start" }]}>
          {/* Sender name (group chats or first in sequence) */}
          {!isOwn && showAvatar && (
            <Text style={[styles.bubbleSender, { color: colors.accent }]}>{msg.senderName}</Text>
          )}

          {/* Quoted reply snippet — tap to jump to the original */}
          {msg.replyTo && (
            <Pressable
              onPress={() => onJumpToOriginal(msg.replyTo!.messageId)}
              style={[
                styles.quoted,
                {
                  borderLeftColor: isOwn ? "rgba(255,255,255,0.7)" : colors.accent,
                  backgroundColor: isOwn ? "rgba(255,255,255,0.16)" : colors.section,
                },
              ]}
            >
              <Text
                style={[styles.quotedName, { color: isOwn ? "rgba(255,255,255,0.95)" : colors.accent }]}
                numberOfLines={1}
              >
                {msg.replyTo.senderName}
              </Text>
              <View style={styles.quotedBody}>
                {msg.replyTo.imageUrl ? (
                  <Image
                    source={{ uri: msg.replyTo.imageUrl }}
                    style={styles.quotedThumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : null}
                <Text
                  style={[styles.quotedText, { color: isOwn ? "rgba(255,255,255,0.85)" : colors.muted }]}
                  numberOfLines={1}
                >
                  {replySnippet(msg.replyTo.text, msg.replyTo.imageUrl)}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Image bubble */}
          {msg.imageUrl ? (
            <Pressable
              onPress={() => onImagePress(msg.imageUrl!)}
              onLongPress={onLongPress}
              delayLongPress={480}
              style={[
                styles.bubbleImg,
                isOwn && { borderBottomRightRadius: 4 },
                !isOwn && { borderBottomLeftRadius: 4 },
              ]}
            >
              <Image
                source={{ uri: msg.imageUrl }}
                style={styles.bubbleImgContent}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              {msg.text ? (
                <LinkText
                  text={msg.text}
                  style={[styles.bubbleImgCaption, { color: "#fff" }]}
                  linkColor="#7fd4ff"
                />
              ) : null}
            </Pressable>
          ) : (
            /* Text bubble */
            <Pressable
              onPress={onTap}
              onLongPress={onLongPress}
              delayLongPress={480}
              style={[
                styles.bubble,
                isOwn
                  ? [{ backgroundColor: colors.accent }, styles.bubbleOwn]
                  : [{ backgroundColor: colors.card, borderColor: colors.border }, styles.bubbleOther],
              ]}
            >
              <LinkText
                text={msg.text}
                style={[styles.bubbleText, { color: isOwn ? "#fff" : colors.text }]}
                linkColor={isOwn ? "#cfe4ff" : "#0a84ff"}
              />
            </Pressable>
          )}

          {/* Reaction strip */}
          {activeReactions.length > 0 && (
            <View style={styles.reactionStrip}>
              {activeReactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  onPress={() => onReact(r.emoji)}
                  style={[
                    styles.reactionChip,
                    { backgroundColor: colors.section },
                    msg.viewerReaction === r.emoji && styles.reactionChipActive,
                  ]}
                >
                  <Text style={styles.reactionChipText}>
                    {r.emoji} {r.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Time + seen */}
          <Text style={[styles.bubbleTime, { color: colors.muted }]}>
            {formatRelativeTime(msg.createdAt)}
            {isOwn && msg.readBy.length > 1 ? "  ✓✓" : ""}
          </Text>
        </View>

        {/* Standalone reply arrow — inner side of others' bubbles (Messenger-style) */}
        {!isOwn && (isReplying || (isReacting && !!msg.imageUrl)) && (
          <Pressable style={styles.sideReply} onPress={onReply} hitSlop={6}>
            <Text style={[styles.sideReplyText, { color: colors.text }]}>↩</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { showToast, ToastView } = useToast();
  const { playNotification } = useSounds();
  const insets = useSafeAreaInsets();
  const goBack = useBackToFeed(); // cold-start from a notification → back to feed

  const [messages, setMessages] = useState<Message[]>([]);
  const seenIds = useRef(new Set<string>());
  const loadingMoreRef = useRef(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [activeReactMsgId, setActiveReactMsgId] = useState<string | null>(null);
  const [activeReplyMsgId, setActiveReplyMsgId] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyPreview | null>(null);
  // Forward: the message being forwarded + selected target conversations.
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Set<string>>(new Set());
  const [forwarding, setForwarding] = useState(false);
  const [flashMsgId, setFlashMsgId] = useState<string | null>(null);

  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Message>>(null);

  // Clear any in-progress reply when switching conversations
  useEffect(() => {
    setReplyTarget(null);
  }, [conversationId]);

  // ── Fetch conversation metadata for header ──────────────────────────────────
  const { data: convsData } = useQuery<ConversationsData>(MY_CONVERSATIONS, {
    fetchPolicy: "cache-first",
  });

  const conv = convsData?.myConversations.find((c) => c.id === conversationId);
  const otherParticipants = (conv?.participants ?? []).filter((p) => p.id !== user?.id);
  const otherParticipant = otherParticipants[0] ?? null;
  // Official platform conversation — brand identity + logo, not a regular user.
  const isModeratorConvo = conv?.type?.toLowerCase() === "moderator";
  const headerName = isModeratorConvo
    ? MODERATOR_BRAND_NAME
    : conv?.name?.trim()
      || otherParticipants.map((p) => p.displayName?.trim() || "User").join(", ")
      || "Chat";
  const headerAvatar = isModeratorConvo ? null : normalizeProfileImageUrl(otherParticipant?.avatarUrl);
  const headerInitial = headerName.slice(0, 1).toUpperCase();

  // ── Load initial messages ───────────────────────────────────────────────────
  const { loading: initialLoading } = useQuery<MessagesData>(GET_MESSAGES, {
    variables: { conversationId, skip: 0, take: PAGE_SIZE },
    fetchPolicy: "network-only",
    skip: !conversationId,
    onCompleted: (data) => {
      const sorted = [...(data.messages ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      sorted.forEach((m) => seenIds.current.add(m.id));
      setMessages(sorted);
      setHasMore((data.messages ?? []).length === PAGE_SIZE);
    },
  });

  // ── Mark read on mount + dismiss grouped notification ──────────────────────
  const [markRead] = useMutation(MARK_CONVERSATION_READ);
  useEffect(() => {
    if (conversationId) {
      clearConversationNotification(conversationId);
      void markRead({ variables: { conversationId }, refetchQueries: [MY_CONVERSATIONS] });
    }
  }, [conversationId, markRead]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [setTypingMut] = useMutation(SET_TYPING);
  // Conversations list for the forward picker.
  const { data: convListData } = useQuery<ConversationsData>(MY_CONVERSATIONS, {
    fetchPolicy: "cache-and-network",
  });
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);
  const [reactMessage] = useMutation(REACT_MESSAGE);
  const [deleteMessageMut] = useMutation(DELETE_MESSAGE);

  // ── Delete ("unsend") own message ──────────────────────────────────────────
  const markMessageDeleted = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, deleted: true, text: "", imageUrl: null, reactions: [], viewerReaction: null }
          : m,
      ),
    );
  }, []);

  function handleDeleteMessage(msg: Message) {
    setActiveReactMsgId(null);
    Alert.alert(
      "Delete message?",
      "This message will be removed for everyone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            markMessageDeleted(msg.id); // optimistic
            void deleteMessageMut({ variables: { messageId: msg.id } }).catch(() => {});
          },
        },
      ],
    );
  }

  // ── React to a message (optimistic) ────────────────────────────────────────
  function handleReact(msg: Message, emoji: string) {
    const isRemove = msg.viewerReaction === emoji;
    const emojiToSend = isRemove ? null : emoji;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m;
        let updated = [...(m.reactions ?? [])];

        if (m.viewerReaction && !isRemove) {
          // Decrement previous when switching emoji
          updated = updated
            .map((r) => r.emoji === m.viewerReaction ? { ...r, count: Math.max(0, r.count - 1) } : r)
            .filter((r) => r.count > 0);
        }

        if (isRemove) {
          updated = updated
            .map((r) => r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r)
            .filter((r) => r.count > 0);
        } else {
          const existing = updated.find((r) => r.emoji === emoji);
          if (existing) {
            updated = updated.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1 } : r);
          } else {
            updated = [...updated, { emoji, count: 1 }];
          }
        }

        return { ...m, reactions: updated, viewerReaction: isRemove ? null : emoji };
      })
    );

    setActiveReactMsgId(null);
    void reactMessage({ variables: { messageId: msg.id, emoji: emojiToSend } }).catch(() => {});
  }

  // ── Reply to a message ──────────────────────────────────────────────────────
  function handleCopy(msg: Message) {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    void Clipboard.setStringAsync(text);
    setActiveReactMsgId(null);
    showToast("Copied to clipboard", "success");
  }

  function handleForward(msg: Message) {
    setForwardMsg(msg);
    setForwardTargets(new Set());
    setActiveReactMsgId(null);
  }

  function toggleForwardTarget(id: string) {
    setForwardTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doForward() {
    if (!forwardMsg || forwardTargets.size === 0) return;
    const m = forwardMsg;
    const targets = Array.from(forwardTargets);
    setForwarding(true);
    try {
      await Promise.all(
        targets.map((cid) =>
          sendMessage({
            variables: {
              conversationId: cid,
              text: m.text && m.text.trim() ? m.text : " ",
              ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
            },
            refetchQueries: [MY_CONVERSATIONS],
          }),
        ),
      );
      setForwardMsg(null);
      setForwardTargets(new Set());
      showToast(`Forwarded to ${targets.length} chat${targets.length > 1 ? "s" : ""}`, "success");
    } catch {
      showToast("Failed to forward", "error");
    } finally {
      setForwarding(false);
    }
  }

  function handleReply(msg: Message) {
    setReplyTarget({
      messageId: msg.id,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
      imageUrl: msg.imageUrl ?? null,
    });
    setActiveReactMsgId(null);
    setActiveReplyMsgId(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Jump to a quoted original + flash it ────────────────────────────────────
  function handleJumpToOriginal(messageId: string) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return; // original not loaded into the window — no-op
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setFlashMsgId(messageId);
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => setFlashMsgId(null), 1200);
  }

  // ── New message subscription ────────────────────────────────────────────────
  useSubscription<{ messageReceived: Message }>(MESSAGE_RECEIVED, {
    skip: !conversationId,
    onData: ({ data }) => {
      const msg = data.data?.messageReceived;
      if (!msg || msg.conversationId !== conversationId) return;
      if (seenIds.current.has(msg.id)) return;
      seenIds.current.add(msg.id);
      setMessages((prev) => [msg, ...prev]);
      if (msg.senderId !== user?.id) {
        playNotification();
        Vibration.vibrate(150);
      }
      void markRead({ variables: { conversationId }, refetchQueries: [MY_CONVERSATIONS] });
    },
  });

  // ── Message deleted subscription (real-time "message deleted") ───────────────
  useSubscription<{ messageDeleted: { id: string; conversationId: string } }>(
    MESSAGE_DELETED_SUB,
    {
      skip: !conversationId,
      onData: ({ data }) => {
        const ev = data.data?.messageDeleted;
        if (!ev || ev.conversationId !== conversationId) return;
        markMessageDeleted(ev.id);
      },
    },
  );

  // ── Reaction changed subscription ───────────────────────────────────────────
  useSubscription<ReactionChangedData>(MESSAGE_REACTION_CHANGED, {
    skip: !conversationId,
    onData: ({ data }) => {
      const ev = data.data?.messageReactionChanged;
      if (!ev || ev.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== ev.messageId) return m;
          const newViewerReaction =
            ev.actorUserId === user?.id ? ev.actorEmoji : m.viewerReaction;
          return { ...m, reactions: ev.reactions, viewerReaction: newViewerReaction };
        })
      );
    },
  });

  // ── Typing indicator subscription ──────────────────────────────────────────
  useSubscription<{ typingIndicator: { conversationId: string; userId: string; isTyping: boolean } }>(
    TYPING_INDICATOR_SUB,
    {
      variables: { conversationId },
      skip: !conversationId,
      onData: ({ data }) => {
        const ev = data.data?.typingIndicator;
        if (!ev || ev.conversationId !== conversationId) return;
        if (ev.userId === user?.id) return;
        setTypingUsers((prev) => {
          const next = new Map(prev);
          const name = conv?.participants.find((p) => p.id === ev.userId)?.displayName ?? "Someone";
          if (ev.isTyping) next.set(ev.userId, name);
          else next.delete(ev.userId);
          return next;
        });
      },
    }
  );

  // ── Message read subscription ───────────────────────────────────────────────
  useSubscription<{ messageRead: { conversationId: string; userId: string; readAt: string } }>(
    MESSAGE_READ_SUB,
    {
      skip: !conversationId,
      onData: ({ data }) => {
        const ev = data.data?.messageRead;
        if (!ev || ev.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.readBy.find((r) => r.userId === ev.userId)) return m;
            return { ...m, readBy: [...m.readBy, { userId: ev.userId, readAt: ev.readAt }] };
          })
        );
      },
    }
  );

  // ── Presence subscription ───────────────────────────────────────────────────
  useSubscription<{ presenceChanged: { userId: string; online: boolean } }>(
    PRESENCE_CHANGED,
    {
      skip: !conversationId || !otherParticipant,
      onData: ({ data }) => {
        const ev = data.data?.presenceChanged;
        if (!ev || ev.userId !== otherParticipant?.id) return;
        setPartnerOnline(ev.online);
      },
    }
  );

  useEffect(() => {
    setPartnerOnline(otherParticipant?.online ?? false);
  }, [otherParticipant?.online]);

  // ── Typing signal ───────────────────────────────────────────────────────────
  function handleTextChange(val: string) {
    setText(val);
    if (!conversationId) return;
    void setTypingMut({ variables: { conversationId, isTyping: true } }).catch(() => {});
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      void setTypingMut({ variables: { conversationId, isTyping: false } }).catch(() => {});
    }, 2000);
  }

  // ── Pick image ──────────────────────────────────────────────────────────────
  async function handlePickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      setShowEmoji(false);
    }
  }

  // ── Upload image ────────────────────────────────────────────────────────────
  async function uploadImage(uri: string): Promise<string> {
    const mimeType = "image/jpeg";
    const filename = `chat_${Date.now()}.jpg`;
    const { data: urlData } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
    if (!urlData?.getImageUploadUrl) throw new Error("Could not get upload URL");
    const { uploadUrl, publicUrl } = urlData.getImageUploadUrl;
    let uploadUri = uri;
    if (Platform.OS === "android" && !uri.startsWith("file://")) {
      uploadUri = `${FileSystem.cacheDirectory}chat_upload_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: uploadUri });
    }
    const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed: ${res.status}`);
    return publicUrl;
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  async function handleSend() {
    const msgText = text.trim();
    if (!msgText && !imageUri) return;
    if (!conversationId) return;

    setSending(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    void setTypingMut({ variables: { conversationId, isTyping: false } }).catch(() => {});

    try {
      let uploadedUrl: string | undefined;
      if (imageUri) {
        setImageUploading(true);
        uploadedUrl = await uploadImage(imageUri);
        setImageUri(null);
        setImageUploading(false);
      }

      setText("");
      const replyToId = replyTarget?.messageId;
      setReplyTarget(null);
      await sendMessage({
        variables: {
          conversationId,
          text: msgText || " ",
          ...(uploadedUrl ? { imageUrl: uploadedUrl } : {}),
          ...(replyToId ? { replyToId } : {}),
        },
      });
      // Snap to the newest message (offset 0 on the inverted list), even if the
      // user had scrolled up to reply to an older message.
      requestAnimationFrame(() =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      );
    } catch { /* message failed silently */ }
    finally {
      setSending(false);
      setImageUploading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const client = useApolloClient();
  const typingLabel = Array.from(typingUsers.values()).join(", ");
  const canSend = (text.trim().length > 0 || imageUri !== null) && !sending && !imageUploading;

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !conversationId || messages.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { data } = await client.query({
        query: GET_MESSAGES,
        variables: { conversationId, skip: messages.length, take: PAGE_SIZE },
        fetchPolicy: "network-only",
      });
      const older = [...((data as MessagesData).messages ?? [])].sort(
        (a: Message, b: Message) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = older.filter((m) => !existingIds.has(m.id));
        return [...prev, ...fresh];
      });
      setHasMore(((data as MessagesData).messages ?? []).length === PAGE_SIZE);
    } catch { /* ignore */ }
    finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [client, conversationId, hasMore, messages.length]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </Pressable>

        <Pressable
          style={styles.headerProfile}
          onPress={() => { if (otherParticipant?.id) router.push(`/profile/${otherParticipant.id}` as `/${string}`); }}
          disabled={!otherParticipant?.id}
          hitSlop={4}
        >
          <View style={[styles.headerAvatar, { overflow: "hidden" }, isModeratorConvo && styles.headerAvatarOfficial]}>
            {isModeratorConvo
              ? <Image source={logoAsset} style={styles.headerAvatarLogo} contentFit="contain" />
              : headerAvatar
                ? <Image source={{ uri: headerAvatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                : <Text style={styles.headerAvatarText}>{headerInitial}</Text>
            }
          </View>

          <View style={styles.headerMeta}>
            <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{headerName}</Text>
            {isModeratorConvo ? (
              <Text style={[styles.headerStatus, { color: colors.muted }]} numberOfLines={1}>
                🛡 Official team · not a regular user
              </Text>
            ) : otherParticipants.length === 1 && (
              <Text style={[styles.headerStatus, { color: partnerOnline ? "#22c55e" : colors.muted }]}>
                {partnerOnline ? "● Online" : "Offline"}
              </Text>
            )}
          </View>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 62 : 0}
      >
        {/* Messages */}
        {initialLoading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={styles.messagesList}
            onEndReached={() => void handleLoadMore()}
            onEndReachedThreshold={0.3}
            onScrollToIndexFailed={(info) => {
              // Inverted lists can fail to scroll to an unmeasured row; retry by offset.
              setTimeout(() => {
                listRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }, 60);
            }}
            ListFooterComponent={
              loadingMore
                ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} />
                : null
            }
            ListEmptyComponent={
              <View style={[styles.center, { paddingVertical: 60 }]}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>👋</Text>
                <Text style={[styles.emptyText, { color: colors.muted }]}>Say hello!</Text>
              </View>
            }
            renderItem={({ item: msg, index }) => {
              const isOwn = msg.senderId === user?.id;
              const prevMsg = messages[index - 1];
              const showAvatar = !isOwn && (
                !prevMsg || prevMsg.senderId !== msg.senderId
              );
              const isReacting = activeReactMsgId === msg.id;
              const isReplying = activeReplyMsgId === msg.id;
              return (
                <MessageBubble
                  msg={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  colors={colors}
                  isReacting={isReacting}
                  isReplying={isReplying}
                  isFlashing={flashMsgId === msg.id}
                  onTap={() => {
                    // Single tap → toggle the reply arrow; close the emoji tray.
                    setActiveReactMsgId(null);
                    setActiveReplyMsgId(isReplying ? null : msg.id);
                  }}
                  onLongPress={() => {
                    // Long press → toggle the emoji tray; close the reply arrow.
                    setActiveReplyMsgId(null);
                    setActiveReactMsgId(isReacting ? null : msg.id);
                  }}
                  onReact={(emoji) => handleReact(msg, emoji)}
                  onReply={() => handleReply(msg)}
                  onImagePress={(uri) => setViewerUri(uri)}
                  onJumpToOriginal={handleJumpToOriginal}
                  onDelete={() => handleDeleteMessage(msg)}
                  onCopy={() => handleCopy(msg)}
                  onForward={() => handleForward(msg)}
                />
              );
            }}
          />
        )}

        {/* Typing indicator */}
        {typingLabel ? (
          <View style={[styles.typingBar, { backgroundColor: colors.bg }]}>
            <Text style={[styles.typingText, { color: colors.muted }]}>
              {typingLabel} is typing…
            </Text>
          </View>
        ) : null}

        {/* Emoji picker (insert into message text) */}
        {showEmoji && (
          <View style={[styles.emojiPicker, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
              {EMOJI_PRESETS.map((e) => (
                <Pressable
                  key={e}
                  style={styles.emojiBtn}
                  onPress={() => {
                    setText((prev) => prev + e);
                    inputRef.current?.focus();
                  }}
                >
                  <Text style={styles.emojiChar}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reply bar — shows the message being replied to, above the composer */}
        {replyTarget && (
          <View style={[styles.replyBar, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
            <View style={[styles.replyBarAccent, { backgroundColor: colors.accent }]} />
            <View style={styles.replyBarBody}>
              <Text style={[styles.replyBarTitle, { color: colors.accent }]} numberOfLines={1}>
                Replying to {replyTarget.senderId === user?.id ? "yourself" : replyTarget.senderName}
              </Text>
              <Text style={[styles.replyBarText, { color: colors.muted }]} numberOfLines={1}>
                {replySnippet(replyTarget.text, replyTarget.imageUrl)}
              </Text>
            </View>
            {replyTarget.imageUrl ? (
              <Image source={{ uri: replyTarget.imageUrl }} style={styles.replyBarThumb} contentFit="cover" cachePolicy="memory-disk" />
            ) : null}
            <Pressable style={styles.replyBarClose} onPress={() => setReplyTarget(null)} hitSlop={8}>
              <Text style={[styles.replyBarCloseText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Image preview */}
        {imageUri && (
          <View style={[styles.imagePreviewBar, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
            {imageUploading && (
              <View style={styles.imageUploadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <Pressable style={styles.imageRemoveBtn} onPress={() => setImageUri(null)}>
              <Text style={styles.imageRemoveText}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <Pressable style={styles.inputIconBtn} onPress={() => { setShowEmoji((v) => !v); }}>
            <Text style={styles.inputIconText}>😊</Text>
          </Pressable>

          <Pressable style={styles.inputIconBtn} onPress={() => void handlePickImage()}>
            <Text style={styles.inputIconText}>📎</Text>
          </Pressable>

          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            placeholder="Message…"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
            returnKeyType="default"
            onFocus={() => setShowEmoji(false)}
          />

          <Pressable
            style={[
              styles.sendBtn,
              { backgroundColor: canSend ? colors.accent : colors.section },
            ]}
            onPressIn={() => {
              if (canSend) void handleSend();
            }}
            disabled={!canSend}
          >
            {sending || imageUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.sendBtnText, { color: canSend ? "#fff" : colors.muted }]}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Full-screen image viewer */}
      <Modal
        visible={viewerUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewerUri(null)}>
          {viewerUri && (
            <Image
              source={{ uri: viewerUri }}
              style={styles.viewerImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          )}
          <Pressable
            style={[styles.viewerCloseBtn, { top: insets.top + 8 }]}
            onPress={() => setViewerUri(null)}
            hitSlop={12}
          >
            <Text style={styles.viewerCloseText}>✕</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Forward picker */}
      <Modal visible={forwardMsg !== null} transparent animationType="slide" onRequestClose={() => setForwardMsg(null)}>
        <Pressable style={styles.fwdOverlay} onPress={() => setForwardMsg(null)}>
          <View
            style={[styles.fwdSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={[styles.fwdHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.fwdTitle, { color: colors.text }]}>Forward to…</Text>

            {forwardMsg ? (
              <View style={[styles.fwdPreview, { backgroundColor: colors.section, borderColor: colors.border }]}>
                {forwardMsg.imageUrl ? (
                  <Image source={{ uri: forwardMsg.imageUrl }} style={styles.fwdPreviewThumb} contentFit="cover" />
                ) : null}
                <Text style={[styles.fwdPreviewText, { color: colors.muted }]} numberOfLines={2}>
                  {forwardMsg.text?.trim() || (forwardMsg.imageUrl ? "📷 Photo" : "")}
                </Text>
              </View>
            ) : null}

            <FlatList
              data={(convListData?.myConversations ?? []).filter((c) => c.id !== conversationId)}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[styles.fwdEmpty, { color: colors.muted }]}>No other chats to forward to.</Text>}
              renderItem={({ item: c }) => {
                const other = c.participants.find((p) => p.id !== user?.id) ?? c.participants[0];
                const title = c.type === "group" || c.name ? c.name ?? "Group" : other?.displayName ?? "Unknown";
                const avatar = normalizeProfileImageUrl(other?.avatarUrl);
                const selected = forwardTargets.has(c.id);
                return (
                  <Pressable style={styles.fwdRow} onPress={() => toggleForwardTarget(c.id)}>
                    <View style={[styles.fwdAvatar, { backgroundColor: colors.section }]}>
                      {avatar ? (
                        <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <Text style={styles.fwdAvatarText}>{title.slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={[styles.fwdRowName, { color: colors.text }]} numberOfLines={1}>{title}</Text>
                    <View style={[styles.fwdCheck, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : "transparent" }]}>
                      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              }}
            />

            <Pressable
              style={[styles.fwdSend, { backgroundColor: colors.accent }, (forwarding || forwardTargets.size === 0) && { opacity: 0.5 }]}
              onPress={() => void doForward()}
              disabled={forwarding || forwardTargets.size === 0}
            >
              {forwarding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.fwdSendText}>Forward{forwardTargets.size > 0 ? ` (${forwardTargets.size})` : ""}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ToastView />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerProfile: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { padding: 6 },
  backText: { fontSize: 28, fontWeight: "300", lineHeight: 32 },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerAvatarOfficial: { backgroundColor: "#fff" },
  headerAvatarLogo: { width: "78%", height: "78%" },
  headerMeta: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "800" },
  headerStatus: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, fontWeight: "600" },
  messagesList: { paddingHorizontal: 12, paddingVertical: 12 },

  // Bubbles
  bubbleRow: { flexDirection: "row", marginBottom: 4, alignItems: "flex-end" },
  bubbleRowOwn: { justifyContent: "flex-end" },
  bubbleRowOther: { justifyContent: "flex-start" },
  bubbleAvatarSlot: { width: 32, marginRight: 6 },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleAvatarText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  bubbleAvatarOfficial: { backgroundColor: "#fff" },
  bubbleAvatarLogo: { width: "78%", height: "78%" },
  bubbleGroup: { maxWidth: "72%" },
  bubbleSender: { fontSize: 11, fontWeight: "700", marginBottom: 2, marginLeft: 4 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  bubbleOwn: { borderBottomRightRadius: 4, borderColor: "transparent" },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleDeleted: { backgroundColor: "transparent", borderStyle: "dashed" },
  deletedText: { fontSize: 14, fontStyle: "italic" },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, marginTop: 3, marginHorizontal: 4 },
  bubbleImg: {
    borderRadius: 16,
    overflow: "hidden",
  },
  bubbleImgContent: { width: 200, height: 200 },
  bubbleImgCaption: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 13 },

  // Quick-react emoji picker
  quickReactRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    marginHorizontal: 4,
    backgroundColor: "rgba(15,20,40,0.92)",
    borderRadius: 24,
    paddingVertical: 5,
    paddingHorizontal: 6,
    gap: 2,
  },
  quickReactOwn: { alignSelf: "flex-end" },
  quickReactOther: { alignSelf: "flex-start", marginLeft: 38 },
  quickReactBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 18,
  },
  quickReactBtnActive: {
    backgroundColor: "rgba(99,102,241,0.35)",
  },
  quickReactEmoji: { fontSize: 22 },
  quickReactClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    marginLeft: 2,
  },
  quickReactCloseText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },

  // Forward picker
  fwdOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  fwdSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, gap: 10 },
  fwdHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 6 },
  fwdTitle: { fontSize: 17, fontWeight: "800" },
  fwdPreview: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 10 },
  fwdPreviewThumb: { width: 36, height: 36, borderRadius: 6 },
  fwdPreviewText: { flex: 1, fontSize: 13 },
  fwdEmpty: { textAlign: "center", paddingVertical: 24, fontSize: 14 },
  fwdRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  fwdAvatar: { width: 40, height: 40, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  fwdAvatarText: { color: "#94a3b8", fontSize: 16, fontWeight: "800" },
  fwdRowName: { flex: 1, fontSize: 15, fontWeight: "600" },
  fwdCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  fwdSend: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  fwdSendText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  // Standalone Messenger-style reply arrow beside the bubble
  sideReply: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginHorizontal: 4,
    backgroundColor: "rgba(120,120,140,0.18)",
  },
  sideReplyText: { fontSize: 15, fontWeight: "700", opacity: 0.85 },

  // Quoted reply snippet inside a bubble
  bubbleFlash: { backgroundColor: "rgba(99,102,241,0.18)", borderRadius: 12 },
  quoted: {
    maxWidth: "100%",
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 3,
  },
  quotedName: { fontSize: 11, fontWeight: "800", marginBottom: 1 },
  quotedBody: { flexDirection: "row", alignItems: "center", gap: 6 },
  quotedThumb: { width: 22, height: 22, borderRadius: 4 },
  quotedText: { fontSize: 12, flexShrink: 1 },

  // Reply bar above the composer
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  replyBarAccent: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  replyBarBody: { flex: 1 },
  replyBarTitle: { fontSize: 12, fontWeight: "800" },
  replyBarText: { fontSize: 12, marginTop: 1 },
  replyBarThumb: { width: 34, height: 34, borderRadius: 6 },
  replyBarClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  replyBarCloseText: { fontSize: 13, fontWeight: "700" },

  // Reaction strip
  reactionStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginHorizontal: 2,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionChipActive: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.45)",
  },
  reactionChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  // Typing
  typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, fontStyle: "italic" },

  // Emoji picker (message compose)
  emojiPicker: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  emojiRow: { paddingHorizontal: 8, gap: 2 },
  emojiBtn: { padding: 8, borderRadius: 8 },
  emojiChar: { fontSize: 24 },

  // Image preview
  imagePreviewBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  imagePreview: { width: 64, height: 64, borderRadius: 8 },
  imageUploadingOverlay: {
    position: "absolute",
    left: 16,
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageRemoveBtn: {
    marginLeft: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageRemoveText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  inputIconBtn: { paddingBottom: 8, paddingHorizontal: 4 },
  inputIconText: { fontSize: 22 },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    maxHeight: 110,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnText: { fontSize: 18, fontWeight: "700" },

  // Full-screen image viewer
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: { width: "100%", height: "100%" },
  viewerCloseBtn: {
    position: "absolute",
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCloseText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
