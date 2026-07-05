import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MY_CONVERSATIONS,
  MESSAGE_RECEIVED,
  START_DIRECT_CONVERSATION,
  ONLINE_USER_IDS,
} from "@ctrend/shared/graphql/messages";
import { MY_FRIENDS } from "@ctrend/shared/graphql/friends";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { MODERATOR_BRAND_NAME } from "@ctrend/shared/lib/moderatorBrand";
import logoAsset from "../../assets/logo.png";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  createdAt: string;
};

type Friend = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

type ConversationsData = { myConversations: Conversation[] };
type FriendsData = { myFriends: Friend[] };
type OnlineData = { onlineUserIds: string[] };
type StartDmData = { startDirectConversation: { id: string } };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function otherParticipant(conv: Conversation, myId: string): Participant | null {
  return conv.participants.find((p) => p.id !== myId) ?? null;
}

function convDisplayName(conv: Conversation, myId: string): string {
  if (conv.name?.trim()) return conv.name.trim();
  const others = myId
    ? conv.participants.filter((p) => p.id !== myId)
    : conv.participants;
  if (others.length > 0) {
    return others.map((p) => p.displayName?.trim() || "User").join(", ");
  }
  return "Chat";
}

// ─── Friend picker modal ──────────────────────────────────────────────────────

