import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  ADMIN_MODERATOR_THREADS,
  ADMIN_MODERATOR_THREAD_MESSAGES,
  SEND_MODERATOR_MESSAGES,
  MARK_MODERATOR_THREAD_READ,
  ADMIN_MODERATOR_USER_MESSAGE,
  LIST_USERS,
} from "@ctrend/shared/graphql/admin";
import { REACT_MESSAGE, DELETE_MESSAGE, MESSAGE_REACTION_EMOJIS } from "@ctrend/shared/graphql/messages";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import logoAsset from "../../assets/logo.png";

function replySnippet(text?: string | null, imageUrl?: string | null): string {
  if (imageUrl && !text?.trim()) return "📷 Photo";
  if (imageUrl) return "📷 " + (text?.trim() ?? "");
  return text?.trim() ?? "";
}

const MODERATOR_BRAND_NAME = "Ke Jitbe Moderator";

type Thread = {
  conversationId: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  recipientProfileImageUrl?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  unreadFromUserCount: number;
};

type ThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  sentByAdminId?: string | null;
  sentByAdminName?: string | null;
  text: string;
  imageUrl?: string | null;
  deleted?: boolean | null;
  reactions?: { emoji: string; count: number }[] | null;
  viewerReaction?: string | null;
  replyTo?: { messageId: string; senderId: string; senderName: string; text?: string | null; imageUrl?: string | null } | null;
  createdAt: string;
};

type RecipientUser = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string } };
type ThreadsData = { adminModeratorThreads: Thread[] };
type MessagesData = { adminModeratorThreadMessages: ThreadMessage[] };
type UsersData = { listUsers: RecipientUser[] };

// Manual keyboard-height tracking — this screen lives inside a Tabs navigator
// (react-native-screens), where react-native-keyboard-controller's resize/translate
// doesn't reliably land on the wrapped view. Reading the keyboard height directly
// and applying it as bottom padding sidesteps that.
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function Avatar({ name, imageUrl, size = 36 }: { name: string; imageUrl?: string | null; size?: number }) {
  const initial = name[0]?.toUpperCase() ?? "?";
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#312e81", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "700" }}>{initial}</Text>
    </View>
  );
}

