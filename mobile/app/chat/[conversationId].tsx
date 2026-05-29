import { useApolloClient, useMutation, useQuery, useSubscription } from "@apollo/client/react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GET_MESSAGES,
  MARK_CONVERSATION_READ,
  MESSAGE_RECEIVED,
  MESSAGE_READ_SUB,
  MY_CONVERSATIONS,
  PRESENCE_CHANGED,
  SEND_MESSAGE,
  SET_TYPING,
  TYPING_INDICATOR_SUB,
} from "@ctrend/shared/graphql/messages";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string | null;
  readBy: Array<{ userId: string; readAt: string }>;
  createdAt: string;
};

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
}: {
  msg: Message;
  isOwn: boolean;
  showAvatar: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const avatar = normalizeProfileImageUrl(msg.senderAvatar);
  const initial = (msg.senderName ?? "?").slice(0, 1).toUpperCase();

  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      {/* Other-side avatar */}
      {!isOwn && (
        <View style={styles.bubbleAvatarSlot}>
          {showAvatar && (
            <View style={[styles.bubbleAvatar, { overflow: "hidden" }]}>
              {avatar
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

        {/* Image message */}
        {msg.imageUrl ? (
          <View style={[styles.bubbleImg, isOwn && { borderBottomRightRadius: 4 }, !isOwn && { borderBottomLeftRadius: 4 }]}>
            <Image
              source={{ uri: msg.imageUrl }}
              style={styles.bubbleImgContent}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            {msg.text ? (
              <Text style={[styles.bubbleImgCaption, { color: "#fff" }]}>{msg.text}</Text>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.bubble,
              isOwn
                ? [{ backgroundColor: colors.accent }, styles.bubbleOwn]
                : [{ backgroundColor: colors.card, borderColor: colors.border }, styles.bubbleOther],
            ]}
          >
            <Text style={[styles.bubbleText, { color: isOwn ? "#fff" : colors.text }]}>
              {msg.text}
            </Text>
          </View>
        )}

        {/* Time + seen */}
        <Text style={[styles.bubbleTime, { color: colors.muted }]}>
          {formatRelativeTime(msg.createdAt)}
          {isOwn && msg.readBy.length > 1 ? "  ✓✓" : ""}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // ── Fetch conversation metadata for header ──────────────────────────────────
  const { data: convsData } = useQuery<ConversationsData>(MY_CONVERSATIONS, {
    fetchPolicy: "cache-first",
  });

  const conv = convsData?.myConversations.find((c) => c.id === conversationId);
  const otherParticipants = (conv?.participants ?? []).filter((p) => p.id !== user?.id);
  const otherParticipant = otherParticipants[0] ?? null;
  const headerName = conv?.name?.trim()
    || otherParticipants.map((p) => p.displayName?.trim() || "User").join(", ")
    || "Chat";
  const headerAvatar = normalizeProfileImageUrl(otherParticipant?.avatarUrl);
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
      setMessages(sorted);
      setHasMore((data.messages ?? []).length === PAGE_SIZE);
    },
  });

  // ── Mark read on mount ──────────────────────────────────────────────────────
  const [markRead] = useMutation(MARK_CONVERSATION_READ);
  useEffect(() => {
    if (conversationId) {
      void markRead({ variables: { conversationId },
        refetchQueries: [MY_CONVERSATIONS],
      });
    }
  }, [conversationId, markRead]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const [sendMessage] = useMutation(SEND_MESSAGE);
  const [setTypingMut] = useMutation(SET_TYPING);
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);

  // ── New message subscription ────────────────────────────────────────────────
  useSubscription<{ messageReceived: Message }>(MESSAGE_RECEIVED, {
    skip: !conversationId,
    onData: ({ data }) => {
      const msg = data.data?.messageReceived;
      if (!msg || msg.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
      // Play sound only for incoming messages (not own)
      if (msg.senderId !== user?.id) {
        Vibration.vibrate(200);
      }
      // Mark read when new message arrives while screen is open
      void markRead({ variables: { conversationId },
        refetchQueries: [MY_CONVERSATIONS],
      });
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
      await sendMessage({
        variables: {
          conversationId,
          text: msgText || " ",
          ...(uploadedUrl ? { imageUrl: uploadedUrl } : {}),
        },
      });
    } catch { /* message failed silently — could add error toast */ }
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
    if (loadingMore || !hasMore || !conversationId) return;
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
      setMessages((prev) => [...prev, ...older]);
      setHasMore(((data as MessagesData).messages ?? []).length === PAGE_SIZE);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [client, conversationId, hasMore, loadingMore, messages.length]);

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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </Pressable>

        {/* Avatar */}
        <View style={[styles.headerAvatar, { overflow: "hidden" }]}>
          {headerAvatar
            ? <Image source={{ uri: headerAvatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={styles.headerAvatarText}>{headerInitial}</Text>
          }
        </View>

        <View style={styles.headerMeta}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{headerName}</Text>
          {otherParticipants.length === 1 && (
            <Text style={[styles.headerStatus, { color: partnerOnline ? "#22c55e" : colors.muted }]}>
              {partnerOnline ? "● Online" : "Offline"}
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 62}
      >
        {/* Messages */}
        {initialLoading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={styles.messagesList}
            onEndReached={() => void handleLoadMore()}
            onEndReachedThreshold={0.3}
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
              return (
                <MessageBubble
                  msg={msg}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  colors={colors}
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

        {/* Emoji picker */}
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
            onPress={() => void handleSend()}
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
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTime: { fontSize: 10, marginTop: 3, marginHorizontal: 4 },
  bubbleImg: {
    borderRadius: 16,
    overflow: "hidden",
  },
  bubbleImgContent: { width: 200, height: 200 },
  bubbleImgCaption: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 13 },

  // Typing
  typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, fontStyle: "italic" },

  // Emoji picker
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
});
