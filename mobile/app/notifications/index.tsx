import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ARCHIVE_NOTIFICATION,
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
  MY_NOTIFICATIONS,
  NEW_NOTIFICATION_SUB,
} from "@ctrend/shared/graphql/notifications";
import {
  FRIEND_SOCIAL_REFETCH_QUERIES,
  RESPOND_FRIEND_REQUEST,
} from "@ctrend/shared/graphql/friends";
import {
  friendRequestAcceptedPatch,
  friendRequestAlreadyFriendsPatch,
  friendRequestRejectedPatch,
  isPendingFriendRequestNotification,
} from "@ctrend/shared/lib/friendRequestNotification";
import { MY_FRIENDS } from "@ctrend/shared/graphql/friends";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { useTheme } from "../../context/ThemeContext";
import type { ColorPalette } from "../../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type GqlNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId: string | null;
  referenceType: string | null;
  postId: string | null;
  actorCount: number | null;
  latestActorId: string | null;
  latestActorName: string | null;
  read: boolean;
  archived?: boolean;
  createdAt: string;
};

type NotifData = {
  myNotifications: {
    items: GqlNotification[];
    totalCount: number;
    unreadCount: number;
  };
};

// ─── Icon mapping ─────────────────────────────────────────────────────────────

function notifIcon(type: string): string {
  switch (type) {
    case "NEW_COMMENT":
    case "POST_COMMENT": return "💬";
    case "COMMENT_REPLY": return "↩️";
    case "COMMENT_REACTION": return "😊";
    case "COMMENT_LIKE": return "♥";
    case "POST_HYPE": return "❤️";
    case "NEW_POST_FRIEND": return "✨";
    case "POST_VOTE": return "🗳";
    case "NEW_FOLLOWER":
    case "FRIEND_REQUEST": return "👋";
    case "FRIEND_REQUEST_ACCEPTED": return "🤝";
    case "POST_WINNER": return "🏆";
    case "ANNOUNCEMENT":
    case "ADMIN_BROADCAST": return "📢";
    case "SYSTEM": return "ℹ";
    default: return "🔔";
  }
}

const POST_NOTIF_TYPES = new Set([
  "POST_HYPE", "POST_COMMENT", "NEW_POST_FRIEND",
  "COMMENT_REPLY", "COMMENT_REACTION", "NEW_COMMENT",
]);

function navigateFromNotif(notif: GqlNotification) {
  if (POST_NOTIF_TYPES.has(notif.type)) {
    const targetId = notif.postId ?? notif.referenceId;
    if (targetId) router.push(`/post/${targetId}` as `/${string}`);
    return;
  }
  if (notif.type === "FRIEND_REQUEST" || notif.type === "FRIEND_REQUEST_ACCEPTED" || notif.type === "NEW_FOLLOWER") {
    if (notif.referenceId) router.push(`/profile/${notif.referenceId}` as `/${string}`);
    return;
  }
  if (!notif.referenceId) return;
  if (notif.referenceType === "Post" || notif.referenceType === "POST") {
    router.push(`/post/${notif.referenceId}` as `/${string}`);
  } else if (notif.referenceType === "User" || notif.referenceType === "USER") {
    router.push(`/profile/${notif.referenceId}` as `/${string}`);
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    headerBtn: { paddingHorizontal: 8 },
    headerBtnText: { fontSize: 13, color: c.accent, fontWeight: "700" },

    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowUnread: { backgroundColor: c.section },
    rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    iconWrap: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
      alignItems: "center", justifyContent: "center",
    },
    iconText: { fontSize: 18 },
    body: { flex: 1 },
    title: { fontSize: 14, fontWeight: "700", color: c.text, marginBottom: 2 },
    bodyText: { fontSize: 13, color: c.subtext, lineHeight: 18 },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    timeText: { fontSize: 11, color: c.muted },
    unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },

    // Friend-request inline actions
    friendActions: {
      flexDirection: "row", gap: 8, marginTop: 10, marginLeft: 52,
    },
    friendBtn: {
      flex: 1, paddingVertical: 7, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
      borderWidth: 1,
    },
    friendBtnAccept: { backgroundColor: "#22c55e", borderColor: "#22c55e" },
    friendBtnReject: { backgroundColor: "transparent", borderColor: c.border },
    friendBtnView: { backgroundColor: "transparent", borderColor: c.border },
    friendBtnText: { fontSize: 12, fontWeight: "700" },
    friendBtnTextAccept: { color: "#fff" },
    friendBtnTextReject: { color: c.subtext },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    emptyText: { fontSize: 15, color: c.muted, textAlign: "center" },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    loadMoreBtn: {
      paddingVertical: 14, alignItems: "center",
      borderTopWidth: 1, borderTopColor: c.border,
    },
    loadMoreText: { fontSize: 13, color: c.accent, fontWeight: "700" },

    toolRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
      marginLeft: 52,
    },
    toolBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}