function ModeratorAvatar({ size = 36 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Image source={logoAsset} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

// ── Shared upload helper ───────────────────────────────────────
async function pickAndUploadImage(
  getUploadUrl: (vars: { variables: { filename: string; contentType: string } }) => Promise<{ data?: UploadUrlData }>,
  onUploading: (v: boolean) => void,
  onError: (msg: string) => void,
): Promise<string | null> {
  const choice = await new Promise<"camera" | "gallery" | null>((resolve) => {
    Alert.alert("Attach image", "Choose source", [
      { text: "Camera", onPress: () => resolve("camera") },
      { text: "Gallery", onPress: () => resolve("gallery") },
      { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
  if (!choice) return null;

  if (choice === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { onError("Camera permission required"); return null; }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { onError("Gallery permission required"); return null; }
  }

  const result = choice === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? "image/jpeg";
  const ext = mimeType.split("/")[1] ?? "jpg";
  const filename = asset.fileName ?? `photo_${Date.now()}.${ext}`;

  onUploading(true);
  try {
    const { data } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
    if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL");
    const { uploadUrl, publicUrl } = data.getImageUploadUrl;
    let uploadUri = asset.uri;
    if (Platform.OS === "android" && !asset.uri.startsWith("file://")) {
      uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: uploadUri });
    }
    const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed: ${res.status}`);
    onUploading(false);
    return publicUrl;
  } catch (err: unknown) {
    onUploading(false);
    onError(err instanceof Error ? err.message : "Upload failed");
    return null;
  }
}

// ── Chat screen ────────────────────────────────────────────────
function ChatView({
  thread,
  onBack,
  colors,
  insets,
}: {
  thread: Thread;
  onBack: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const { showToast, ToastView } = useToast();
  const [messageText, setMessageText] = useState("");
  const messageTextRef = useRef("");
  const [uploading, setUploading] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [activeReactMsgId, setActiveReactMsgId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { data, loading, refetch } = useQuery<MessagesData>(ADMIN_MODERATOR_THREAD_MESSAGES, {
    variables: { userId: thread.recipientUserId },
    fetchPolicy: "cache-and-network",
  });

  const [markRead] = useMutation(MARK_MODERATOR_THREAD_READ);
  const [sendMut, { loading: sending }] = useMutation(SEND_MODERATOR_MESSAGES);
  const [reactMut] = useMutation(REACT_MESSAGE);
  const [deleteMut] = useMutation(DELETE_MESSAGE);
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);

  useSubscription(ADMIN_MODERATOR_USER_MESSAGE, {
    onData: ({ data: subData }) => {
      if (subData.data?.adminModeratorUserMessage?.recipientUserId === thread.recipientUserId) {
        void refetch();
      }
    },
  });

  useEffect(() => {
    void markRead({ variables: { userId: thread.recipientUserId } });
  }, [thread.recipientUserId]);

  const messages = data?.adminModeratorThreadMessages ?? [];

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  async function handlePickImage() {
    const url = await pickAndUploadImage(
      getUploadUrl as Parameters<typeof pickAndUploadImage>[0],
      setUploading,
      (msg) => showToast(msg, "error"),
    );
    if (url) setPendingImageUrl(url);
  }

  function handleTextChange(val: string) {
    messageTextRef.current = val;
    setMessageText(val);
  }

  async function handleSend() {
    const text = messageTextRef.current.trim();
    if (!text && !pendingImageUrl) return;
    const replyToId = replyTarget?.id;
    try {
      await sendMut({
        variables: {
          userIds: [thread.recipientUserId],
          text: text || " ",
          imageUrl: pendingImageUrl ?? undefined,
          ...(replyToId ? { replyToId } : {}),
        },
      });
      messageTextRef.current = "";
      setMessageText("");
      setPendingImageUrl(null);
      setReplyTarget(null);
      void refetch();
    } catch {
      showToast("Failed to send", "error");
    }
  }

  function handleReact(msg: ThreadMessage, emoji: string) {
    const isRemove = msg.viewerReaction === emoji;
    if (!isRemove) Vibration.vibrate(8);
    setActiveReactMsgId(null);
    void reactMut({ variables: { messageId: msg.id, emoji: isRemove ? null : emoji } })
      .then(() => void refetch())
      .catch(() => {});
  }

  function handleDelete(msg: ThreadMessage) {
    setActiveReactMsgId(null);
    Alert.alert("Delete message?", "This message will be removed for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteMut({ variables: { messageId: msg.id } })
            .then(() => void refetch())
            .catch(() => {});
        },
      },
    ]);
  }

  function handleCopy(msg: ThreadMessage) {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    void Clipboard.setStringAsync(text);
    setActiveReactMsgId(null);
    showToast("Copied to clipboard", "success");
  }

  const st = chatStyles(colors);
  const isBusy = sending || uploading;
  const kbHeight = useKeyboardHeight();

  return (
    <View style={st.screen}>
      <ToastView />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={onBack} hitSlop={8} style={st.backBtn}>
          <Text style={[st.backText, { color: colors.accent }]}>‹ Back</Text>
        </Pressable>
        <Avatar name={thread.recipientName} imageUrl={thread.recipientProfileImageUrl} size={32} />
        <View style={st.headerInfo}>
          <Text style={[st.headerName, { color: colors.text }]} numberOfLines={1}>{thread.recipientName}</Text>
          <Text style={[st.headerEmail, { color: colors.muted }]} numberOfLines={1}>{thread.recipientEmail}</Text>
        </View>
        <View style={[st.moderatorTag, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
          <Text style={st.moderatorTagText}>🛡 Mod</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingBottom: kbHeight }}>
        {/* Messages */}
        {loading && messages.length === 0 ? (
          <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={st.msgList}
              onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
              onScrollBeginDrag={() => setActiveReactMsgId(null)}
              ListEmptyComponent={
                <View style={st.emptyChat}>
                  <ModeratorAvatar size={48} />
                  <Text style={[st.emptyChatTitle, { color: colors.text }]}>{MODERATOR_BRAND_NAME}</Text>
                  <Text style={[st.emptyChatSub, { color: colors.muted }]}>No messages yet</Text>
                </View>
              }
              renderItem={({ item: m }) => {
                const isAdmin = Boolean(m.sentByAdminId);
                const activeReactions: { emoji: string; count: number }[] = (m.reactions ?? []).filter((r: { emoji: string; count: number }) => r.count > 0);
                const isReacting = activeReactMsgId === m.id;

                if (m.deleted) {
                  return (
                    <View style={[st.msgRow, isAdmin ? st.msgRight : st.msgLeft]}>
                      {!isAdmin && <View style={{ width: 28, marginRight: 6 }} />}
                      <View style={[st.bubble, st.bubbleDeleted, { borderColor: colors.border }]}>
                        <Text style={[st.deletedText, { color: colors.muted }]}>
                          🚫 {isAdmin ? "You unsent this message" : "Message deleted"}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View>
                    {/* Reaction tray */}
                    {isReacting && (
                      <View style={[st.quickReactRow, isAdmin ? st.quickReactOwn : st.quickReactOther]}>
                        {(MESSAGE_REACTION_EMOJIS as readonly string[]).map((emoji) => (
                          <Pressable
                            key={emoji}
                            style={[st.quickReactBtn, m.viewerReaction === emoji && st.quickReactBtnActive]}
                            onPress={() => handleReact(m, emoji)}
                          >
                            <Text style={st.quickReactEmoji}>{emoji}</Text>
                          </Pressable>
                        ))}
                        {m.text?.trim() && m.text.trim() !== " " ? (
                          <Pressable style={st.quickReactClose} onPress={() => handleCopy(m)} hitSlop={4}>
                            <Ionicons name="copy-outline" size={15} color="rgba(255,255,255,0.9)" />
                          </Pressable>
                        ) : null}
                        <Pressable style={st.quickReactClose} onPress={() => { setReplyTarget(m); setActiveReactMsgId(null); }} hitSlop={4}>
                          <Ionicons name="arrow-undo-outline" size={15} color="rgba(255,255,255,0.9)" />
                        </Pressable>
                        {isAdmin && (
                          <Pressable style={st.quickReactClose} onPress={() => handleDelete(m)} hitSlop={4}>
                            <Ionicons name="trash-outline" size={15} color="rgba(248,113,113,0.95)" />
                          </Pressable>
                        )}
                        <Pressable style={st.quickReactClose} onPress={() => setActiveReactMsgId(null)} hitSlop={4}>
                          <Ionicons name="close" size={17} color="rgba(255,255,255,0.9)" />
                        </Pressable>
                      </View>
                    )}

                    <View style={[st.msgRow, isAdmin ? st.msgRight : st.msgLeft]}>
                      {!isAdmin && <Avatar name={m.senderName} imageUrl={m.senderAvatar} size={28} />}
                      <View style={{ maxWidth: "72%" }}>
                        {!isAdmin && <Text style={[st.msgSender, { color: colors.muted }]}>{m.senderName}</Text>}

                        {/* Quoted reply */}
                        {m.replyTo ? (
                          <View style={[st.quoted, { borderLeftColor: isAdmin ? "rgba(255,255,255,0.6)" : colors.accent, backgroundColor: isAdmin ? "rgba(255,255,255,0.14)" : colors.section }]}>
                            <Text style={[st.quotedName, { color: isAdmin ? "rgba(255,255,255,0.9)" : colors.accent }]} numberOfLines={1}>
                              {m.replyTo.senderName}
                            </Text>
                            <Text style={[st.quotedText, { color: isAdmin ? "rgba(255,255,255,0.75)" : colors.muted }]} numberOfLines={1}>
                              {replySnippet(m.replyTo.text, m.replyTo.imageUrl)}
                            </Text>
                          </View>
                        ) : null}

                        <Pressable
                          style={[st.bubble, isAdmin ? st.bubbleAdmin : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                          onLongPress={() => setActiveReactMsgId(isReacting ? null : m.id)}
                          delayLongPress={480}
                        >
                          {m.imageUrl ? (
                            <Image source={{ uri: m.imageUrl }} style={st.msgImage} resizeMode="cover" />
                          ) : null}
                          {m.text?.trim() && m.text.trim() !== " " ? (
                            <Text style={[st.bubbleText, { color: isAdmin ? "#fff" : colors.text }]}>{m.text}</Text>
                          ) : null}
                        </Pressable>

                        {/* Reaction strip */}
                        {activeReactions.length > 0 && (
                          <View style={st.reactionStrip}>
                            {activeReactions.map((r) => (
                              <Pressable
                                key={r.emoji}
                                onPress={() => handleReact(m, r.emoji)}
                                style={[st.reactionChip, { backgroundColor: colors.section }, m.viewerReaction === r.emoji && st.reactionChipActive]}
                              >
                                <Text style={st.reactionChipText}>{r.emoji} {r.count}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}

                        <Text style={[st.msgTime, { color: colors.muted, alignSelf: isAdmin ? "flex-end" : "flex-start" }]}>
                          {formatRelativeTime(m.createdAt)}{isAdmin && m.sentByAdminName ? ` · ${m.sentByAdminName}` : ""}
                        </Text>
                      </View>
                      {isAdmin && <ModeratorAvatar size={28} />}
                    </View>
                  </View>
                );
              }}
            />
        )}

        {/* Reply bar */}
        {replyTarget && (
          <View style={[st.replyBar, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
            <View style={[st.replyBarAccent, { backgroundColor: colors.accent }]} />
            <View style={st.replyBarBody}>
              <Text style={[st.replyBarTitle, { color: colors.accent }]} numberOfLines={1}>
                Replying to {replyTarget.sentByAdminId ? replyTarget.sentByAdminName ?? "Moderator" : replyTarget.senderName}
              </Text>
              <Text style={[st.replyBarText, { color: colors.muted }]} numberOfLines={1}>
                {replySnippet(replyTarget.text, replyTarget.imageUrl)}
              </Text>
            </View>
            {replyTarget.imageUrl ? (
              <Image source={{ uri: replyTarget.imageUrl }} style={st.replyBarThumb} resizeMode="cover" />
            ) : null}
            <Pressable style={st.replyBarClose} onPress={() => setReplyTarget(null)} hitSlop={8}>
              <Text style={[st.replyBarCloseText, { color: colors.muted }]}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Image preview */}
        {pendingImageUrl && (
          <View style={[st.pendingImg, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
            <Image source={{ uri: pendingImageUrl }} style={st.pendingImgThumb} resizeMode="cover" />
            <Pressable onPress={() => setPendingImageUrl(null)} style={st.pendingImgRemove} hitSlop={8}>
              <Text style={{ color: "#f87171", fontSize: 16, fontWeight: "700" }}>✕</Text>
            </Pressable>
          </View>
        )}

        {/* Input bar */}
        <View style={[st.inputRow, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 6 }]}>
          <Pressable onPress={() => void handlePickImage()} disabled={isBusy} style={[st.attachBtn, { backgroundColor: colors.section }]}>
            {uploading
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Ionicons name="image-outline" size={19} color={colors.accent} />}
          </Pressable>
          <TextInput
            style={[st.inputField, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            placeholder="Type a moderator message…"
            placeholderTextColor={colors.muted}
            value={messageText}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
          />
          <Pressable
            style={[st.sendBtn, { backgroundColor: colors.accent }, (isBusy || (!messageText.trim() && !pendingImageUrl)) && { opacity: 0.5 }]}
            onPressIn={() => {
              if (!isBusy && (messageTextRef.current.trim() || pendingImageUrl)) void handleSend();
            }}
            disabled={isBusy || (!messageText.trim() && !pendingImageUrl)}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function AdminMessagesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadSearch, setThreadSearch] = useState("");
  const [debouncedThreadSearch, setDebouncedThreadSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [debouncedRecipientSearch, setDebouncedRecipientSearch] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const threadDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleThreadSearch = useCallback((text: string) => {
    setThreadSearch(text);
    if (threadDebounce.current) clearTimeout(threadDebounce.current);
    threadDebounce.current = setTimeout(() => setDebouncedThreadSearch(text), 350);
  }, []);

  const handleRecipientSearch = useCallback((text: string) => {
    setRecipientSearch(text);
    if (recipientDebounce.current) clearTimeout(recipientDebounce.current);
    recipientDebounce.current = setTimeout(() => setDebouncedRecipientSearch(text), 350);
  }, []);

  const { data: threadsData, loading: threadsLoading, refetch: refetchThreads } = useQuery<ThreadsData>(
    ADMIN_MODERATOR_THREADS,
    { variables: { search: debouncedThreadSearch || undefined }, fetchPolicy: "cache-and-network" },
  );

  const { data: usersData } = useQuery<UsersData>(LIST_USERS, {
    variables: { search: debouncedRecipientSearch || undefined, take: 200 },
    fetchPolicy: "cache-and-network",
  });

  const [sendMut, { loading: sending }] = useMutation(SEND_MODERATOR_MESSAGES);
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);

  useSubscription(ADMIN_MODERATOR_USER_MESSAGE, {
    onData: () => { void refetchThreads(); },
  });

  const threads = threadsData?.adminModeratorThreads ?? [];
  const recipientUsers = usersData?.listUsers ?? [];

  async function handlePickImage() {
    const url = await pickAndUploadImage(
      getUploadUrl as Parameters<typeof pickAndUploadImage>[0],
      setUploading,
      (msg) => showToast(msg, "error"),
    );
    if (url) setPendingImageUrl(url);
  }

  async function handleSendNew() {
    const text = messageText.trim();
    if (!text && !pendingImageUrl) return;

    const userIds = Array.from(selectedRecipients);
    if (userIds.length === 0) {
      showToast("Select recipients first", "error");
      return;
    }

    try {
      await sendMut({
        variables: {
          userIds,
          text: text || " ",
          imageUrl: pendingImageUrl ?? undefined,
        },
      });
      setMessageText("");
      setPendingImageUrl(null);
      setSelectedRecipients(new Set());
      void refetchThreads();
      showToast("Message sent", "success");
    } catch {
      showToast("Failed to send", "error");
    }
  }

  function toggleRecipient(id: string) {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = recipientUsers.map((u) => u.id);
    const allSelected = allIds.every((id) => selectedRecipients.has(id));
    if (allSelected) {
      setSelectedRecipients((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedRecipients((prev) => {
        const next = new Set(prev);
        allIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function openThread(thread: Thread) {
    setActiveThread(thread);
    setActiveThreadId(thread.recipientUserId);
    setSelectedRecipients(new Set());
  }

  const st = mainStyles(colors);
  const isBusy = sending || uploading;
  const kbHeight = useKeyboardHeight();

  // ── Chat view (full screen) ────────────────────────────────
  if (activeThread) {
    return (
      <ChatView
        thread={activeThread}
        onBack={() => { setActiveThread(null); void refetchThreads(); }}
        colors={colors}
        insets={insets}
      />
    );
  }

  const totalUnread = threads.reduce((s, t) => s + t.unreadFromUserCount, 0);
  const isComposingNew = selectedRecipients.size > 0;

  function closePicker() {
    setPickerVisible(false);
  }

  function confirmPicker() {
    setPickerVisible(false);
  }

  // ── Main view ──────────────────────────────────────────────
  return (
    <View style={st.screen}>
      <ToastView />

      {/* Page header */}
      <View style={[st.pageHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[st.pageTitle, { color: colors.text }]}>Admin Messages</Text>
          <Text style={[st.pageSub, { color: colors.muted }]}>
            Chat as <Text style={{ color: colors.accent, fontWeight: "700" }}>{MODERATOR_BRAND_NAME}</Text>
          </Text>
        </View>
        {totalUnread > 0 ? (
          <View style={[st.newBadge, { backgroundColor: colors.accent }]}>
            <Text style={st.newBadgeText}>{totalUnread} NEW</Text>
          </View>
        ) : null}
        <Pressable
          style={[st.newMsgBtn, { backgroundColor: colors.accent }]}
          onPress={() => setPickerVisible(true)}
          hitSlop={6}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
        </Pressable>
      </View>

      {/* ── CONVERSATIONS + compose bar share one keyboard-aware flex column ── */}
      <View style={{ flex: 1, paddingBottom: kbHeight }}
      >
      <View style={[st.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border, marginHorizontal: 12, marginTop: 10 }]}>
        <Ionicons name="search-outline" size={15} color={colors.muted} />
        <TextInput
          style={[st.searchInput, { color: colors.text }]}
          placeholder="Search threads…"
          placeholderTextColor={colors.muted}
          value={threadSearch}
          onChangeText={handleThreadSearch}
        />
      </View>

      {threadsLoading && threads.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 12, paddingTop: 8, gap: 8 }}
          data={threads}
          keyExtractor={(t) => t.conversationId}
          ListEmptyComponent={
            <View style={st.emptyConvos}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={colors.muted} />
              <Text style={[st.emptyLabel, { color: colors.muted }]}>No conversations yet</Text>
            </View>
          }
          renderItem={({ item: t }) => {
            const hasUnread = t.unreadFromUserCount > 0;
            return (
              <Pressable
                style={[
                  st.threadCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  activeThreadId === t.recipientUserId && { borderColor: colors.accent },
                ]}
                onPress={() => openThread(t)}
              >
                {hasUnread ? <View style={[st.threadAccent, { backgroundColor: colors.accent }]} /> : null}
                <Avatar name={t.recipientName} imageUrl={t.recipientProfileImageUrl} size={42} />
                <View style={st.threadInfo}>
                  <View style={st.threadTopRow}>
                    <Text style={[st.threadName, { color: colors.text, fontWeight: hasUnread ? "800" : "700" }]} numberOfLines={1}>
                      {t.recipientName}
                    </Text>
                    {t.lastMessageAt && (
                      <Text style={[st.threadTime, { color: colors.muted }]}>{formatRelativeTime(t.lastMessageAt)}</Text>
                    )}
                  </View>
                  <View style={st.threadBottomRow}>
                    <Text style={[st.threadPreview, { color: hasUnread ? colors.text : colors.muted, flex: 1 }]} numberOfLines={1}>
                      {t.lastMessageText ?? "—"}
                    </Text>
                    {hasUnread && (
                      <View style={[st.badge, { backgroundColor: colors.accent }]}>
                        <Text style={st.badgeText}>{t.unreadFromUserCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* ── Compose bar (only while a new broadcast is being assembled) ── */}
      {isComposingNew ? (
        <View>
          {pendingImageUrl && (
            <View style={[st.pendingImg, { backgroundColor: colors.section, borderTopColor: colors.border }]}>
              <Image source={{ uri: pendingImageUrl }} style={st.pendingImgThumb} resizeMode="cover" />
              <Pressable onPress={() => setPendingImageUrl(null)} hitSlop={8} style={st.pendingImgRemove}>
                <Text style={{ color: "#f87171", fontSize: 16, fontWeight: "700" }}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={[st.composeBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
            <View style={st.composeToRow}>
              <Text style={[st.composeTo, { color: colors.accent }]} numberOfLines={1}>
                To: {selectedRecipients.size} recipient{selectedRecipients.size > 1 ? "s" : ""}
              </Text>
              <Pressable onPress={() => setSelectedRecipients(new Set())} hitSlop={8}>
                <Text style={[st.composeToClear, { color: colors.muted }]}>Clear</Text>
              </Pressable>
            </View>
            <View style={st.composeRow}>
              <Pressable onPress={() => void handlePickImage()} disabled={isBusy} style={[st.attachBtn, { backgroundColor: colors.section }]}>
                {uploading
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Ionicons name="image-outline" size={19} color={colors.accent} />}
              </Pressable>
              <TextInput
                style={[st.composeInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                placeholder="Type a moderator message…"
                placeholderTextColor={colors.muted}
                value={messageText}
                onChangeText={setMessageText}
                multiline
                maxLength={2000}
              />
              <Pressable
                style={[st.sendBtn, { backgroundColor: colors.accent }, (isBusy || (!messageText.trim() && !pendingImageUrl)) && { opacity: 0.5 }]}
                onPressIn={() => {
                  if (!isBusy && (messageText.trim() || pendingImageUrl)) void handleSendNew();
                }}
                disabled={isBusy || (!messageText.trim() && !pendingImageUrl)}
              >
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      </View>

      {/* ── Recipient picker (full sheet, fully decoupled from the conversations layout) ── */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={closePicker}>
        <View style={st.sheetRoot}>
          <Pressable style={st.sheetOverlay} onPress={closePicker} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[st.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[st.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={st.sheetHeaderRow}>
              <Text style={[st.sheetTitle, { color: colors.text }]}>New message</Text>
              <Pressable onPress={closePicker} hitSlop={8} style={[st.sheetClose, { backgroundColor: colors.section }]}>
                <Ionicons name="close" size={16} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[st.sectionHint, { color: colors.muted }]}>
              All accounts with user role — regular users and admin+user dual-role members.
            </Text>

            <View style={[st.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={15} color={colors.muted} />
              <TextInput
                style={[st.searchInput, { color: colors.text }]}
                placeholder="Search users…"
                placeholderTextColor={colors.muted}
                value={recipientSearch}
                onChangeText={handleRecipientSearch}
                autoFocus
              />
            </View>

            <FlatList
              style={{ flex: 1 }}
              data={recipientUsers}
              keyExtractor={(u) => u.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                recipientUsers.length > 0 ? (
                  <Pressable style={[st.selectAllBtn, { borderColor: colors.border }]} onPress={toggleSelectAll}>
                    <Text style={[st.selectAllText, { color: colors.accent }]}>
                      {recipientUsers.every((u) => selectedRecipients.has(u.id))
                        ? "Deselect all"
                        : `Select all (${recipientUsers.length})`}
                    </Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={<Text style={[st.emptyLabel, { color: colors.muted }]}>No users found</Text>}
              renderItem={({ item: u }) => {
                const selected = selectedRecipients.has(u.id);
                return (
                  <Pressable
                    style={[
                      st.recipientRow,
                      { borderBottomColor: colors.border },
                      selected && { backgroundColor: colors.accent + "12" },
                    ]}
                    onPress={() => toggleRecipient(u.id)}
                  >
                    <View style={[st.checkbox, { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : "transparent" }]}>
                      {selected && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
                    </View>
                    <Avatar name={u.displayName ?? u.username ?? u.email} imageUrl={u.profileImageUrl} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.recipientName, { color: colors.text }]} numberOfLines={1}>
                        {u.displayName ?? u.username ?? "—"}
                      </Text>
                      <Text style={[st.recipientEmail, { color: colors.muted }]} numberOfLines={1}>{u.email}</Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <Pressable
              style={[st.sheetDoneBtn, { backgroundColor: colors.accent, marginBottom: Math.max(insets.bottom, 12) }]}
              onPress={confirmPicker}
            >
              <Text style={st.sheetDoneText}>
                {selectedRecipients.size > 0 ? `Done · ${selectedRecipients.size} selected` : "Done"}
              </Text>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────
function mainStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pageHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, borderBottomWidth: 1 },
    pageTitle: { fontSize: 17, fontWeight: "800" },
    pageSub: { fontSize: 12, marginTop: 2 },
    sectionLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
    newBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
    newBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    newMsgBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 3 },
    sectionHint: { fontSize: 11, marginBottom: 8 },
    searchBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, gap: 8, marginBottom: 8 },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 10 },
    emptyLabel: { textAlign: "center", padding: 14, fontSize: 13 },
    emptyConvos: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
    threadCard: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
    threadAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
    threadInfo: { flex: 1, gap: 3 },
    threadTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    threadBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
    threadName: { fontSize: 14, fontWeight: "700", flex: 1 },
    threadTime: { fontSize: 10 },
    threadPreview: { fontSize: 12 },
    badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
    badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
    selectAllBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6, alignSelf: "stretch" },
    selectAllText: { fontSize: 12, fontWeight: "700" },
    recipientRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    recipientName: { fontSize: 13, fontWeight: "600" },
    recipientEmail: { fontSize: 11 },
    pendingImg: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, gap: 10 },
    pendingImgThumb: { width: 48, height: 48, borderRadius: 8 },
    pendingImgRemove: { padding: 4 },
    composeBar: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
    composeToRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    composeTo: { fontSize: 12, fontWeight: "700", flex: 1 },
    composeToClear: { fontSize: 11, fontWeight: "600" },
    composeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    composeInput: { flex: 1, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 90 },
    sendBtn: { borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    sheetRoot: { flex: 1, justifyContent: "flex-end" },
    sheetOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
    sheet: { height: "86%", borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 10 },
    sheetHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    sheetTitle: { fontSize: 16, fontWeight: "800" },
    sheetClose: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    sheetDoneBtn: { borderRadius: 14, paddingVertical: 13, alignItems: "center", marginTop: 8 },
    sheetDoneText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  });
}

function chatStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, gap: 8 },
    backBtn: { paddingRight: 4 },
    backText: { fontSize: 18, fontWeight: "600" },
    headerInfo: { flex: 1 },
    headerName: { fontSize: 14, fontWeight: "700" },
    headerEmail: { fontSize: 11 },
    moderatorTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    moderatorTagText: { fontSize: 11, fontWeight: "700", color: "#7c3aed" },
    msgList: { padding: 12, gap: 10, flexGrow: 1 },
    msgRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
    msgLeft: { justifyContent: "flex-start" },
    msgRight: { justifyContent: "flex-end" },
    msgSender: { fontSize: 10, marginBottom: 2 },
    bubble: { borderRadius: 16, overflow: "hidden" },
    bubbleAdmin: { backgroundColor: "#f59e0b" },
    bubbleDeleted: { backgroundColor: "transparent", borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
    deletedText: { fontSize: 13, fontStyle: "italic" },
    bubbleText: { fontSize: 14, lineHeight: 20, paddingHorizontal: 12, paddingVertical: 8 },
    msgImage: { width: 200, height: 150, borderRadius: 12 },
    msgTime: { fontSize: 10, marginTop: 3 },
    emptyChat: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10, paddingTop: 80 },
    emptyChatTitle: { fontSize: 16, fontWeight: "700" },
    emptyChatSub: { fontSize: 13 },
    // Quick-react tray
    quickReactRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, marginHorizontal: 4, backgroundColor: "rgba(15,20,40,0.92)", borderRadius: 24, paddingVertical: 5, paddingHorizontal: 6, gap: 2 },
    quickReactOwn: { alignSelf: "flex-end", marginRight: 40 },
    quickReactOther: { alignSelf: "flex-start", marginLeft: 40 },
    quickReactBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 18 },
    quickReactBtnActive: { backgroundColor: "rgba(99,102,241,0.35)" },
    quickReactEmoji: { fontSize: 22 },
    quickReactClose: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)", marginLeft: 2 },
    // Quoted reply inside bubble
    quoted: { borderLeftWidth: 3, borderTopLeftRadius: 8, borderBottomLeftRadius: 3, borderTopRightRadius: 8, borderBottomRightRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 3, marginHorizontal: 0 },
    quotedName: { fontSize: 11, fontWeight: "800", marginBottom: 1 },
    quotedText: { fontSize: 12 },
    // Reply bar above input
    replyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
    replyBarAccent: { width: 3, alignSelf: "stretch", borderRadius: 2 },
    replyBarBody: { flex: 1 },
    replyBarTitle: { fontSize: 12, fontWeight: "800" },
    replyBarText: { fontSize: 12, marginTop: 1 },
    replyBarThumb: { width: 34, height: 34, borderRadius: 6 },
    replyBarClose: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    replyBarCloseText: { fontSize: 13, fontWeight: "700" },
    // Reaction strip
    reactionStrip: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4, marginHorizontal: 2 },
    reactionChip: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
    reactionChipActive: { borderWidth: 1, borderColor: "rgba(99,102,241,0.45)", backgroundColor: "rgba(99,102,241,0.18)" },
    reactionChipText: { fontSize: 13, fontWeight: "600" },
    // Input
    pendingImg: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, gap: 10 },
    pendingImgThumb: { width: 48, height: 48, borderRadius: 8 },
    pendingImgRemove: { padding: 4 },
    inputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 10, gap: 6 },
    attachBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
    inputField: { flex: 1, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, maxHeight: 100 },
    sendBtn: { borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  });
}
