import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ADD_FRIEND,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
} from "@ctrend/shared/graphql/friends";
import { START_DIRECT_CONVERSATION, ONLINE_USER_IDS } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

// ─── Types ────────────────────────────────────────────────────────────────────

type FriendUser = {
  id: string;
  username: string;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

type FriendRequestsData = {
  friendRequests: {
    requestedByMe: FriendUser[];
    requestedMe: FriendUser[];
  };
};

type MyFriendsData = { myFriends: FriendUser[] };
type SuggestionsData = { friendSuggestions: FriendUser[] };
type OnlineData = { onlineUserIds: string[] };
type StartDmData = { startDirectConversation: { id: string } };

type Tab = "suggestions" | "requests" | "friends";

// ─── Avatar helper ────────────────────────────────────────────────────────────

function UserAvatar({
  user,
  size = 44,
  online,
}: {
  user: FriendUser;
  size?: number;
  online?: boolean;
}) {
  const avatar = normalizeProfileImageUrl(user.profileImageUrl);
  const name = user.displayName?.trim() || user.username || "?";
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#312e81",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>
            {initial}
          </Text>
        )}
      </View>
      {online && (
        <View
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: 11,
            height: 11,
            borderRadius: 6,
            backgroundColor: "#22c55e",
            borderWidth: 2,
            borderColor: "#0a0a0a",
          }}
        />
      )}
    </View>
  );
}

// ─── Suggestions tab ──────────────────────────────────────────────────────────

function SuggestionsTab({
  search,
  colors,
  showToast,
}: {
  search: string;
  colors: ReturnType<typeof useTheme>["colors"];
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const { data, loading, refetch } = useQuery<SuggestionsData>(FRIEND_SUGGESTIONS, {
    variables: { limit: 40 },
    fetchPolicy: "cache-and-network",
  });
  const [addFriend] = useMutation(ADD_FRIEND);

  async function handleAdd(userId: string) {
    setPendingIds((prev) => new Set(prev).add(userId));
    try {
      await addFriend({ variables: { userId } });
      showToast("Friend request sent ✓", "success");
      void refetch();
    } catch {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      showToast("Failed to send request", "error");
    }
  }

  const filtered = (data?.friendSuggestions ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.displayName?.toLowerCase() ?? "").includes(q)
    );
  });

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={[styles.emptyIcon]}>🔍</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {search ? "No results" : "No suggestions right now"}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item: u }) => {
        const isPending = pendingIds.has(u.id);
        const name = u.displayName?.trim() || u.username;
        return (
          <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={() => router.push(`/profile/${u.id}` as `/${string}`)}
              style={styles.rowLeft}
            >
              <UserAvatar user={u} />
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]}>{name}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>@{u.username}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[
                styles.actionBtn,
                isPending
                  ? { backgroundColor: colors.section, borderColor: colors.border }
                  : { backgroundColor: colors.accent },
              ]}
              onPress={() => !isPending && void handleAdd(u.id)}
              disabled={isPending}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  { color: isPending ? colors.muted : "#fff" },
                ]}
              >
                {isPending ? "Pending" : "Add"}
              </Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

// ─── Requests tab ─────────────────────────────────────────────────────────────

