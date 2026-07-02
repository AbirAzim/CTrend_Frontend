import AsyncStorage from "@react-native-async-storage/async-storage";
import { useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "../../context/TabBarContext";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS, POST_DELETED_SUB } from "@ctrend/shared/graphql/feed";
import { MY_FRIENDS, FRIEND_SUGGESTIONS, FRIEND_REQUESTS } from "@ctrend/shared/graphql/friends";
import { ME } from "@ctrend/shared/graphql/profile";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { FeedTopBar } from "../../components/FeedTopBar";
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

const CHROME_AT_TOP_ENTER_Y = 32;
const CHROME_AT_TOP_EXIT_Y = 100;

const TAB_BAR_H = 64 + 14; // pill height + bottom margin
const FILTER_BAR_H = 48;
const PAGE_SIZE = 20;
/** Start fetching the next server page when this many items remain below the viewport. */
const PREFETCH_ITEMS_AHEAD = 8;
/** FlashList: trigger onEndReached this many screen-heights before the list end. */
const END_REACHED_THRESHOLD = 3;
const CHROME_SCROLL_THRESHOLD = 56;
const CHROME_THROTTLE_MS = 120;
const FEED_ITEM_EST_HEIGHT = 580;

const ReanimatedFlashList = Animated.createAnimatedComponent(FlashList);

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
  const scrollAccumRef = useRef(0);
  const insetsBottomRef = useRef(insets.bottom);
  const chromeThrottleRef = useRef(0);
  const atTopRef = useRef(true);
  const scrollY = useSharedValue(0);
  const filterProgress = useSharedValue(1);
  insetsBottomRef.current = insets.bottom;

  const filterBarStyle = useAnimatedStyle(() => ({
    height: FILTER_BAR_H * filterProgress.value,
    opacity: filterProgress.value,
    overflow: "hidden" as const,
  }));

  // Direction-based chrome: scroll DOWN → filter + bottom tab hide; scroll UP → show.
  // Infinite scroll: guard against overlapping/needless page fetches.
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const serverCountRef = useRef(0);
  const postsLengthRef = useRef(0);

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

  const finishFilterAnim = useCallback(() => {
    filterAnimating.current = false;
  }, []);

  const showChrome = useCallback(() => {
    if (!tabBarVisible.current) {
      tabBarVisible.current = true;
      tabBarAnimating.current = true;
      RNAnimated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        tabBarAnimating.current = false;
      });
    }
    if (!filterVisible.current) {
      filterVisible.current = true;
      filterAnimating.current = false;
      filterProgress.value = withTiming(1, { duration: 180 });
    }
  }, [filterProgress, translateY]);

  const applyChrome = useCallback((scrollingDown: boolean) => {
    if (atTopRef.current) {
      showChrome();
      return;
    }

    const bottomOffset = TAB_BAR_H + insetsBottomRef.current;

    if (scrollingDown) {
      if (tabBarVisible.current && !tabBarAnimating.current) {
        tabBarVisible.current = false;
        tabBarAnimating.current = true;
        RNAnimated.timing(translateY, { toValue: bottomOffset, duration: 200, useNativeDriver: true }).start(() => {
          tabBarAnimating.current = false;
        });
      }
      if (filterVisible.current && !filterAnimating.current) {
        filterVisible.current = false;
        filterAnimating.current = true;
        filterProgress.value = withTiming(0, { duration: 180 }, (done) => {
          if (done) runOnJS(finishFilterAnim)();
        });
      }
      return;
    }

    showChrome();
  }, [filterProgress, finishFilterAnim, showChrome, translateY]);

  const handleScrollEnd = useCallback(() => {
    if (Math.abs(scrollAccumRef.current) >= CHROME_SCROLL_THRESHOLD) {
      applyChrome(scrollAccumRef.current > 0);
      scrollAccumRef.current = 0;
    }
  }, [applyChrome]);

  const handleScrollJS = useCallback((y: number) => {
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    scrollAccumRef.current += diff;

    if (y < CHROME_AT_TOP_ENTER_Y) {
      atTopRef.current = true;
    } else if (y > CHROME_AT_TOP_EXIT_Y) {
      atTopRef.current = false;
    }

    if (diff < -8 && !filterVisible.current) {
      showChrome();
    }

    if (atTopRef.current) {
      showChrome();
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
      applyChrome(scrollingDown);
    }
  }, [applyChrome, showChrome]);

  const onFeedScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      runOnJS(handleScrollJS)(e.contentOffset.y);
    },
  });

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
    atTopRef.current = true;
    lastScrollY.current = 0;
    scrollY.value = 0;
    filterProgress.value = 1;
    filterVisible.current = true;
    filterAnimating.current = false;
    tabBarVisible.current = true;
    tabBarAnimating.current = false;
    translateY.setValue(0);
  }, [feedFilter, filterProgress, scrollY, translateY]);

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

  const loadMoreFnRef = useRef(loadMore);
  loadMoreFnRef.current = loadMore;

  const maybePrefetchMore = useCallback(() => {
    void loadMoreFnRef.current();
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (!viewableItems.length) return;
      let maxIndex = 0;
      for (const token of viewableItems) {
        if (token.index != null && token.index > maxIndex) maxIndex = token.index;
      }
      const remaining = postsLengthRef.current - 1 - maxIndex;
      if (remaining <= PREFETCH_ITEMS_AHEAD) {
        void loadMoreFnRef.current();
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 15 }).current;

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

  postsLengthRef.current = posts.length;

  // Prefetch page 2 as soon as page 1 lands so the user rarely waits at the bottom.
  useEffect(() => {
    const serverCount = data?.feedPosts?.length ?? 0;
    if (serverCount < PAGE_SIZE || !hasMoreRef.current || loadingMoreRef.current) return;
    void loadMoreFnRef.current();
  }, [data?.feedPosts?.length]);

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
      <FeedTopBar scrollY={scrollY} />
      <View style={styles.feedArea}>
        <Animated.View
          style={[
            filterBarStyle,
            styles.filterBar,
            { backgroundColor: colors.topbar, borderBottomColor: colors.border },
          ]}
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
        <ReanimatedFlashList
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
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
          onScroll={onFeedScroll}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          drawDistance={1600}
          decelerationRate="normal"
          overScrollMode="never"
          onEndReached={maybePrefetchMore}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
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
  feedArea: { flex: 1 },
  filterBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, fontWeight: "700", color: "#ef4444", marginBottom: 8 },
  errorSub: { fontSize: 13, textAlign: "center", paddingHorizontal: 24 },
  empty: { padding: 32, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: "center" },
});
