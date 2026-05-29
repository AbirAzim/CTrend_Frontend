import { useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS } from "@ctrend/shared/graphql/feed";
import { UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { FeedPostCard } from "../../components/FeedPostCard";
import { CampaignBanner } from "../../components/CampaignBanner";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

type FeedData = { feedPosts: unknown[] };

function FeedTopBar() {
  const { logout, isAuthenticated, user } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const isAdmin = user?.role?.toLowerCase() === "admin";

  const { data: notifData } = useQuery(UNREAD_NOTIFICATION_COUNT, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });
  const unreadCount: number = notifData?.unreadNotificationCount ?? 0;

  async function handleLogout() {
    await logout();
    router.replace("/auth/login");
  }

  function handleAdmin() {
    Alert.alert("Admin Panel", "Admin management is available on the web app at kejitbe.app/admin");
  }

  return (
    <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
      {/* Brand */}
      <Pressable style={styles.brand} hitSlop={4}>
        <Text style={[styles.brandText, { color: colors.accentLight }]}>Ke Jitbe</Text>
        <Image
          source={require("../../assets/logo.png")}
          style={styles.brandLogo}
          contentFit="contain"
        />
      </Pressable>

      {/* Action icons */}
      <View style={styles.actions}>
        {/* Theme toggle */}
        <Pressable style={[styles.circleBtn, { backgroundColor: colors.circleBtnBg }]} onPress={toggleTheme} hitSlop={6}>
          <Text style={styles.iconSymbol}>{isDark ? "✶" : "🌙"}</Text>
        </Pressable>

        {/* Admin — only for admin role */}
        {isAdmin && (
          <Pressable style={[styles.rectBtn, styles.rectBtnAdmin]} onPress={handleAdmin} hitSlop={6}>
            <Text style={styles.rectBtnSymbol}>⚙</Text>
          </Pressable>
        )}

        {/* Create new post */}
        <Pressable
          style={[styles.rectBtn, styles.rectBtnCreate]}
          onPress={() => router.push("/tabs/create" as `/${string}`)}
          hitSlop={6}
        >
          <Text style={styles.rectBtnSymbol}>✦</Text>
        </Pressable>

        {/* Notification bell */}
        <Pressable style={[styles.circleBtn, styles.circleBtnBell]} hitSlop={6} onPress={() => router.push("/notifications" as `/${string}`)}>

          <Text style={styles.bellSymbol}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
            </View>
          )}
        </Pressable>

        {/* Logout */}
        {isAuthenticated && (
          <Pressable
            style={[styles.circleBtn, styles.circleBtnLogout]}
            onPress={() => void handleLogout()}
            hitSlop={6}
          >
            <Text style={styles.logoutSymbol}>→</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const client = useApolloClient();
  const { colors } = useTheme();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);

  const { data, loading, error, refetch, networkStatus } = useQuery<FeedData>(
    FEED_POSTS,
    { fetchPolicy: "cache-and-network", notifyOnNetworkStatusChange: true },
  );

  const apiPosts: FeedPostView[] = (data?.feedPosts ?? []).map(
    (p) => mapGqlPostToFeedView(p as Parameters<typeof mapGqlPostToFeedView>[0]),
  );
  const knownIds = new Set(apiPosts.map((p) => p.id));
  const posts: FeedPostView[] = [...liveQueue.filter((p) => !knownIds.has(p.id)), ...apiPosts];

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    onData: ({ data: sub }) => {
      const postId = sub.data?.newPosts?.postId;
      if (!postId) return;
      void client
        .query({ query: GET_POST_BY_ID, variables: { id: postId }, fetchPolicy: "network-only" })
        .then(({ data: d }) => {
          const gqlPost = d?.getPostById;
          if (!gqlPost) return;
          setLiveQueue((prev) => {
            if (prev.some((p) => p.id === postId)) return prev;
            return [mapGqlPostToFeedView(gqlPost), ...prev];
          });
        })
        .catch(() => {});
    },
  });

  const renderItem: ListRenderItem<FeedPostView> = ({ item }) => <FeedPostCard post={item} />;
  const isRefreshing = networkStatus === 4;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <FeedTopBar />
      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error && posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load feed.</Text>
          <Text style={[styles.errorSub, { color: colors.subtext }]}>{error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={[styles.list, { backgroundColor: colors.bg }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setLiveQueue([]); void refetch(); }}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={<CampaignBanner />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Nothing here yet</Text>
                <Text style={[styles.emptySub, { color: colors.subtext }]}>Follow people to see posts here.</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandText: { fontSize: 19, fontWeight: "800", letterSpacing: 0.2 },
  brandLogo: { width: 22, height: 20 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  circleBtnBell: { backgroundColor: "#3b1515" },
  circleBtnLogout: { backgroundColor: "#7f1d1d" },
  iconSymbol: { fontSize: 16, color: "#e2e8f0" },
  bellSymbol: { fontSize: 16 },
  logoutSymbol: { fontSize: 18, color: "#fca5a5", fontWeight: "700" },
  rectBtn: {
    height: 36, paddingHorizontal: 12, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
  },
  rectBtnAdmin: { backgroundColor: "#7c3aed" },
  rectBtnCreate: { backgroundColor: "#4f46e5" },
  rectBtnSymbol: { fontSize: 16, color: "#ffffff", fontWeight: "700" },
  notifBadge: {
    position: "absolute", top: 0, right: 0,
    backgroundColor: "#ef4444", borderRadius: 8,
    minWidth: 16, height: 16,
    justifyContent: "center", alignItems: "center", paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  list: {},
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, fontWeight: "700", color: "#ef4444", marginBottom: 8 },
  errorSub: { fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
  empty: { padding: 32, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: "center" },
});