function RequestsTab({
  search,
  colors,
  showToast,
}: {
  search: string;
  colors: ReturnType<typeof useTheme>["colors"];
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const { data, loading, refetch } = useQuery<FriendRequestsData>(FRIEND_REQUESTS, {
    fetchPolicy: "cache-and-network",
  });
  const [respond] = useMutation(RESPOND_FRIEND_REQUEST);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

  async function handleRespond(requesterId: string, accept: boolean) {
    setActingIds((prev) => new Set(prev).add(requesterId));
    try {
      await respond({ variables: { requesterId, accept } });
      showToast(accept ? "Request accepted ✓" : "Request declined", accept ? "success" : "info");
      void refetch();
    } catch {
      showToast("Action failed", "error");
    } finally {
      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(requesterId);
        return next;
      });
    }
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const incoming = (data?.friendRequests.requestedMe ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.displayName?.toLowerCase() ?? "").includes(q);
  });
  const sent = (data?.friendRequests.requestedByMe ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.displayName?.toLowerCase() ?? "").includes(q);
  });

  if (incoming.length === 0 && sent.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>No pending requests</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={[
        ...(incoming.length > 0 ? [{ _section: "Incoming" as const }] : []),
        ...incoming.map((u) => ({ ...u, _type: "incoming" as const })),
        ...(sent.length > 0 ? [{ _section: "Sent" as const }] : []),
        ...sent.map((u) => ({ ...u, _type: "sent" as const })),
      ]}
      keyExtractor={(item) =>
        "_section" in item ? `section-${item._section}` : item.id
      }
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        if ("_section" in item) {
          return (
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
              {item._section}
            </Text>
          );
        }
        const name = item.displayName?.trim() || item.username;
        const isActing = actingIds.has(item.id);
        return (
          <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={() => router.push(`/profile/${item.id}` as `/${string}`)}
              style={styles.rowLeft}
            >
              <UserAvatar user={item} />
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]}>{name}</Text>
                <Text style={[styles.rowSub, { color: colors.muted }]}>@{item.username}</Text>
              </View>
            </Pressable>
            {item._type === "incoming" ? (
              <View style={styles.twinBtns}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => !isActing && void handleRespond(item.id, true)}
                  disabled={isActing}
                >
                  {isActing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.actionBtnText, { color: "#fff" }]}>Accept</Text>
                  )}
                </Pressable>
                <Pressable
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.section, borderColor: colors.border, marginLeft: 6 },
                  ]}
                  onPress={() => !isActing && void handleRespond(item.id, false)}
                  disabled={isActing}
                >
                  <Text style={[styles.actionBtnText, { color: colors.muted }]}>Decline</Text>
                </Pressable>
              </View>
            ) : (
              <View
                style={[
                  styles.actionBtn,
                  { backgroundColor: colors.section, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.actionBtnText, { color: colors.muted }]}>Pending</Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

// ─── My Friends tab ───────────────────────────────────────────────────────────

function FriendsTab({
  search,
  colors,
  showToast,
}: {
  search: string;
  colors: ReturnType<typeof useTheme>["colors"];
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}) {
  const { data, loading, refetch } = useQuery<MyFriendsData>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network",
  });
  const { data: onlineData } = useQuery<OnlineData>(ONLINE_USER_IDS, {
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });
  const [unfriend] = useMutation(UNFRIEND);
  const [startDm] = useMutation<StartDmData>(START_DIRECT_CONVERSATION);
  const [loadingDmId, setLoadingDmId] = useState<string | null>(null);

  const onlineSet = new Set(onlineData?.onlineUserIds ?? []);

  async function handleMessage(userId: string) {
    setLoadingDmId(userId);
    try {
      const { data: dmData } = await startDm({ variables: { userId } });
      if (!dmData?.startDirectConversation) throw new Error("No conversation returned");
      router.push(`/chat/${dmData.startDirectConversation.id}` as `/${string}`);
    } catch {
      showToast("Could not open chat", "error");
    } finally {
      setLoadingDmId(null);
    }
  }

  function confirmUnfriend(user: FriendUser) {
    const name = user.displayName?.trim() || user.username;
    Alert.alert(
      "Unfriend",
      `Remove ${name} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unfriend",
          style: "destructive",
          onPress: async () => {
            try {
              await unfriend({ variables: { userId: user.id } });
              showToast(`Unfriended ${name}`, "info");
              void refetch();
            } catch {
              showToast("Failed to unfriend", "error");
            }
          },
        },
      ]
    );
  }

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const filtered = (data?.myFriends ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.displayName?.toLowerCase() ?? "").includes(q);
  });

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🤝</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          {search ? "No results" : "No friends yet — add some!"}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.listContent}
      renderItem={({ item: u }) => {
        const name = u.displayName?.trim() || u.username;
        const isOnline = onlineSet.has(u.id);
        const isLoadingDm = loadingDmId === u.id;
        return (
          <Pressable
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            onLongPress={() => confirmUnfriend(u)}
          >
            <Pressable
              onPress={() => router.push(`/profile/${u.id}` as `/${string}`)}
              style={styles.rowLeft}
            >
              <UserAvatar user={u} size={44} online={isOnline} />
              <View style={styles.rowInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.rowName, { color: colors.text }]}>{name}</Text>
                  {isOnline && (
                    <View style={styles.onlinePill}>
                      <Text style={styles.onlinePillText}>online</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.rowSub, { color: colors.muted }]}>@{u.username}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.accent }]}
              onPress={() => void handleMessage(u.id)}
              disabled={isLoadingDm}
            >
              {isLoadingDm ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.actionBtnText, { color: "#fff" }]}>Message</Text>
              )}
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("suggestions");
  const [search, setSearch] = useState("");
  const { showToast, ToastView } = useToast();

  const { data: requestsData } = useQuery<FriendRequestsData>(FRIEND_REQUESTS, {
    fetchPolicy: "cache-and-network",
  });
  const incomingCount = requestsData?.friendRequests.requestedMe.length ?? 0;

  const TABS: { key: Tab; label: string }[] = [
    { key: "suggestions", label: "Suggestions" },
    { key: "requests", label: incomingCount > 0 ? `Requests (${incomingCount})` : "Requests" },
    { key: "friends", label: "Friends" },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ToastView />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Friends</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <Text style={{ color: colors.muted, fontSize: 15, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search..."
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text style={{ color: colors.muted, fontSize: 16, paddingHorizontal: 4 }}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Tab selector */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tabItem, active && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => { setActiveTab(t.key); setSearch(""); }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: active ? colors.accent : colors.muted },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Tab content */}
      {activeTab === "suggestions" && (
        <SuggestionsTab search={search} colors={colors} showToast={showToast} />
      )}
      {activeTab === "requests" && (
        <RequestsTab search={search} colors={colors} showToast={showToast} />
      )}
      {activeTab === "friends" && (
        <FriendsTab search={search} colors={colors} showToast={showToast} />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 56, justifyContent: "center" },
  backText: { fontSize: 18, fontWeight: "600" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 15 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 15, fontWeight: "600" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  rowInfo: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowName: { fontSize: 15, fontWeight: "700" },
  rowSub: { fontSize: 12, marginTop: 1 },
  onlinePill: {
    backgroundColor: "#16a34a22",
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  onlinePillText: { color: "#22c55e", fontSize: 10, fontWeight: "700" },
  actionBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: 72,
    alignItems: "center",
  },
  actionBtnText: { fontSize: 13, fontWeight: "700" },
  twinBtns: { flexDirection: "row", alignItems: "center" },
});
