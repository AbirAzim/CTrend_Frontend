import { useMutation, useQuery, useApolloClient } from "@apollo/client/react";
import type { DocumentNode } from "@apollo/client";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  LayoutAnimation,
  LayoutChangeEvent,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Easing, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME, MY_VOTED_POSTS, USER_POSTS, MY_CONTENT_SUMMARY } from "@ctrend/shared/graphql/profile";
import { SWITCH_ACTIVE_ROLE } from "@ctrend/shared/graphql/auth";
import { LEGAL_PAGE_URLS } from "@ctrend/shared/lib/teamCredits";
import {
  MY_FRIENDS,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  ADD_FRIEND,
  UNFRIEND,
  RESPOND_FRIEND_REQUEST,
  CANCEL_FRIEND_REQUEST,
} from "@ctrend/shared/graphql/friends";
import { MY_SAVED_POSTS, MY_SCHEDULED_POSTS, CANCEL_SCHEDULED_POST } from "@ctrend/shared/graphql/feed";
import { START_DIRECT_CONVERSATION, CONTACT_ADMIN } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { useAuth } from "../../context/AuthContext";
import { useCoinsBalance } from "../../context/CoinsContext";
import { ProfileEngagementPanel } from "../../components/ProfileEngagementPanel";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
import { FeedPostCard } from "../../components/FeedPostCard";
import { CompareIcon, MessageIcon } from "../../components/ContentIcons";

const TAB_BAR_H = 64 + 14;

// Smooth height animation when expanding/collapsing accordion sections.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type MeData = {
  me: {
    id: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
    bio?: string | null;
    role?: string | null;
    interests?: string[] | null;
  };
};

/** Raw GQL post row shape — fed through `mapGqlPostToFeedView` for `FeedPostCard` rendering. */
type GqlPostRow = Parameters<typeof mapGqlPostToFeedView>[0];

const PROFILE_PAGE_SIZE = 20;

/**
 * Lazy + infinite-scroll list for one "My Activity" tab. Only fetches once
 * `active` (the tab has been opened at least once) — mirrors the main feed's
 * offset-paging + prefetch pattern, backed by the `merge` type policy
 * registered in `mobile/lib/apolloClient.ts`.
 */
