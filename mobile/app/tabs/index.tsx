import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import { PressableScale } from "../../components/PressableScale";
import logoAsset from "../../assets/logo.png";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { MY_FRIENDS, FRIEND_SUGGESTIONS, FRIEND_REQUESTS } from "@ctrend/shared/graphql/friends";
import { ME } from "@ctrend/shared/graphql/profile";
import { UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { FeedPostCard } from "../../components/FeedPostCard";
import { CampaignBanner } from "../../components/CampaignBanner";
import { FeedCampaignFilter } from "../../components/FeedCampaignFilter";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useForceUpdateRequired } from "../../hooks/useForceUpdateRequired";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";

type FeedData = { feedPosts: unknown[] };

// Tap-to-vote coach mark persistence (industry-standard "show until first use"):
// • DONE  — set once the user actually votes → never show again.
// • SHOWN — how many sessions it has appeared in; capped so a user who never
//   votes isn't nagged forever.
const VOTE_COACH_DONE_KEY = "ctrend_vote_coach_done";
const VOTE_COACH_SHOWN_KEY = "ctrend_vote_coach_shown";
const VOTE_COACH_MAX_SHOWS = 3;

function FeedTopBar() {
  const { logout, isAuthenticated } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();

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

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
      {/* Brand */}
      <Pressable style={styles.brand} hitSlop={4}>
        <Text style={[styles.brandText, { color: colors.accentLight }]} numberOfLines={1}>Ke Jitbe</Text>
        <Image
          source={logoAsset}
          style={styles.brandLogo}
          contentFit="contain"
        />
      </Pressable>

      {/* Action icons */}
      <View style={styles.actions}>
        {/* Search — signed-in only */}
        {isAuthenticated && (
          <PressableScale style={[styles.circleBtn, { backgroundColor: colors.circleBtnBg }]} onPress={() => router.push("/search" as `/${string}`)} hitSlop={6}>
            <Ionicons name="search" size={19} color={colors.text} />
          </PressableScale>
        )}

        {/* Theme toggle */}
        <PressableScale style={[styles.circleBtn, { backgroundColor: colors.circleBtnBg }]} onPress={toggleTheme} hitSlop={6}>
          <Ionicons name={isDark ? "sunny" : "moon"} size={19} color={isDark ? "#fbbf24" : colors.text} />
        </PressableScale>

        {/* Create + Admin live in the bottom nav (Create FAB + Admin shield), so they're
            intentionally not duplicated here. */}

        {/* Notification bell — signed-in only */}
        {isAuthenticated && (
          <PressableScale style={[styles.circleBtn, styles.circleBtnBell]} hitSlop={6} onPress={() => router.push("/notifications" as `/${string}`)}>
            <Ionicons name="notifications" size={19} color="#f87171" />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
              </View>
            )}
          </PressableScale>
        )}

        {/* Logout (signed-in) / Log in (guest) */}
        {isAuthenticated ? (
          <PressableScale
            style={[styles.circleBtn, styles.circleBtnLogout]}
            onPress={() => void handleLogout()}
            hitSlop={6}
          >
            <Ionicons name="log-out-outline" size={19} color="#fca5a5" />
          </PressableScale>
        ) : (
          <PressableScale
            style={[styles.circleBtn, styles.circleBtnLogin]}
            onPress={() => router.push("/auth/login")}
            hitSlop={6}
          >
            <Ionicons name="log-in-outline" size={19} color="#fff" />
            <Text style={styles.loginLabel}>Log in</Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const TAB_BAR_H = 64 + 14; // pill height + bottom margin
const PAGE_SIZE = 20; // posts per page (matches backend `take` default)

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const client = useApolloClient();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const { needsUpdate } = useForceUpdateRequired();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const { campaign } = useLocalSearchParams<{ campaign?: string }>();
  const campaignId = campaign && campaign.length > 0 ? campaign : undefined;
  const { translateY } = useTabBar();
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);
  // Infinite scroll: guard against overlapping/needless page fetches.
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const serverCountRef = useRef(0);

  // Tap-to-vote coach mark gating. Eligible until the user has voted (DONE) or
  // it has already appeared in VOTE_COACH_MAX_SHOWS sessions. `suppressed`
  // hides it for the rest of the current session after a timeout/vote.
  const [coachStore, setCoachStore] = useState<{ done: boolean; shown: number } | null>(null);
  const [coachSuppressed, setCoachSuppressed] = useState(false);
  const coachCounted = useRef(false);
  useEffect(() => {
    let alive = true;
    Promise.all([
      AsyncStorage.getItem(VOTE_COACH_DONE_KEY),
      AsyncStorage.getItem(VOTE_COACH_SHOWN_KEY),
    ]).then(([done, shown]) => {
      if (alive) setCoachStore({ done: done === "1", shown: Number(shown) || 0 });
    });
    return () => {
      alive = false;
    };
  }, []);
  const coachEligible =
    !!coachStore && !coachStore.done && coachStore.shown < VOTE_COACH_MAX_SHOWS && !coachSuppressed;
  const dismissVoteCoach = useCallback((reason: "voted" | "timeout") => {
    setCoachSuppressed(true); // stop showing for the rest of this session
    if (reason === "voted") {
      setCoachStore((s) => (s ? { ...s, done: true } : s));
      void AsyncStorage.setItem(VOTE_COACH_DONE_KEY, "1");
    }
  }, []);

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

  const { data, loading, error, refetch, fetchMore, networkStatus } = useQuery<FeedData>(
    FEED_POSTS,
    {
      variables: { campaignId, skip: 0, take: PAGE_SIZE },
      fetchPolicy: "cache-and-network",
      notifyOnNetworkStatusChange: true,
      pollInterval: 20000,
    },
  );

  // Reset live-pushed / locally-removed posts when the campaign filter changes
  // so the filtered view doesn't show stale cross-campaign posts.
  useEffect(() => {
    setLiveQueue([]);
    setRemovedIds(new Set());
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
  }, [campaignId]);

  // Prefetch the next page well before the user hits the bottom so the feed
  // always feels like it has more — no visible "loading" at the end.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const skip = serverCountRef.current;
    if (skip === 0) return; // first page still loading
    loadingMoreRef.current = true;
    try {
      const res = await fetchMore({ variables: { campaignId, skip, take: PAGE_SIZE } });
      const total = res.data?.feedPosts?.length ?? skip;
      if (total - skip < PAGE_SIZE) hasMoreRef.current = false; // last page reached
    } catch {
      // transient failure — allow a later retry
    } finally {
      loadingMoreRef.current = false;
    }
  }, [fetchMore, campaignId]);

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

  // Server-side count drives the next page's `skip` (excludes locally-prepended
  // live-queue posts, which aren't part of the server's offset window).
  serverCountRef.current = data?.feedPosts?.length ?? 0;

  const { data: campaignsData } = useQuery<{ activeCampaigns: { id: string; fixturesEnabled?: boolean | null }[] }>(
    ACTIVE_CAMPAIGNS,
    { fetchPolicy: "cache-only" },
  );
  const activeCampaignFixtures = campaignsData?.activeCampaigns.find(
    (c) => c.id === campaignId,
  )?.fixturesEnabled ?? false;

  // Live-queue posts first, then the paged server list. Dedupe by id (offset
  // paging + live/polled inserts can briefly surface the same post twice) and
  // drop locally-removed ones.
  const seenIds = new Set<string>();
  const postsRaw: FeedPostView[] = [...liveQueue, ...apiPosts].filter((p) => {
    if (removedIds.has(p.id) || seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    return true;
  });

  // For fixture-enabled campaigns (World Cup), sort by proximity of votingEndsAt
  // to now so the live/nearest match always appears first.
  const posts: FeedPostView[] = activeCampaignFixtures
    ? [...postsRaw].sort((a, b) => {
        const now = Date.now();
        const aKey = a.votingEndsAt ? Math.abs(new Date(a.votingEndsAt).getTime() - now) : Infinity;
        const bKey = b.votingEndsAt ? Math.abs(new Date(b.votingEndsAt).getTime() - now) : Infinity;
        return aKey - bKey;
      })
    : postsRaw;

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

  // The single card that gets the coach mark: the first still-votable compare
  // post the signed-in viewer hasn't acted on yet.
  const coachPostId = useMemo(() => {
    if (!coachEligible || !isAuthenticated) return null;
    const target = posts.find(
      (p) =>
        (p.imageUrls?.length ?? 0) >= 2 &&
        p.isVotingOpen !== false &&
        p.viewerVote == null &&
        p.mySelectedOptionIndex == null,
    );
    return target?.id ?? null;
  }, [coachEligible, isAuthenticated, posts]);

  // Burn one of the capped appearances the first time it actually surfaces
  // this session (persisted, so the cap holds across launches).
  useEffect(() => {
    if (!coachPostId || !coachStore || coachCounted.current) return;
    coachCounted.current = true;
    void AsyncStorage.setItem(VOTE_COACH_SHOWN_KEY, String(coachStore.shown + 1));
  }, [coachPostId, coachStore]);

  const renderItem: ListRenderItem<FeedPostView> = ({ item }) => (
    <FeedPostCard
      post={item}
      showVoteCoachmark={item.id === coachPostId}
      onCoachmarkDismiss={dismissVoteCoach}
    />
  );
  const isRefreshing = networkStatus === 4;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <FeedTopBar />
      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error && posts.length === 0 && !needsUpdate ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Could not load feed.</Text>
          <Text style={[styles.errorSub, { color: colors.subtext }]}>
            {getApolloErrorMessage(error)}
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          extraData={coachPostId}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={[styles.list, { backgroundColor: colors.bg }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={7}
          onEndReached={() => void loadMore()}
          // ~2 screens of runway so the next page lands well before the bottom
          // (around the 15th of 20 posts), keeping the feed seamless.
          onEndReachedThreshold={2}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setLiveQueue([]); setRemovedIds(new Set()); void refetch(); }}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <>
              <FeedCampaignFilter
                selectedId={campaignId}
                onSelect={(id) => router.setParams({ campaign: id ?? "" })}
              />
              <CampaignBanner />
            </>
          }
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
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    // subtle elevation
    elevation: 4,
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  brandText: { fontSize: 20, fontWeight: "800", letterSpacing: 0.3 },
  brandLogo: { width: 24, height: 22 },
  actions: { flexDirection: "row", alignItems: "center", gap: 7 },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
  },
  circleBtnBell: { backgroundColor: "rgba(239,68,68,0.14)" },
  circleBtnLogout: { backgroundColor: "rgba(127,29,29,0.5)" },
  circleBtnLogin: {
    width: "auto",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "#ec4899",
  },
  loginLabel: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
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
