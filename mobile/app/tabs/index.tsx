import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import { Image } from "expo-image";
import { PressableScale } from "../../components/PressableScale";
import { CoinCounter } from "../../components/CoinCounter";
import headerLogoAsset from "../../assets/header-logo.png";
import headerLogoLightAsset from "../../assets/header-logo-light.png";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "../../context/TabBarContext";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS, POST_DELETED_SUB } from "@ctrend/shared/graphql/feed";
import { MY_FRIENDS, FRIEND_SUGGESTIONS, FRIEND_REQUESTS } from "@ctrend/shared/graphql/friends";
import { ME } from "@ctrend/shared/graphql/profile";
import { UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { FeedNavSearch } from "../../components/FeedNavSearch";
import { FeedPostCard } from "../../components/FeedPostCard";
import { CampaignBanner } from "../../components/CampaignBanner";
import { FeedCampaignFilter } from "../../components/FeedCampaignFilter";
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useForceUpdateRequired } from "../../hooks/useForceUpdateRequired";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { getFeedItemType } from "../../lib/feedItemLayout";

type FeedData = { feedPosts: unknown[] };

// Tap-to-vote coach mark persistence (industry-standard "show until first use"):
// • DONE  — set once the user actually votes → never show again.
// • SHOWN — how many sessions it has appeared in; capped so a user who never
//   votes isn't nagged forever.
const VOTE_COACH_DONE_KEY = "ctrend_vote_coach_done";
const VOTE_COACH_SHOWN_KEY = "ctrend_vote_coach_shown";
const VOTE_COACH_MAX_SHOWS = 3;
const TOP_NAV_ANIM_MS = 240;