// ─── Notification row ─────────────────────────────────────────────────────────

type RowProps = {
  notif: GqlNotification;
  st: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  actionLoadingIds: Set<string>;
  friendIdSet: Set<string>;
  onPress: (n: GqlNotification) => void;
  onMarkRead: (notif: GqlNotification) => void;
  onArchive: (notif: GqlNotification) => void;
  onAccept: (notif: GqlNotification) => void;
  onReject: (notif: GqlNotification) => void;
};

function NotifRow({
  notif,
  st,
  colors,
  actionLoadingIds,
  friendIdSet,
  onPress,
  onMarkRead,
  onArchive,
  onAccept,
  onReject,
}: RowProps) {
  const isLoading = actionLoadingIds.has(notif.id);
  const alreadyFriends =
    notif.type === "FRIEND_REQUEST" &&
    !!notif.referenceId &&
    friendIdSet.has(notif.referenceId);
  const showFriendActions =
    isPendingFriendRequestNotification(notif) && !!notif.referenceId && !alreadyFriends;

  return (
    <Pressable style={[st.row, !notif.read && st.rowUnread]} onPress={() => onPress(notif)}>
      <View style={st.rowTop}>
        <View style={st.iconWrap}>
          <Text style={st.iconText}>{notifIcon(notif.type)}</Text>
        </View>
        <View style={st.body}>
          <Text style={st.title} numberOfLines={1}>{notif.title}</Text>
          <Text style={st.bodyText} numberOfLines={2}>{notif.body}</Text>
          <View style={st.timeRow}>
            {!notif.read && <View style={st.unreadDot} />}
            <Text style={st.timeText}>{formatRelativeTime(notif.createdAt)}</Text>
          </View>
        </View>
      </View>

      <View style={st.toolRow}>
        {!notif.read ? (
          <Pressable
            style={st.toolBtn}
            accessibilityLabel="Mark as read"
            accessibilityRole="button"
            onPress={(e) => {
              e.stopPropagation?.();
              onMarkRead(notif);
            }}
          >
            <Feather name="check" size={16} color={colors.subtext} />
          </Pressable>
        ) : null}
        <Pressable
          style={st.toolBtn}
          accessibilityLabel="Archive"
          accessibilityRole="button"
          onPress={(e) => {
            e.stopPropagation?.();
            onArchive(notif);
          }}
        >
          <Feather name="archive" size={16} color={colors.subtext} />
        </Pressable>
      </View>

      {showFriendActions && (
        <View style={st.friendActions}>
          <Pressable
            style={[st.friendBtn, st.friendBtnAccept, isLoading && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); onAccept(notif); }}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[st.friendBtnText, st.friendBtnTextAccept]}>Accept</Text>
            }
          </Pressable>
          <Pressable
            style={[st.friendBtn, st.friendBtnReject, isLoading && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); onReject(notif); }}
            disabled={isLoading}
          >
            <Text style={[st.friendBtnText, st.friendBtnTextReject]}>Reject</Text>
          </Pressable>
          <Pressable
            style={[st.friendBtn, st.friendBtnView]}
            onPress={(e) => { e.stopPropagation?.(); if (notif.referenceId) router.push(`/profile/${notif.referenceId}` as `/${string}`); }}
          >
            <Text style={[st.friendBtnText, st.friendBtnTextReject]}>View</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);

  // Clear app icon badge when user opens the notifications screen
  useEffect(() => {
    void Notifications.setBadgeCountAsync(0);
  }, []);

  const [skip, setSkip] = useState(0);
  const [items, setItems] = useState<GqlNotification[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());

  const { data: friendsData } = useQuery<{ myFriends: Array<{ id: string }> }>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network",
  });

  const friendIdSet = useMemo(
    () => new Set((friendsData?.myFriends ?? []).map((f) => f.id)),
    [friendsData],
  );

  const { loading, refetch } = useQuery<NotifData>(MY_NOTIFICATIONS, {
    variables: { skip: 0, take: PAGE_SIZE },
    fetchPolicy: "network-only",
    pollInterval: 25000,
    onCompleted: (data) => {
      const fetched = data.myNotifications.items.filter((n) => !n.archived);
      setItems(fetched);
      setSkip(fetched.length);
      setHasMore(fetched.length < data.myNotifications.totalCount);
    },
  });

  useEffect(() => {
    setItems((prev) =>
      prev.map((n) => {
        if (
          !isPendingFriendRequestNotification(n) ||
          !n.referenceId ||
          !friendIdSet.has(n.referenceId)
        ) {
          return n;
        }
        return { ...n, ...friendRequestAlreadyFriendsPatch(n) };
      }),
    );
  }, [friendIdSet]);

  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [archiveNotif] = useMutation(ARCHIVE_NOTIFICATION);
  const [markAll, { loading: markingAll }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);
  const [respondMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });

  // Sound is played by the global subscription in _layout.tsx — only update list here.
  useSubscription(NEW_NOTIFICATION_SUB, {
    onData: ({ data }) => {
      const n = data.data?.newNotification as GqlNotification | null;
      if (!n || n.archived) return;
      setItems((prev) => {
        const exists = prev.some((x) => x.id === n.id);
        if (exists) {
          return [n, ...prev.filter((x) => x.id !== n.id)];
        }
        return [n, ...prev];
      });
    },
  });

  const handlePress = useCallback(
    async (notif: GqlNotification) => {
      if (!notif.read) {
        setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
        try { await markRead({ variables: { id: notif.id } }); } catch { /* silent */ }
      }
      navigateFromNotif(notif);
    },
    [markRead],
  );

  const handleMarkRead = useCallback(
    (notif: GqlNotification) => {
      if (notif.read) return;
      setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      void markRead({ variables: { id: notif.id } });
    },
    [markRead],
  );

  const handleArchive = useCallback(
    (notif: GqlNotification) => {
      setItems((prev) => prev.filter((n) => n.id !== notif.id));
      void archiveNotif({ variables: { id: notif.id } });
    },
    [archiveNotif],
  );

  const handleAccept = useCallback(async (notif: GqlNotification) => {
    if (!notif.referenceId) return;
    const rollback = { title: notif.title, body: notif.body, read: notif.read };
    setItems((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, ...friendRequestAcceptedPatch(n) } : n)),
    );
    setActionLoadingIds((prev) => new Set([...prev, notif.id]));
    try {
      await respondMut({ variables: { requesterId: notif.referenceId, accept: true } });
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, ...rollback } : n)),
      );
    } finally {
      setActionLoadingIds((prev) => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  }, [respondMut]);

  const handleReject = useCallback(async (notif: GqlNotification) => {
    if (!notif.referenceId) return;
    const rollback = { title: notif.title, body: notif.body, read: notif.read };
    setItems((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, ...friendRequestRejectedPatch(n) } : n)),
    );
    setActionLoadingIds((prev) => new Set([...prev, notif.id]));
    try {
      await respondMut({ variables: { requesterId: notif.referenceId, accept: false } });
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, ...rollback } : n)),
      );
    } finally {
      setActionLoadingIds((prev) => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  }, [respondMut]);

  async function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await markAll(); } catch { /* silent */ }
  }

  async function loadMore() {
    try {
      const { data } = await refetch({ skip, take: PAGE_SIZE });
      const fetched = data.myNotifications.items;
      setItems((prev) => [...prev, ...fetched]);
      setSkip((s) => s + fetched.length);
      setHasMore(items.length + fetched.length < data.myNotifications.totalCount);
    } catch { /* silent */ }
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <View style={[st.flex, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Notifications",
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text },
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={st.headerBtn}>
              <Text style={st.headerBtnText}>← Back</Text>
            </TouchableOpacity>
          ),
          headerRight: () =>
            unreadCount > 0 ? (
              <TouchableOpacity onPress={() => void handleMarkAll()} style={st.headerBtn} disabled={markingAll}>
                {markingAll
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={st.headerBtnText}>Mark all read</Text>
                }
              </TouchableOpacity>
            ) : null,
        }}
      />

      {loading && items.length === 0 ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={st.emptyWrap}>
          <Text style={st.emptyText}>No notifications yet.{"\n"}Check back later!</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotifRow
              notif={item}
              st={st}
              colors={colors}
              actionLoadingIds={actionLoadingIds}
              friendIdSet={friendIdSet}
              onPress={handlePress}
              onMarkRead={handleMarkRead}
              onArchive={handleArchive}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable style={st.loadMoreBtn} onPress={() => void loadMore()}>
                <Text style={st.loadMoreText}>Load more</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}