function NewDmModal({
  visible,
  onClose,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const { data } = useQuery<FriendsData>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network",
    skip: !visible,
  });
  const [startDm] = useMutation<StartDmData>(START_DIRECT_CONVERSATION);

  async function handleSelect(friendId: string) {
    setLoadingId(friendId);
    try {
      const { data: dmData } = await startDm({ variables: { userId: friendId } });
      if (!dmData?.startDirectConversation) throw new Error();
      onClose();
      router.push(`/chat/${dmData.startDirectConversation.id}` as `/${string}`);
    } catch {
      setLoadingId(null);
    }
  }

  const filtered = (data?.myFriends ?? []).filter((f) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      f.username.toLowerCase().includes(q) ||
      (f.displayName?.toLowerCase() ?? "").includes(q)
    );
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalRoot, { backgroundColor: colors.bg }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: insets.top + 16 }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>New Message</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Text style={{ color: colors.muted, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search friends..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {data ? "No friends found" : "Loading…"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 16 }}
            renderItem={({ item: f }) => {
              const name = f.displayName?.trim() || f.username;
              const avatar = normalizeProfileImageUrl(f.profileImageUrl);
              const initial = name.slice(0, 1).toUpperCase();
              const isLoading = loadingId === f.id;
              return (
                <Pressable
                  style={[styles.friendRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => void handleSelect(f.id)}
                  disabled={isLoading}
                >
                  <View style={[styles.convAvatar, { overflow: "hidden" }]}>
                    {avatar
                      ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                      : <Text style={styles.convAvatarText}>{initial}</Text>
                    }
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.convName, { color: colors.text }]}>{name}</Text>
                    <Text style={[styles.convSub, { color: colors.muted }]}>@{f.username}</Text>
                  </View>
                  {isLoading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={{ color: colors.accent, fontSize: 20 }}>›</Text>
                  }
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { isAuthenticated, hydrated, user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();
  const [showNewDm, setShowNewDm] = useState(false);

  // This screen doesn't hide the footer on scroll, so pin it visible on focus —
  // otherwise it inherits a hidden state left behind by the feed/profile scroll.
  useFocusEffect(useCallback(() => { translateY.value = 0; }, [translateY]));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  const { data, loading, refetch } = useQuery<ConversationsData>(MY_CONVERSATIONS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  const { data: onlineData } = useQuery<OnlineData>(ONLINE_USER_IDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });

  useSubscription(MESSAGE_RECEIVED, {
    skip: !isAuthenticated,
    onData: () => void refetch(),
  });

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const conversations = [...(data?.myConversations ?? [])].sort((a, b) => {
    const ta = a.lastMessageAt ?? a.createdAt;
    const tb = b.lastMessageAt ?? b.createdAt;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  const onlineSet = new Set(onlineData?.onlineUserIds ?? []);
  const myId = user?.id ?? "";

  const q = search.trim().toLowerCase();
  const filtered = q
    ? conversations.filter((c) => {
        if (convDisplayName(c, myId).toLowerCase().includes(q)) return true;
        return c.participants.some(
          (p) => p.id !== myId && (p.displayName?.toLowerCase() ?? "").includes(q),
        );
      })
    : conversations;

  // Floating tab bar occupies (insets.bottom + PILL margin 14 + PILL height 64)
  const listBottomPad = insets.bottom + 78 + 16;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <NewDmModal visible={showNewDm} onClose={() => setShowNewDm(false)} colors={colors} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
        <Pressable
          style={[styles.newBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowNewDm(true)}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </Pressable>
      </View>

      {loading && conversations.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
          <Text style={[styles.emptySub, { color: colors.muted }]}>Start a conversation with a friend</Text>
          <Pressable
            style={[styles.startBtn, { backgroundColor: colors.accent }]}
            onPress={() => setShowNewDm(true)}
          >
            <Text style={styles.startBtnText}>Start a Chat</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Search bar */}
          <View style={[styles.listSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={{ color: colors.muted, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search messages…"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
              </Pressable>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ color: colors.muted, fontSize: 14 }}>No conversations match “{search}”</Text>
              </View>
            }
            renderItem={({ item: conv }) => {
            const other = otherParticipant(conv, myId);
            // Official platform conversation — show the brand identity + logo, not
            // a regular user's name/avatar (mirrors web MessengerPanel).
            const isModerator = conv.type?.toLowerCase() === "moderator";
            const name = isModerator ? MODERATOR_BRAND_NAME : convDisplayName(conv, myId);
            const avatar = isModerator ? null : normalizeProfileImageUrl(other?.avatarUrl);
            const initial = name.slice(0, 1).toUpperCase();
            const isOnline = !isModerator && other ? onlineSet.has(other.id) : false;
            const unread = conv.unreadCount > 0;
            const preview = conv.lastMessageText ?? "No messages yet";
            const time = conv.lastMessageAt
              ? formatRelativeTime(conv.lastMessageAt)
              : "";
            return (
              <Pressable
                style={[styles.convRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/chat/${conv.id}` as `/${string}`)}
              >
                {/* Avatar */}
                <View style={{ position: "relative", marginRight: 12 }}>
                  <View style={[styles.convAvatar, { overflow: "hidden" }, isModerator && styles.convAvatarOfficial]}>
                    {isModerator
                      ? <Image source={logoAsset} style={styles.convAvatarLogo} contentFit="contain" />
                      : avatar
                        ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                        : <Text style={styles.convAvatarText}>{initial}</Text>
                    }
                  </View>
                  {isOnline && <View style={styles.onlineDot} />}
                </View>

                {/* Text */}
                <View style={{ flex: 1 }}>
                  <View style={styles.convTopRow}>
                    <Text
                      style={[styles.convName, { color: colors.text, fontWeight: unread ? "800" : "600" }]}
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    {time ? (
                      <Text style={[styles.convTime, { color: unread ? colors.accent : colors.muted }]}>
                        {time}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.convBottomRow}>
                    <Text
                      style={[
                        styles.convPreview,
                        { color: unread ? colors.subtext : colors.muted, fontWeight: unread ? "600" : "400", flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>
                    {unread && (
                      <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
                        <Text style={styles.unreadText}>
                          {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
          />
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 22, fontWeight: "800" },
  newBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  newBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptySub: { fontSize: 14, marginBottom: 20 },
  startBtn: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  startBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  listSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  convAvatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  convAvatarOfficial: { backgroundColor: "#fff" },
  convAvatarLogo: { width: "78%", height: "78%" },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  convTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  convName: { flex: 1, fontSize: 15, marginRight: 8 },
  convTime: { fontSize: 11, fontWeight: "600" },
  convBottomRow: { flexDirection: "row", alignItems: "center" },
  convPreview: { fontSize: 13 },
  convSub: { fontSize: 12, marginTop: 1 },
  unreadBadge: {
    borderRadius: 99,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginLeft: 6,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  // Modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
});
