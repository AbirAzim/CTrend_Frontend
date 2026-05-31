import { useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import logoAsset from "../../assets/logo.png";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,

  Animated,
  FlatList,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "../../context/TabBarContext";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS, POST_DELETED_SUB } from "@ctrend/shared/graphql/feed";
import { MY_FRIENDS, FRIEND_SUGGESTIONS, FRIEND_REQUESTS } from "@ctrend/shared/graphql/friends";
import { ME } from "@ctrend/shared/graphql/profile";
import { UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
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
    router.push("/admin" as `/${string}`);
  }

  return (
    <View style={[styles.topBar, { paddingTop: insets.top, backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
      {/* Brand */}
      <Pressable style={styles.brand} hitSlop={4}>
        <Text style={[styles.brandText, { color: colors.accentLight }]}>Ke Jitbe</Text>
        <Image
          source={logoAsset}
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

const TAB_BAR_H = 64 + 14; // pill height + bottom margin

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const client = useApolloClient();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const { translateY } = useTabBar();
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;

    if (y < 60) {
      // Always show near the top
      if (!tabBarVisible.current) {
        tabBarVisible.current = true;
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
      return;
    }

    if (diff > 4 && tabBarVisible.current) {
      tabBarVisible.current = false;
      Animated.timing(translateY, { toValue: TAB_BAR_H + insets.bottom, duration: 200, useNativeDriver: true }).start();
    } else if (diff < -4 && !tabBarVisible.current) {
      tabBarVisible.current = true;
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }

  const { data, loading, error, refetch, networkStatus } = useQuery<FeedData>(
    FEED_POSTS,
    { fetchPolicy: "cache-and-network", notifyOnNetworkStatusChange: true, pollInterval: 20000 },
  );

  type UserRow = { id?: string | null; username?: string | null; email?: string | null; profileImageUrl?: string | null };
  const { data: meData } = useQuery<{ me: UserRow }>(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const { data: friendsData } = useQuery<{ myFriends: UserRow[] }>(MY_FRIENDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const { data: suggestionsData } = useQuery<{ friendSuggestions: UserRow[] }>(FRIEND_SUGGESTIONS, {
    skip: !isAuthenticated,
    variables: { limit: 30 },
    fetchPolicy: "cache-and-network",
  });
  const { data: requestsData } = useQuery<{ friendRequests: { requestedByMe: UserRow[]; requestedMe: UserRow[] } }>(
    FRIEND_REQUESTS,
    { skip: !isAuthenticated, fetchPolicy: "cache-and-network" },
  );

  const apiPosts: FeedPostView[] = useMemo(() => {
    const raw = (data?.feedPosts ?? []).map(
      (p) => mapGqlPostToFeedView(p as Parameters<typeof mapGqlPostToFeedView>[0]),
    );

    const profileByUsername = new Map<string, string>();
    const profileByEmail = new Map<string, string>();
    const allKnown: UserRow[] = [
      meData?.me,
      ...(friendsData?.myFriends ?? []),
      ...(suggestionsData?.friendSuggestions ?? []),
      ...(requestsData?.friendRequests?.requestedByMe ?? []),
      ...(requestsData?.friendRequests?.requestedMe ?? []),
    ].filter(Boolean) as UserRow[];

    for (const u of allKnown) {
      const img = normalizeProfileImageUrl(u.profileImageUrl);
      if (!img) continue;
      if (u.username?.trim()) profileByUsername.set(u.username.trim().toLowerCase(), img);
      if (u.email?.trim()) profileByEmail.set(u.email.trim().toLowerCase(), img);
    }

    return raw.map((p) => {
      if (p.authorProfileImageUrl?.trim()) return p;
      const byUsername = profileByUsername.get(p.authorUsername.trim().toLowerCase());
      const byEmail = p.authorEmail ? profileByEmail.get(p.authorEmail.trim().toLowerCase()) : undefined;
      return { ...p, authorProfileImageUrl: byUsername ?? byEmail ?? null };
    });
  }, [data, meData, friendsData, suggestionsData, requestsData]);

  const knownIds = new Set(apiPosts.map((p) => p.id));
  const allPosts: FeedPostView[] = [...liveQueue.filter((p) => !knownIds.has(p.id)), ...apiPosts];
  const posts = allPosts.filter((p) => !removedIds.has(p.id));

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    onData: ({ data: sub }) => {
      const postId = sub.data?.newPosts?.postId;
      if (!postId) return;
      void refetch();
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

  useSubscription<{ postDeleted: { postId: string } }>(POST_DELETED_SUB, {
    onData: ({ data: sub }) => {
      const postId = sub.data?.postDeleted?.postId;
      if (!postId) return;
      setRemovedIds((prev) => new Set([...prev, postId]));
      void refetch();
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
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setLiveQueue([]); setRemovedIds(new Set()); void refetch(); }}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // subtle elevation
    elevation: 4,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandText: { fontSize: 20, fontWeight: "800", letterSpacing: 0.3 },
  brandLogo: { width: 24, height: 22 },
  actions: { flexDirection: "row", alignItems: "center", gap: 7 },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  circleBtnBell: { backgroundColor: "rgba(239,68,68,0.14)" },
  circleBtnLogout: { backgroundColor: "rgba(127,29,29,0.5)" },
  iconSymbol: { fontSize: 15, color: "#e2e8f0" },
  bellSymbol: { fontSize: 15 },
  logoutSymbol: { fontSize: 17, color: "#fca5a5", fontWeight: "700" },
  rectBtn: {
    height: 34, paddingHorizontal: 11, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
  },
  rectBtnAdmin: { backgroundColor: "#7c3aed" },
  rectBtnCreate: { backgroundColor: "#4f46e5" },
  rectBtnSymbol: { fontSize: 15, color: "#ffffff", fontWeight: "700" },
  notifBadge: {
    position: "absolute", top: -1, right: -1,
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
