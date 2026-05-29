import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { router, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
  MY_NOTIFICATIONS,
  NEW_NOTIFICATION_SUB,
} from "@ctrend/shared/graphql/notifications";
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
  read: boolean;
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
    case "NEW_COMMENT": return "💬";
    case "COMMENT_REPLY": return "↩";
    case "COMMENT_LIKE": return "♥";
    case "POST_VOTE": return "🗳";
    case "NEW_FOLLOWER":
    case "FRIEND_REQUEST": return "👤";
    case "FRIEND_REQUEST_ACCEPTED": return "🤝";
    case "POST_WINNER": return "🏆";
    case "ADMIN_BROADCAST": return "📢";
    case "SYSTEM": return "ℹ";
    default: return "🔔";
  }
}

function navigateFromNotif(notif: GqlNotification) {
  if (!notif.referenceId) return;
  switch (notif.referenceType) {
    case "POST":
      router.push(`/post/${notif.referenceId}` as `/${string}`);
      break;
    case "USER":
      router.push(`/profile/${notif.referenceId}` as `/${string}`);
      break;
    default:
      break;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    headerBtn: { paddingHorizontal: 8 },
    headerBtnText: { fontSize: 13, color: c.accent, fontWeight: "700" },

    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowUnread: { backgroundColor: c.section },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: { fontSize: 18 },
    body: { flex: 1 },
    title: { fontSize: 14, fontWeight: "700", color: c.text, marginBottom: 2 },
    bodyText: { fontSize: 13, color: c.subtext, lineHeight: 18 },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    timeText: { fontSize: 11, color: c.muted },
    unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    emptyText: { fontSize: 15, color: c.muted, textAlign: "center" },

    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

    loadMoreBtn: {
      paddingVertical: 14,
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    loadMoreText: { fontSize: 13, color: c.accent, fontWeight: "700" },
  });
}

// ─── Notification row ─────────────────────────────────────────────────────────

type RowProps = {
  notif: GqlNotification;
  st: ReturnType<typeof makeStyles>;
  onPress: (n: GqlNotification) => void;
};

function NotifRow({ notif, st, onPress }: RowProps) {
  return (
    <Pressable
      style={[st.row, !notif.read && st.rowUnread]}
      onPress={() => onPress(notif)}
    >
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
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const st = useMemo(() => makeStyles(colors), [colors]);

  const [skip, setSkip] = useState(0);
  const [items, setItems] = useState<GqlNotification[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const { loading, refetch } = useQuery<NotifData>(MY_NOTIFICATIONS, {
    variables: { skip: 0, take: PAGE_SIZE },
    fetchPolicy: "network-only",
    onCompleted: (data) => {
      const fetched = data.myNotifications.items;
      setItems(fetched);
      setSkip(fetched.length);
      setHasMore(fetched.length < data.myNotifications.totalCount);
    },
  });

  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [markAll, { loading: markingAll }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  useSubscription(NEW_NOTIFICATION_SUB, {
    onData: ({ data }) => {
      const n = data.data?.newNotification as GqlNotification | null;
      if (n) setItems((prev) => [n, ...prev]);
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
              <TouchableOpacity
                onPress={() => void handleMarkAll()}
                style={st.headerBtn}
                disabled={markingAll}
              >
                {markingAll ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={st.headerBtnText}>Mark all read</Text>
                )}
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
          renderItem={({ item }) => <NotifRow notif={item} st={st} onPress={handlePress} />}
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