function usePaginatedProfileList(
  query: DocumentNode,
  dataKey: string,
  active: boolean,
  extraVariables: Record<string, unknown>,
  pollInterval?: number,
) {
  const client = useApolloClient();
  const loadingMoreRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const baseVariables = { ...extraVariables, skip: 0, take: PROFILE_PAGE_SIZE };

  const { data, loading, fetchMore, refetch } = useQuery<Record<string, GqlPostRow[]>>(query, {
    variables: baseVariables,
    skip: !active,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
    pollInterval: active ? pollInterval : undefined,
  });

  const rawItems = data?.[dataKey] ?? [];
  const serverCount = rawItems.length;

  useEffect(() => {
    setHasMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(extraVariables)]);

  const loadMore = useCallback(async () => {
    if (!active || loadingMoreRef.current || !hasMore || serverCount === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchMore({ variables: { ...extraVariables, skip: serverCount, take: PROFILE_PAGE_SIZE } });
      let mergedLen: number | undefined;
      try {
        const cached = client.readQuery<Record<string, GqlPostRow[]>>({ query, variables: baseVariables });
        mergedLen = cached?.[dataKey]?.length;
      } catch {
        mergedLen = undefined;
      }
      if (typeof mergedLen === "number" && mergedLen <= serverCount) {
        setHasMore(false);
      }
    } catch {
      // transient failure — allow a later retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasMore, serverCount, fetchMore, client, query, dataKey]);

  const items = rawItems.map(mapGqlPostToFeedView);

  return {
    items,
    loading: active && loading && rawItems.length === 0,
    loadingMore,
    hasMore,
    loadMore,
    refetch,
  };
}

/** Fires `onLoadMore` when a `ScrollView` is scrolled near its bottom edge. */
function handleNearBottomScroll(
  e: NativeSyntheticEvent<NativeScrollEvent>,
  onLoadMore: () => void,
) {
  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
  if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 800) {
    onLoadMore();
  }
}

function scheduledCountdown(scheduledAt?: string | null): string {
  if (!scheduledAt) return "—";
  const ms = new Date(scheduledAt).getTime() - Date.now();
  if (ms <= 0) return "Going live…";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Person = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

// ─── Person row ───────────────────────────────────────────────────────────────

function PersonRow({ person, actionLoading, colors, rightSlot }: {
  person: Person;
  actionLoading: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  rightSlot: React.ReactNode;
}) {
  const avatar = normalizeProfileImageUrl(person.profileImageUrl);
  const name = person.displayName?.trim() || person.username;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <Pressable
      style={[st.personRow, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/profile/${person.id}` as `/${string}`)}
    >
      <View style={[st.personAvatar, { overflow: "hidden" }]}>
        {avatar
          ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          : <Text style={st.personAvatarText}>{initial}</Text>
        }
      </View>
      <Text style={[st.personName, { color: colors.text, flex: 1 }]} numberOfLines={1}>{name}</Text>
      {actionLoading ? <ActivityIndicator size="small" color={colors.accent} /> : rightSlot}
    </Pressable>
  );
}

// ─── Collapsible section (accordion) ────────────────────────────────────────────

function Section({
  icon, title, subtitle, open, onToggle, colors, children, onLayout, badge,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  children: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  badge?: number;
}) {
  return (
    <View style={[st.section, { borderTopColor: colors.border }]} onLayout={onLayout}>
      <Pressable style={st.sectionHead} onPress={onToggle} android_ripple={{ color: colors.accent + "11" }}>
        <View style={[st.sectionIcon, { backgroundColor: colors.accent + "1a" }]}>
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>{title}</Text>
            {badge != null && badge > 0 ? (
              <View style={[st.sectionBadge, { backgroundColor: colors.accent }]}>
                <Text style={st.sectionBadgeText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                  {badge > 99 ? "99+" : badge}
                </Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={[st.sectionSub, { color: colors.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={[st.sectionChevron, { borderColor: colors.border, backgroundColor: open ? colors.accent + "14" : "transparent" }]}>
          <Text style={{ color: open ? colors.accent : colors.muted, fontSize: 13, fontWeight: "800" }}>
            {open ? "▾" : "▸"}
          </Text>
        </View>
      </Pressable>
      {open ? <View style={st.sectionBody}>{children}</View> : null}
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { logout, isAuthenticated, hydrated, user: storedUser, setSession } = useAuth();
  const balance = useCoinsBalance();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { translateY } = useTabBar();
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);

  const showTabBar = useCallback(() => {
    if (tabBarVisible.current) return;
    tabBarVisible.current = true;
    translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [translateY]);

  const hideTabBar = useCallback(() => {
    if (!tabBarVisible.current) return;
    tabBarVisible.current = false;
    translateY.value = withTiming(TAB_BAR_H + insets.bottom, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [translateY, insets.bottom]);

  // Direction-based show/hide, shared by the main profile scroll and every
  // "My Activity" tab list below — mirrors the feed's chrome behavior.
  function applyScrollChrome(lastYRef: { current: number }, y: number) {
    const diff = y - lastYRef.current;
    lastYRef.current = y;
    if (y < 60) {
      showTabBar();
      return;
    }
    if (diff > 4) hideTabBar();
    else if (diff < -4) showTabBar();
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    applyScrollChrome(lastScrollY, e.nativeEvent.contentOffset.y);
  }

  // Separate scroll-position ref for the overlay's tab lists — each tab is a
  // freshly-mounted ScrollView starting at offset 0, distinct from the main
  // profile page's scroll position.
  const contentLastScrollY = useRef(0);

  function handleContentScroll(e: NativeSyntheticEvent<NativeScrollEvent>, onLoadMore: () => void) {
    handleNearBottomScroll(e, onLoadMore);
    applyScrollChrome(contentLastScrollY, e.nativeEvent.contentOffset.y);
  }

  const [contentTab, setContentTab] = useState<"drops" | "scheduled" | "kept" | "voted">("drops");
  const [votedFilter, setVotedFilter] = useState<"all" | "anonymous">("all");
  const [peopleTab, setPeopleTab] = useState<"friends" | "received" | "sent" | "suggestions">("friends");
  const [search, setSearch] = useState("");
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());

  const [openContent, setOpenContent] = useState(false);
  const [openPeople, setOpenPeople] = useState(false);
  const [openLegal, setOpenLegal] = useState(false);
  const [showAllInterests, setShowAllInterests] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Only fetch a tab's list the first time it's opened — the heaviest tab
  // (Voted) no longer loads in the background before the user even asks for it.
  const [visited, setVisited] = useState<Record<"drops" | "scheduled" | "kept" | "voted", boolean>>({
    drops: false,
    scheduled: false,
    kept: false,
    voted: false,
  });
  function markVisited(tab: "drops" | "scheduled" | "kept" | "voted") {
    setVisited((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }

  const toggleContent = () => {
    setOpenContent((v) => {
      const next = !v;
      if (next) {
        markVisited(contentTab);
        contentLastScrollY.current = 0;
        showTabBar();
      }
      return next;
    });
  };
  const toggleLegal = () => { animateLayout(); setOpenLegal((v) => !v); };
  const togglePeople = () => setOpenPeople((v) => !v);

  // Android hardware back closes the full-screen section overlay.
  useEffect(() => {
    if (!openContent && !openPeople) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (openContent) { setOpenContent(false); return true; }
      if (openPeople) { setOpenPeople(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [openContent, openPeople]);

  function jumpToFriends() {
    setPeopleTab("friends");
    setOpenPeople(true);
  }

  function openContentOn(tab: "drops" | "kept" | "voted") {
    setContentTab(tab);
    setOpenContent(true);
    markVisited(tab);
    contentLastScrollY.current = 0;
    showTabBar();
  }

  const setLoading = (id: string, on: boolean) =>
    setActionLoadingIds((prev) => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });

  const { data: meData, loading: meLoading } = useQuery<MeData>(ME, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated,
  });
  const me = meData?.me;
  const isAdmin = (me?.role ?? storedUser?.role)?.toLowerCase() === "admin";

  // Cheap counts for the stat pills + tab badges — no post hydration, so the
  // profile screen never waits on the heavy per-tab lists.
  const { data: summaryData } = useQuery<{ myContentSummary: {
    dropsCount: number; scheduledCount: number; keptCount: number; votedCount: number; totalVotesOnMyPosts: number;
  } }>(MY_CONTENT_SUMMARY, { fetchPolicy: "cache-and-network", skip: !isAuthenticated });
  const summary = summaryData?.myContentSummary;

  const drops = usePaginatedProfileList(USER_POSTS, "getPostsByUser", visited.drops && !!me?.id, { userId: me?.id });
  const kept = usePaginatedProfileList(MY_SAVED_POSTS, "mySavedPosts", visited.kept, {});
  const voted = usePaginatedProfileList(MY_VOTED_POSTS, "myVotedPosts", visited.voted, {
    anonymousOnly: votedFilter === "anonymous",
  });
  const scheduled = usePaginatedProfileList(MY_SCHEDULED_POSTS, "myScheduledPosts", visited.scheduled, {}, 30000);
  const [cancelScheduledMut] = useMutation(CANCEL_SCHEDULED_POST);

  const { data: friendsData, refetch: refetchFriends } = useQuery<{ myFriends: Person[] }>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated,
  });

  const { data: requestsData, refetch: refetchRequests } = useQuery<{ friendRequests: { requestedByMe: Person[]; requestedMe: Person[] } }>(
    FRIEND_REQUESTS, { fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated },
  );

  // Refresh connection requests whenever the profile tab regains focus, so a
  // request received elsewhere shows up immediately (cache-first won't refetch).
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) {
        void refetchRequests();
        if (visited.scheduled) void scheduled.refetch();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, refetchRequests, visited.scheduled]),
  );

  const { data: suggestionsData, refetch: refetchSuggestions } = useQuery<{ friendSuggestions: Person[] }>(
    FRIEND_SUGGESTIONS, { fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", variables: { limit: 50 }, skip: !isAuthenticated },
  );

  useEffect(() => {
    if (peopleTab !== "suggestions") return;
    const timer = setTimeout(() => {
      void refetchSuggestions({ limit: 50, search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, peopleTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const [startDm] = useMutation<{ startDirectConversation: { id: string } }>(START_DIRECT_CONVERSATION);
  const [contactAdminMut, { loading: contactingAdmin }] = useMutation<{ contactAdmin: { id: string } }>(CONTACT_ADMIN);

  async function handleContactAdmin() {
    try {
      const { data } = await contactAdminMut();
      const id = data?.contactAdmin?.id;
      if (id) router.push(`/chat/${id}` as `/${string}`);
    } catch {
      /* ignore — user can retry */
    }
  }
  const [switchRole, { loading: roleLoading }] = useMutation<{ switchActiveRole: { accessToken: string; user: { id: string; role: string } } }>(SWITCH_ACTIVE_ROLE);
  const [addFriendMut] = useMutation(ADD_FRIEND);
  const [unfriendMut] = useMutation(UNFRIEND);
  const [respondMut] = useMutation(RESPOND_FRIEND_REQUEST);
  const [cancelRequestMut] = useMutation(CANCEL_FRIEND_REQUEST);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/auth/login" as never);
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const avatar = normalizeProfileImageUrl(me?.profileImageUrl ?? storedUser?.profileImageUrl);
  const name = me?.displayName?.trim() || me?.username || storedUser?.displayName || storedUser?.username || "You";
  const initial = name.slice(0, 1).toUpperCase();

  const posts = drops.items;
  const savedPosts = kept.items;
  const votedPosts = voted.items;
  const scheduledPosts = scheduled.items;

  async function handleCancelScheduled(postId: string) {
    Alert.alert("Cancel post", "This scheduled post will be removed. Are you sure?", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel post",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelScheduledMut({ variables: { postId } });
            void scheduled.refetch();
          } catch {
            Alert.alert("Error", "Could not cancel the scheduled post.");
          }
        },
      },
    ]);
  }
  const friends = friendsData?.myFriends ?? [];
  const requestedMe = requestsData?.friendRequests?.requestedMe ?? [];
  const requestedByMe = requestsData?.friendRequests?.requestedByMe ?? [];
  const suggestions = suggestionsData?.friendSuggestions ?? [];

  const comparesCount = summary?.dropsCount ?? 0;
  const votesCount = summary?.totalVotesOnMyPosts ?? 0;

  const q = search.toLowerCase();
  const filteredFriends = friends.filter((f) => !q || (f.displayName || f.username).toLowerCase().includes(q));

  async function handleDm(friendId: string) {
    try {
      const { data } = await startDm({ variables: { userId: friendId } });
      if (!data?.startDirectConversation) throw new Error();
      router.push(`/chat/${data.startDirectConversation.id}` as `/${string}`);
    } catch { Alert.alert("Error", "Could not open conversation."); }
  }

  async function handleUnfriend(userId: string) {
    setLoading(userId, true);
    try { await unfriendMut({ variables: { userId } }); void refetchFriends(); }
    catch { /* silent */ } finally { setLoading(userId, false); }
  }

  async function handleAddFriend(userId: string) {
    setLoading(userId, true);
    try { await addFriendMut({ variables: { userId } }); void refetchSuggestions(); }
    catch { /* silent */ } finally { setLoading(userId, false); }
  }

  async function handleRespond(userId: string, accept: boolean) {
    setLoading(userId, true);
    try { await respondMut({ variables: { requesterId: userId, accept } }); void refetchRequests(); void refetchFriends(); }
    catch { /* silent */ } finally { setLoading(userId, false); }
  }

  async function handleCancelRequest(userId: string) {
    setLoading(userId, true);
    try { await cancelRequestMut({ variables: { userId } }); void refetchRequests(); }
    catch { /* silent */ } finally { setLoading(userId, false); }
  }

  async function handleSwitchRole(targetRole: string) {
    try {
      const { data } = await switchRole({ variables: { role: targetRole } });
      if (!data?.switchActiveRole) return;
      await setSession(data.switchActiveRole.accessToken, {
        ...(storedUser ?? {}), id: data.switchActiveRole.user.id,
        email: storedUser?.email ?? "", role: data.switchActiveRole.user.role,
      });
    } catch { Alert.alert("Error", "Could not switch role."); }
  }

  const loading = meLoading && !me;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      ref={scrollRef}
      style={st.scroll}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      scrollEnabled={!openContent && !openPeople}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* ── Avatar + identity ── */}
          <View style={st.identityRow}>
            <View style={[st.avatarWrap, { borderColor: colors.accent }]}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={st.avatar} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[st.avatar, { backgroundColor: "#312e81", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={st.avatarText}>{initial}</Text>
                </View>
              )}
            </View>
            <View style={st.identityInfo}>
              <View style={st.nameRow}>
                <Text style={[st.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={st.onlineBadge}>
                  <Text style={st.onlineBadgeText}>● Online</Text>
                </View>
                {isAdmin && (
                  <View style={[st.adminBadge, { backgroundColor: colors.accent }]}>
                    <Text style={st.adminBadgeText}>ADMIN</Text>
                  </View>
                )}
              </View>
              {me?.username ? <Text style={[st.username, { color: colors.accent }]}>@{me.username}</Text> : null}
              {me?.email ? <Text style={[st.email, { color: colors.muted }]} numberOfLines={1}>{me.email}</Text> : null}
              {me?.bio ? <Text style={[st.bio, { color: colors.subtext }]} numberOfLines={2}>{me.bio}</Text> : null}
              {me?.interests && me.interests.length > 0 ? (
                <View style={st.interestWrap}>
                  {(showAllInterests ? me.interests : me.interests.slice(0, 3)).map((tag) => (
                    <View key={tag} style={[st.interestTag, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
                      <Text style={[st.interestTagText, { color: colors.accent }]}>#{tag}</Text>
                    </View>
                  ))}
                  {me.interests.length > 3 ? (
                    <Pressable
                      style={[st.interestMore, { borderColor: colors.border }]}
                      onPress={() => { animateLayout(); setShowAllInterests((v) => !v); }}
                      hitSlop={6}
                    >
                      <Text style={[st.interestMoreText, { color: colors.subtext }]}>
                        {showAllInterests ? "− less" : `+${me.interests.length - 3} more`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Edit + Logout row ── */}
          <View style={st.editRow}>
            <Pressable
              style={[st.editBtn, { backgroundColor: colors.card, borderColor: colors.accent }]}
              onPress={() => router.push("/profile/edit" as `/${string}`)}
            >
              <Text style={[st.editBtnText, { color: colors.accent }]}>✎  Edit profile</Text>
            </Pressable>
            <Pressable
              style={[st.logoutBtn, { borderColor: colors.border }]}
              onPress={() => void logout().then(() => router.replace("/auth/login"))}
            >
              <Text style={[st.logoutBtnText, { color: "#ef4444" }]}>Log out</Text>
            </Pressable>
          </View>

          {/* ── Sounds ── */}
          <View style={[st.editRow, { marginTop: -8 }]}>
            <Pressable
              style={[st.editBtn, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}
              onPress={() => router.push("/profile/sounds" as `/${string}`)}
            >
              <Text style={[st.editBtnText, { color: colors.subtext }]}>🔊  Sounds</Text>
            </Pressable>
          </View>

          {/* ── Stats row (Friends is tappable → jumps to People) ── */}
          <View style={[st.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { label: "COMPARES", value: comparesCount, onPress: (() => openContentOn("drops")) as undefined | (() => void) },
              { label: "VOTES", value: votesCount, onPress: () => openContentOn("voted") },
              { label: "FRIENDS", value: friends.length, onPress: jumpToFriends },
              { label: "KEPT", value: savedPosts.length, onPress: () => openContentOn("kept") },
            ].map((s, i, arr) => (
              <View key={s.label} style={{ flex: 1, flexDirection: "row" }}>
                <Pressable
                  style={st.statBox}
                  onPress={s.onPress}
                  disabled={!s.onPress}
                  android_ripple={s.onPress ? { color: colors.accent + "18" } : undefined}
                >
                  <Text style={[st.statValue, { color: s.onPress ? colors.accent : colors.text }]}>{s.value}</Text>
                  <Text style={[st.statLabel, { color: colors.muted }]}>
                    {s.label}{s.onPress ? " ›" : ""}
                  </Text>
                </Pressable>
                {i < arr.length - 1 && <View style={[st.statDivider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>

          {me?.id ? (
            <ProfileEngagementPanel
              userId={me.id}
              coins={balance ?? 0}
              isSelf
            />
          ) : null}

          {/* ── Admin quick links ── */}
          {isAdmin ? (
            <View style={st.adminRow}>
              <Text style={[st.adminRowLabel, { color: colors.muted }]}>ADMIN</Text>
              <Pressable style={[st.adminTab, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push("/admin" as `/${string}`)}>
                <Text style={[st.adminTabText, { color: colors.text }]}>Admin Panel →</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Role switching ── */}
          {isAdmin ? (
            <View style={[st.adminRow, { marginTop: -8 }]}>
              <Text style={[st.adminRowLabel, { color: colors.muted }]}>ROLE</Text>
              {(["USER", "ADMIN"] as const).map((role) => {
                const isActive = (me?.role ?? storedUser?.role)?.toUpperCase() === role;
                return (
                  <Pressable
                    key={role}
                    style={[st.roleChip, { backgroundColor: isActive ? colors.accent : colors.card, borderColor: isActive ? colors.accent : colors.border, opacity: roleLoading ? 0.5 : 1 }]}
                    onPress={() => !isActive && void handleSwitchRole(role)}
                    disabled={isActive || roleLoading}
                  >
                    <Text style={[st.roleChipText, { color: isActive ? "#fff" : colors.subtext }]}>{role}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* ── Your content (opens full-screen) ── */}
          <Pressable
            style={[st.section, st.sectionHead, { borderTopColor: colors.border }]}
            onPress={toggleContent}
            android_ripple={{ color: colors.accent + "11" }}
          >
            <View style={[st.sectionIcon, { backgroundColor: colors.accent + "1a" }]}>
              <CompareIcon size={16} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>My Activity</Text>
              <Text style={[st.sectionSub, { color: colors.muted }]} numberOfLines={1}>
                {summary
                  ? (summary.dropsCount + summary.scheduledCount + summary.keptCount === 0
                      ? "Share your first compare"
                      : `${summary.dropsCount} drops · ${summary.scheduledCount} scheduled · ${summary.keptCount} kept`)
                  : "Drops, schedule, saves & votes"}
              </Text>
            </View>
            <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "600", marginRight: 2 }}>›</Text>
          </Pressable>
          {/* ── People (opens full-screen) ── */}
          <Pressable
            style={[st.section, st.sectionHead, { borderTopColor: colors.border }]}
            onPress={togglePeople}
            android_ripple={{ color: colors.accent + "11" }}
          >
            <View style={[st.sectionIcon, { backgroundColor: colors.accent + "1a" }]}>
              <Text style={{ fontSize: 16 }}>👥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>People</Text>
              <Text style={[st.sectionSub, { color: colors.muted }]} numberOfLines={1}>
                {friends.length > 0
                  ? `${friends.length} friend${friends.length === 1 ? "" : "s"}${requestedMe.length > 0 ? ` · ${requestedMe.length} request${requestedMe.length === 1 ? "" : "s"}` : ""}`
                  : "Find people to connect with"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {requestedMe.length > 0 && (
                <View style={[st.sectionBadge, { backgroundColor: colors.accent }]}>
                  <Text style={st.sectionBadgeText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                    {requestedMe.length > 99 ? "99+" : requestedMe.length}
                  </Text>
                </View>
              )}
              <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "600", marginRight: 2 }}>›</Text>
            </View>
          </Pressable>

          {/* ── Contact admin ── */}
          <Pressable
            style={[st.contactAdminRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => void handleContactAdmin()}
            disabled={contactingAdmin}
          >
            <View style={st.contactAdminLeft}>
              <MessageIcon size={20} color={colors.text} />
              <View>
                <Text style={[st.contactAdminTitle, { color: colors.text }]}>Contact admin</Text>
                <Text style={[st.contactAdminSub, { color: colors.muted }]}>Questions, bugs or feedback — we'll reply</Text>
              </View>
            </View>
            <Text style={{ color: colors.accent, fontSize: 20, fontWeight: "600", marginRight: 2 }}>
              {contactingAdmin ? "…" : "›"}
            </Text>
          </Pressable>

          {/* ── Legal & about (collapsible) ── */}
          <Section
            icon={<Text style={{ fontSize: 16 }}>📄</Text>}
            title="Legal & about"
            subtitle="Privacy, terms & credits"
            open={openLegal}
            onToggle={toggleLegal}
            colors={colors}
          >
            <View style={st.legalWrap}>
            <View style={[st.footerLegalBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable style={st.footerLegalRow} onPress={() => void Linking.openURL(LEGAL_PAGE_URLS.privacy)}>
                <View style={st.footerRowText}>
                  <Text style={[st.footerRowTitle, { color: colors.text }]}>Privacy Policy</Text>
                  <Text style={[st.footerRowHint, { color: colors.muted }]}>How we handle your data</Text>
                </View>
                <Text style={[st.footerRowArrow, { color: colors.accent }]}>↗</Text>
              </Pressable>
              <View style={[st.footerLegalDivider, { backgroundColor: colors.border }]} />
              <Pressable style={st.footerLegalRow} onPress={() => void Linking.openURL(LEGAL_PAGE_URLS.terms)}>
                <View style={st.footerRowText}>
                  <Text style={[st.footerRowTitle, { color: colors.text }]}>Terms of Service</Text>
                  <Text style={[st.footerRowHint, { color: colors.muted }]}>Rules for using the app</Text>
                </View>
                <Text style={[st.footerRowArrow, { color: colors.accent }]}>↗</Text>
              </Pressable>
              <View style={[st.footerLegalDivider, { backgroundColor: colors.border }]} />
              <Pressable
                style={st.footerLegalRow}
                onPress={() => router.push("/profile/credits" as `/${string}`)}
              >
                <View style={st.footerRowText}>
                  <Text style={[st.footerRowTitle, { color: colors.text }]}>Credits & legal</Text>
                  <Text style={[st.footerRowHint, { color: colors.muted }]}>Team, privacy & terms</Text>
                </View>
                <Text style={[st.footerRowArrow, { color: colors.accent }]}>→</Text>
              </Pressable>
            </View>
            </View>
          </Section>
        </>
      )}
    </ScrollView>

    {/* ── Your content — full-screen overlay ── */}
    {openContent && (
      <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: colors.bg }]}>
        <View style={[st.overlayBar, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setOpenContent(false)} style={st.overlayBackBtn}>
            <Text style={[st.overlayBackText, { color: colors.accent }]}>‹  Back</Text>
          </Pressable>
          <Text style={[st.overlayTitle, { color: colors.text }]}>My Activity</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={[st.tabRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {(
            [
              { key: "drops" as const, label: "Drops", count: summary?.dropsCount },
              { key: "scheduled" as const, label: "Sched", count: summary?.scheduledCount },
              { key: "kept" as const, label: "Kept", count: summary?.keptCount },
              { key: "voted" as const, label: "Voted", count: summary?.votedCount },
            ]
          ).map((t) => {
            const active = contentTab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[st.tabBtn, active && { borderBottomColor: colors.accent }]}
                onPress={() => { setContentTab(t.key); markVisited(t.key); contentLastScrollY.current = 0; showTabBar(); }}
              >
                <Text numberOfLines={1} style={[st.tabBtnText, { color: active ? colors.accent : colors.muted }]}>
                  {t.label}{(t.count ?? 0) > 0 ? ` (${t.count})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }}>
          {contentTab === "drops" && (
            drops.loading ? (
              <View style={st.centerBox}><ActivityIndicator color={colors.accent} /></View>
            ) : posts.length === 0 ? (
              <View style={[st.emptyBox, { borderColor: colors.border }]}>
                <Text style={[st.emptyText, { color: colors.muted }]}>No posts yet — drop something!</Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={st.feedContainer}
                onScroll={(e) => handleContentScroll(e, () => void drops.loadMore())}
                scrollEventThrottle={16}
              >
                {posts.map((p) => (
                  <FeedPostCard key={p.id} post={p} />
                ))}
                {drops.loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />}
              </ScrollView>
            )
          )}
          {contentTab === "scheduled" && (
            scheduled.loading ? (
              <View style={st.centerBox}><ActivityIndicator color={colors.accent} /></View>
            ) : scheduledPosts.length === 0 ? (
              <View style={[st.emptyBox, { borderColor: colors.border }]}>
                <Text style={[st.emptyText, { color: colors.muted }]}>
                  No scheduled posts. Pick "Schedule for later" when creating a post.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={st.feedContainer}
                onScroll={(e) => handleContentScroll(e, () => void scheduled.loadMore())}
                scrollEventThrottle={16}
              >
                {scheduledPosts.map((p) => {
                  const live = scheduledCountdown(p.scheduledAt) === "Going live…";
                  const goesAt = p.scheduledAt
                    ? new Date(p.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                    : null;
                  return (
                    <View key={p.id} style={st.schedFeedItem}>
                      <View style={[st.schedMetaBar, { backgroundColor: colors.section, borderColor: colors.border }]}>
                        <View style={[st.schedPill, { backgroundColor: live ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)" }]}>
                          <Text style={[st.schedPillText, { color: live ? "#22c55e" : "#f59e0b" }]}>
                            {live ? "🟢 Going live" : `⏱ in ${scheduledCountdown(p.scheduledAt)}`}
                          </Text>
                        </View>
                        {goesAt && !live ? (
                          <Text style={[st.schedDate, { color: colors.muted }]}>Goes live at {goesAt}</Text>
                        ) : null}
                        <View style={st.schedActions}>
                          <Pressable
                            style={[st.schedEditBtn, { borderColor: colors.accent }]}
                            onPress={() => router.push(`/edit-post?postId=${p.id}` as `/${string}`)}
                          >
                            <Text style={[st.schedEditText, { color: colors.accent }]}>Edit</Text>
                          </Pressable>
                          <Pressable
                            style={[st.schedCancelBtn, { borderColor: "#f87171" }]}
                            onPress={() => void handleCancelScheduled(p.id)}
                          >
                            <Text style={st.schedCancelText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                      <FeedPostCard post={p} />
                    </View>
                  );
                })}
                {scheduled.loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />}
              </ScrollView>
            )
          )}
          {contentTab === "kept" && (
            kept.loading ? (
              <View style={st.centerBox}><ActivityIndicator color={colors.accent} /></View>
            ) : savedPosts.length === 0 ? (
              <View style={[st.emptyBox, { borderColor: colors.border }]}>
                <Text style={[st.emptyText, { color: colors.muted }]}>No saved posts yet</Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={st.feedContainer}
                onScroll={(e) => handleContentScroll(e, () => void kept.loadMore())}
                scrollEventThrottle={16}
              >
                {savedPosts.map((p) => (
                  <FeedPostCard key={p.id} post={p} />
                ))}
                {kept.loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />}
              </ScrollView>
            )
          )}
          {contentTab === "voted" && (
            <View style={{ flex: 1 }}>
              <View style={[st.votedFilterWrap, { backgroundColor: colors.section }]}>
                {(["all", "anonymous"] as const).map((f) => (
                  <Pressable
                    key={f}
                    style={[st.votedFilterBtn, votedFilter === f && [st.votedFilterBtnActive, { backgroundColor: colors.card }]]}
                    onPress={() => setVotedFilter(f)}
                  >
                    <Text style={[st.votedFilterText, { color: votedFilter === f ? colors.accent : colors.muted }]}>
                      {f === "all" ? "All votes" : "👻 Anonymous"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {voted.loading ? (
                <View style={st.centerBox}><ActivityIndicator color={colors.accent} /></View>
              ) : votedPosts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>
                    {votedFilter === "anonymous"
                      ? "You haven't voted anonymously on any posts yet."
                      : "You haven't voted on any posts yet."}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={st.feedContainer}
                  style={{ flex: 1 }}
                  onScroll={(e) => handleContentScroll(e, () => void voted.loadMore())}
                  scrollEventThrottle={16}
                >
                  {votedPosts.map((p) => (
                    <FeedPostCard key={p.id} post={p} />
                  ))}
                  {voted.loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>
    )}

    {/* ── People — full-screen overlay ── */}
    {openPeople && (
      <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: colors.bg }]}>
        <View style={[st.overlayBar, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setOpenPeople(false)} style={st.overlayBackBtn}>
            <Text style={[st.overlayBackText, { color: colors.accent }]}>‹  Back</Text>
          </Pressable>
          <Text style={[st.overlayTitle, { color: colors.text }]}>People</Text>
          <View style={{ width: 64 }} />
        </View>
        <View style={[st.searchWrap, { backgroundColor: colors.section, borderColor: colors.border }]}>
          <Text style={{ fontSize: 14, color: colors.muted }}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, username or email…"
            placeholderTextColor={colors.muted}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>
        <View style={[st.peopleTabRow, { borderBottomColor: colors.border }]}>
          {([
            { key: "friends", label: `Friends${friends.length > 0 ? ` (${friends.length})` : ""}` },
            { key: "received", label: `Received${requestedMe.length > 0 ? ` (${requestedMe.length})` : ""}` },
            { key: "sent", label: `Sent${requestedByMe.length > 0 ? ` (${requestedByMe.length})` : ""}` },
            { key: "suggestions", label: "Suggestions" },
          ] as const).map((t) => (
            <Pressable
              key={t.key}
              style={[st.peopleTabBtn, peopleTab === t.key && [st.peopleTabBtnActive, { borderBottomColor: colors.accent }]]}
              onPress={() => setPeopleTab(t.key)}
            >
              <Text numberOfLines={1} style={[st.peopleTabText, { color: peopleTab === t.key ? colors.accent : colors.muted }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          {peopleTab === "friends" && (
            filteredFriends.length === 0 ? (
              search ? (
                <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>No friends match.</Text>
              ) : (
                <View style={st.friendsEmpty}>
                  <Text style={{ fontSize: 40 }}>👋</Text>
                  <Text style={[st.friendsEmptyTitle, { color: colors.text }]}>No friends yet</Text>
                  <Text style={[st.friendsEmptyText, { color: colors.muted }]}>
                    Find people to compare with — add friends to see their drops and vote together.
                  </Text>
                  <Pressable
                    style={[st.findFriendsBtn, { backgroundColor: colors.accent }]}
                    onPress={() => setPeopleTab("suggestions")}
                  >
                    <Text style={st.findFriendsBtnText}>🔍  Find friends</Text>
                  </Pressable>
                </View>
              )
            ) : filteredFriends.map((f) => (
              <PersonRow
                key={f.id} person={f} colors={colors}
                actionLoading={actionLoadingIds.has(f.id)}
                rightSlot={
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Pressable
                      style={st.plainIconBtn}
                      onPress={() => void handleDm(f.id)}
                      hitSlop={6}
                      accessibilityLabel="Message"
                    >
                      <MessageIcon size={22} color={colors.text} />
                    </Pressable>
                    <Pressable style={[st.ghostBtn, { borderColor: colors.border }]} onPress={() => void handleUnfriend(f.id)}>
                      <Text style={[st.ghostBtnText, { color: colors.subtext }]}>Unfriend</Text>
                    </Pressable>
                  </View>
                }
              />
            ))
          )}
          {peopleTab === "received" && (
            requestedMe.length === 0 ? (
              <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>No incoming requests</Text>
            ) : requestedMe.map((f) => (
              <PersonRow
                key={f.id} person={f} colors={colors}
                actionLoading={actionLoadingIds.has(f.id)}
                rightSlot={
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Pressable style={st.acceptBtn} onPress={() => void handleRespond(f.id, true)}>
                      <Text style={st.acceptBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable style={[st.rejectBtn, { borderColor: colors.border }]} onPress={() => void handleRespond(f.id, false)}>
                      <Text style={[st.rejectBtnText, { color: colors.subtext }]}>Reject</Text>
                    </Pressable>
                  </View>
                }
              />
            ))
          )}
          {peopleTab === "sent" && (
            requestedByMe.length === 0 ? (
              <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>No sent requests</Text>
            ) : requestedByMe.map((f) => (
              <PersonRow
                key={f.id} person={f} colors={colors}
                actionLoading={actionLoadingIds.has(f.id)}
                rightSlot={
                  <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    <View style={[st.pendingBadge, { borderColor: "#f59e0b55", backgroundColor: "#f59e0b22" }]}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#f59e0b" }}>PENDING</Text>
                    </View>
                    <Pressable style={[st.ghostBtn, { borderColor: colors.border }]} onPress={() => void handleCancelRequest(f.id)}>
                      <Text style={[st.ghostBtnText, { color: colors.subtext }]}>Cancel</Text>
                    </Pressable>
                  </View>
                }
              />
            ))
          )}
          {peopleTab === "suggestions" && (
            suggestions.length === 0 ? (
              <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>
                {search ? "No suggestions match." : "No suggestions"}
              </Text>
            ) : suggestions.map((f) => (
              <PersonRow
                key={f.id} person={f} colors={colors}
                actionLoading={actionLoadingIds.has(f.id)}
                rightSlot={
                  <Pressable style={[st.addBtn, { backgroundColor: colors.accent }]} onPress={() => void handleAddFriend(f.id)}>
                    <Text style={st.addBtnText}>Add</Text>
                  </Pressable>
                }
              />
            ))
          )}
        </ScrollView>
      </View>
    )}

    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  scroll: { flex: 1 },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, marginBottom: 14, gap: 14 },
  avatarWrap: { borderRadius: 50, borderWidth: 3, padding: 2 },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarText: { color: "#fff", fontSize: 28, fontWeight: "700" },
  identityInfo: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 19, fontWeight: "800" },
  onlineBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderColor: "#22c55e", backgroundColor: "#22c55e22" },
  onlineBadgeText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  adminBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  adminBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  username: { fontSize: 13, fontWeight: "600" },
  email: { fontSize: 12 },
  bio: { fontSize: 13, lineHeight: 18 },
  interestWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" },
  interestTag: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  interestTagText: { fontSize: 12, fontWeight: "600" },
  interestMore: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2, borderStyle: "dashed" },
  interestMoreText: { fontSize: 12, fontWeight: "700" },

  // Collapsible sections (accordion)
  section: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  sectionIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15.5, fontWeight: "800" },
  sectionSub: { fontSize: 11.5, marginTop: 2 },
  sectionBadge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  sectionBadgeText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
  sectionChevron: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sectionBody: { paddingBottom: 8 },

  // Friends empty state CTA
  friendsEmpty: { alignItems: "center", paddingVertical: 22, paddingHorizontal: 12, gap: 6 },
  friendsEmptyTitle: { fontSize: 16, fontWeight: "800", marginTop: 2 },
  friendsEmptyText: { fontSize: 12.5, lineHeight: 18, textAlign: "center", marginBottom: 6 },
  findFriendsBtn: { borderRadius: 24, paddingHorizontal: 24, paddingVertical: 11 },
  findFriendsBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  legalWrap: { paddingHorizontal: 16, paddingTop: 4 },

  // Edit + logout
  editRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  editBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, borderWidth: 1, alignItems: "center" },
  editBtnText: { fontSize: 13, fontWeight: "700" },
  contactAdminRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  contactAdminLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  contactAdminTitle: { fontSize: 14, fontWeight: "800" },
  contactAdminSub: { fontSize: 11.5, marginTop: 1 },
  logoutBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1 },
  logoutBtnText: { fontSize: 13, fontWeight: "700" },

  // Stats
  statsRow: { flexDirection: "row", marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 14 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth },

  // Admin
  adminRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  adminRowLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  adminTab: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  adminTabText: { fontSize: 12, fontWeight: "600" },
  roleChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  roleChipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  // Content tabs (drops/kept/voted)
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnText: { fontSize: 12, fontWeight: "700" },
  // Draft/scheduled post rendered as a full feed card — this strip sits above it
  // with the countdown + Edit/Cancel controls the feed card has no concept of.
  schedFeedItem: { marginBottom: 10 },
  schedMetaBar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  schedPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  schedPillText: { fontSize: 11, fontWeight: "700" },
  schedDate: { fontSize: 11 },
  schedActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginLeft: "auto" },
  schedEditBtn: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  schedEditText: { fontSize: 12, fontWeight: "700" },
  schedCancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  schedCancelText: { color: "#f87171", fontSize: 12, fontWeight: "700" },

  // Feed-card list (Drops/Kept/Voted/Scheduled — same card as the main feed)
  feedContainer: { paddingBottom: 8 },

  // Voted filter (segmented control)
  votedFilterWrap: {
    flexDirection: "row",
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 999,
    padding: 4,
    gap: 2,
  },
  votedFilterBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 999,
  },
  votedFilterBtnActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 2,
    elevation: 1,
  },
  votedFilterText: { fontSize: 12, fontWeight: "700" },

  // Empty / loading states
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBox: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, padding: 18, alignItems: "center", marginTop: 12 },
  emptyText: { fontSize: 13, textAlign: "center" },

  // People section
  peopleSectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderTopWidth: 1, marginTop: 8 },
  peopleSectionTitle: { fontSize: 18, fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  peopleTabRow: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginBottom: 4 },
  peopleTabBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: "transparent" },
  peopleTabBtnActive: {},
  peopleTabText: { fontSize: 12, fontWeight: "700" },
  requestsHeader: { fontSize: 10, fontWeight: "700", letterSpacing: 1, paddingTop: 10, paddingBottom: 6 },

  // Person row
  personRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  personAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#312e81", alignItems: "center", justifyContent: "center" },
  personAvatarText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  personName: { fontSize: 14, fontWeight: "700" },

  // Action buttons
  plainIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  ghostBtnText: { fontSize: 12, fontWeight: "600" },
  acceptBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#22c55e" },
  acceptBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rejectBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  rejectBtnText: { fontSize: 12, fontWeight: "600" },
  addBtn: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pendingBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },

  // Full-screen section overlays
  overlayBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  overlayBackBtn: { paddingHorizontal: 12, paddingVertical: 10, minWidth: 64 },
  overlayBackText: { fontSize: 16, fontWeight: "700" },
  overlayTitle: { fontSize: 16, fontWeight: "800", flex: 1, textAlign: "center" },

  // Profile footer (settings & legal)
  profileFooter: { marginTop: 8, paddingHorizontal: 16, paddingBottom: 8 },
  footerDivider: { height: StyleSheet.hairlineWidth, marginBottom: 18, opacity: 0.75 },
  footerLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginBottom: 12 },
  footerLegalBlock: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  footerLegalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  footerLegalDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  footerRowText: { flex: 1, gap: 2 },
  footerRowTitle: { fontSize: 14, fontWeight: "700" },
  footerRowHint: { fontSize: 11, lineHeight: 15 },
  footerRowArrow: { fontSize: 16, fontWeight: "700" },
});