function FeedTopBar({ expanded }: { expanded: boolean }) {
  const { logout, isAuthenticated } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const expandAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: TOP_NAV_ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  const paddingTopExtra = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 10],
  });
  const paddingBottom = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 14],
  });
  const paddingHorizontal = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 14],
  });
  const logoWidth = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isAuthenticated ? [72, 96] : [108, 108],
  });
  const logoHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isAuthenticated ? [22, 26] : [24, 24],
  });
  const tagOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const tagMaxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 14],
  });
  const controlsTranslateY = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  const { data: notifData } = useQuery(UNREAD_NOTIFICATION_COUNT, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const unreadCount: number = notifData?.unreadNotificationCount ?? 0;

  async function handleLogout() {
    await logout();
    router.replace("/auth/login");
  }

  return (
    <Animated.View
      style={[
        styles.topBar,
        {
          paddingTop: Animated.add(insets.top, paddingTopExtra),
          paddingBottom,
          paddingHorizontal,
          backgroundColor: colors.topbar,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.topBarRow}>
        <Pressable style={styles.brand} hitSlop={4} accessibilityLabel="Ke Jitbe">
          <View style={[styles.brandBar, styles.brandBarGradient]} />
          <View style={styles.brandBody}>
            <Animated.View style={{ width: logoWidth, height: logoHeight }}>
              <Image
                source={isDark ? headerLogoAsset : headerLogoLightAsset}
                style={styles.brandLogoFill}
                contentFit="contain"
                accessibilityLabel="Ke Jitbe"
              />
            </Animated.View>
            {isAuthenticated ? (
              <Animated.View
                style={{
                  opacity: tagOpacity,
                  maxHeight: tagMaxHeight,
                  overflow: "hidden",
                }}
              >
                <Text
                  style={[styles.brandTag, isDark ? styles.brandTagDark : styles.brandTagLight]}
                  numberOfLines={1}
                >
                  Compare · vote · vibe
                </Text>
              </Animated.View>
            ) : (
              <Text
                style={[styles.brandTag, isDark ? styles.brandTagDark : styles.brandTagLight]}
                numberOfLines={1}
              >
                Compare · vote · vibe
              </Text>
            )}
          </View>
        </Pressable>

        {isAuthenticated && (
          <Animated.View style={[styles.searchInline, { transform: [{ translateY: controlsTranslateY }] }]}>
            <FeedNavSearch expandProgress={expandAnim} />
          </Animated.View>
        )}

        <Animated.View style={[styles.actions, { transform: [{ translateY: controlsTranslateY }] }]}>
          <PressableScale style={styles.plainIconBtn} onPress={toggleTheme} hitSlop={6} accessibilityLabel="Toggle theme">
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.text} />
          </PressableScale>

          {isAuthenticated && <CoinCounter />}

          {isAuthenticated && (
            <PressableScale style={styles.plainIconBtn} hitSlop={6} onPress={() => router.push("/notifications" as `/${string}`)} accessibilityLabel="Notifications">
              <View style={styles.notifIconWrap}>
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadCount > 0 && (
                  <View style={[styles.notifBadge, { borderColor: colors.topbar }]}>
                    <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
                  </View>
                )}
              </View>
            </PressableScale>
          )}

          {isAuthenticated ? (
            <PressableScale
              style={styles.plainIconBtn}
              onPress={() => void handleLogout()}
              hitSlop={6}
              accessibilityLabel="Logout"
            >
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
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
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const MemoFeedTopBar = memo(FeedTopBar);

const TOP_NAV_EXPAND_SCROLL_Y = 48;

const TAB_BAR_H = 64 + 14; // pill height + bottom margin
const FILTER_BAR_H = 54; // fixed — avoids list padding relayout on measure
const PAGE_SIZE = 20; // posts per page (matches backend `take` default)
const CHROME_SCROLL_THRESHOLD = 56; // accumulate dy before toggling chrome
const CHROME_THROTTLE_MS = 120;
const FEED_ITEM_EST_HEIGHT = 580; // average card height for FlashList recycling

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const client = useApolloClient();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const { needsUpdate } = useForceUpdateRequired();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const feedFilter = filterParam && filterParam.length > 0 ? filterParam : "all";
  const { translateY } = useTabBar();
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);
  const tabBarAnimating = useRef(false);
  const filterVisible = useRef(true);
  const filterAnimating = useRef(false);
  const filterBarHeightRef = useRef(FILTER_BAR_H);
  const scrollAccumRef = useRef(0);
  const insetsBottomRef = useRef(insets.bottom);
  const chromeThrottleRef = useRef(0);
  const [topNavExpanded, setTopNavExpanded] = useState(true);
  insetsBottomRef.current = insets.bottom;

  // Direction-based filter animation — same as bottom nav:
  // scroll DOWN → filter hides, scroll UP → filter shows.
  const filterTranslateY = useRef(new Animated.Value(0)).current;
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

  const applyChrome = useCallback((scrollingDown: boolean, y: number) => {
    if (y < TOP_NAV_EXPAND_SCROLL_Y) {
      setTopNavExpanded(true);
    } else if (scrollingDown) {
      setTopNavExpanded(false);
    }

    if (y < 60) {
      scrollAccumRef.current = 0;
      if (!tabBarVisible.current) {
        tabBarVisible.current = true;
        tabBarAnimating.current = true;
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          tabBarAnimating.current = false;
        });
      }
      if (!filterVisible.current) {
        filterVisible.current = true;
        filterAnimating.current = false;
        Animated.timing(filterTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
      return;
    }

    const bottomOffset = TAB_BAR_H + insetsBottomRef.current;
    const filterOffset = filterBarHeightRef.current;

    if (scrollingDown) {
      if (tabBarVisible.current && !tabBarAnimating.current) {
        tabBarVisible.current = false;
        tabBarAnimating.current = true;
        Animated.timing(translateY, { toValue: bottomOffset, duration: 200, useNativeDriver: true }).start(() => {
          tabBarAnimating.current = false;
        });
      }
      if (filterVisible.current && !filterAnimating.current) {
        filterVisible.current = false;
        filterAnimating.current = true;
        Animated.timing(filterTranslateY, { toValue: -filterOffset, duration: 200, useNativeDriver: true }).start(() => {
          filterAnimating.current = false;
        });
      }
      return;
    }

    if (!tabBarVisible.current && !tabBarAnimating.current) {
      tabBarVisible.current = true;
      tabBarAnimating.current = true;
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        tabBarAnimating.current = false;
      });
    }
    if (!filterVisible.current && !filterAnimating.current) {
      filterVisible.current = true;
      filterAnimating.current = true;
      Animated.timing(filterTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        filterAnimating.current = false;
      });
    }
  }, [filterTranslateY, translateY]);

  const handleScrollEnd = useCallback(() => {
    if (Math.abs(scrollAccumRef.current) >= CHROME_SCROLL_THRESHOLD) {
      applyChrome(scrollAccumRef.current > 0, lastScrollY.current);
      scrollAccumRef.current = 0;
    }
  }, [applyChrome]);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    scrollAccumRef.current += diff;

    if (y < 60) {
      applyChrome(false, y);
      scrollAccumRef.current = 0;
      return;
    }

    const now = Date.now();
    if (
      Math.abs(scrollAccumRef.current) >= CHROME_SCROLL_THRESHOLD &&
      now - chromeThrottleRef.current >= CHROME_THROTTLE_MS
    ) {
      chromeThrottleRef.current = now;
      const scrollingDown = scrollAccumRef.current > 0;
      scrollAccumRef.current = 0;
      applyChrome(scrollingDown, y);
    }
  }

  const feedQueryVars = useMemo(() => {
    const campaignId = feedFilter.startsWith("campaign:")
      ? feedFilter.slice("campaign:".length)
      : null;
    const rawFilter = feedFilter === "all"
      ? null
      : feedFilter.startsWith("campaign:")
        ? "campaign"
        : feedFilter;
    const postFilter = rawFilter ? rawFilter.toUpperCase() : null;
    return { campaignId, postFilter, skip: 0, take: PAGE_SIZE };
  }, [feedFilter]);

  type CampaignRow = { id: string; name: string };
  const { data: campaignsData } = useQuery<{ activeCampaigns: CampaignRow[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network",
  });

  const { data, loading, error, refetch, fetchMore, networkStatus } = useQuery<FeedData>(
    FEED_POSTS,
    {
      variables: feedQueryVars,
      fetchPolicy: "cache-and-network",
      notifyOnNetworkStatusChange: true,
    },
  );

  // Reset live-pushed / locally-removed posts when the feed filter changes
  // so the filtered view doesn't show stale cross-filter posts.
  useEffect(() => {
    setLiveQueue([]);
    setRemovedIds(new Set());
    hasMoreRef.current = true;
    loadingMoreRef.current = false;
    filterTranslateY.setValue(0);
    filterVisible.current = true;
    filterAnimating.current = false;
    lastScrollY.current = 0;
    tabBarVisible.current = true;
    tabBarAnimating.current = false;
    translateY.setValue(0);
  }, [feedFilter, filterTranslateY, translateY]);

  // Prefetch the next page well before the user hits the bottom so the feed
  // always feels like it has more — no visible "loading" at the end.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const skip = serverCountRef.current;
    if (skip === 0) return; // first page still loading
    loadingMoreRef.current = true;
    try {
      await fetchMore({ variables: { ...feedQueryVars, skip } });
      // `fetchMore`'s return value is ambiguous (incremental page vs. merged
      // list), so read the merged length straight from the cache and stop only
      // when it didn't grow past `skip` (the pre-fetch length). Fail open: if the
      // read is unavailable, keep paginating rather than stopping early.
      let mergedLen: number | undefined;
      try {
        const cached = client.readQuery<FeedData>({
          query: FEED_POSTS,
          variables: feedQueryVars,
        });
        mergedLen = cached?.feedPosts?.length;
      } catch {
        mergedLen = undefined;
      }
      if (typeof mergedLen === "number" && mergedLen <= skip) {
        hasMoreRef.current = false; // didn't grow → last page
      }
    } catch {
      // transient failure — allow a later retry
    } finally {
      loadingMoreRef.current = false;
    }
  }, [fetchMore, feedQueryVars, client]);

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


  const posts = useMemo(() => {
    const seenIds = new Set<string>();
    return [...liveQueue, ...apiPosts].filter((p) => {
      if (removedIds.has(p.id) || seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });
  }, [liveQueue, apiPosts, removedIds]);

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    skip: !isAuthenticated,
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
    skip: !isAuthenticated,
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

  const listHeader = useMemo(() => <CampaignBanner />, []);
  const keyExtractor = useCallback((item: FeedPostView) => item.id, []);

  const renderItem: ListRenderItem<FeedPostView> = useCallback(({ item }) => (
    <FeedPostCard
      post={item}
      showVoteCoachmark={item.id === coachPostId}
      onCoachmarkDismiss={dismissVoteCoach}
    />
  ), [coachPostId, dismissVoteCoach]);
  const isRefreshing = networkStatus === 4;

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg }]}>
      <MemoFeedTopBar expanded={topNavExpanded} />
      <View style={styles.feedArea}>
        {/* Filter bar is absolutely positioned so native-driver animation
            doesn't cause layout shifts in the FlatList below */}
        <Animated.View
          style={[
            styles.filterBarAbsolute,
            { transform: [{ translateY: filterTranslateY }], backgroundColor: colors.topbar },
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (Math.abs(h - filterBarHeightRef.current) > 2) {
              filterBarHeightRef.current = h;
            }
          }}
        >
          <FeedCampaignFilter
            activeFilter={feedFilter}
            onFilterChange={(f) => router.setParams({ filter: f === "all" ? "" : f })}
            campaignOptions={campaignsData?.activeCampaigns}
          />
        </Animated.View>
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
        <FlashList
          data={posts}
          extraData={coachPostId}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          estimatedItemSize={FEED_ITEM_EST_HEIGHT}
          getItemType={getFeedItemType}
          removeClippedSubviews={Platform.OS === "android"}
          // Let taps reach cards while the keyboard is open (e.g. submitting a
          // score prediction) instead of the first tap only dismissing it.
          keyboardShouldPersistTaps="handled"
          style={[styles.list, { backgroundColor: colors.bg }]}
          contentContainerStyle={{ paddingTop: FILTER_BAR_H + 8, paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          drawDistance={1000}
          decelerationRate="normal"
          overScrollMode="never"
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.6}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setLiveQueue([]); setRemovedIds(new Set()); void refetch(); }}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  {feedFilter === "platform"
                    ? "No platform posts yet"
                    : feedFilter === "community"
                      ? "No community posts yet"
                      : feedFilter === "friend"
                        ? "No friend posts yet"
                        : "Nothing here yet"}
                </Text>
                <Text style={[styles.emptySub, { color: colors.subtext }]}>
                  {feedFilter === "platform"
                    ? "Official polls, campaigns, and announcements from Ke Jitbe will show up here."
                    : feedFilter === "community"
                      ? "Global broadcasts plus posts from you and people you follow appear here."
                      : feedFilter === "friend"
                        ? "Posts from you and people you follow — without global broadcasts — show here."
                        : "Follow people to see posts here."}
                </Text>
              </View>
            ) : null
          }
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  feedArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  filterBarAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === "android"
      ? { elevation: 0 }
      : {
          elevation: 4,
          shadowColor: "#6366f1",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        }),
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  searchInline: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 0,
    gap: 8,
  },
  brandBar: {
    width: 3,
    borderRadius: 999,
    marginVertical: 2,
  },
  brandBarGradient: {
    backgroundColor: "#9b5de5",
  },
  brandBody: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
  },
  brandLogoFill: { width: "100%", height: "100%" },
  brandTag: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  brandTagLight: { color: "#6d28d9" },
  brandTagDark: { color: "#c4b5fd" },
  actions: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  plainIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  circleBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
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
  notifIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -6,
    right: -7,
    backgroundColor: "#e11d48",
    borderRadius: 7,
    borderWidth: 1.5,
    minWidth: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  notifBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", lineHeight: 10 },
  list: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, fontWeight: "700", color: "#ef4444", marginBottom: 8 },
  errorSub: { fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
  empty: { padding: 32, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: "center" },
});
