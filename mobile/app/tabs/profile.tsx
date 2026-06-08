import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME, MY_VOTED_POSTS, USER_POSTS } from "@ctrend/shared/graphql/profile";
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
import { START_DIRECT_CONVERSATION } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
import ProfileCompareCard from "../../components/ProfileCompareCard";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.floor((SCREEN_W - 38) / 2); // 2×14 padding + 10 gap
const TAB_BAR_H = 64 + 14;
const SECTION_H = Math.round(SCREEN_H * 0.52);
const PEOPLE_H = Math.round(SCREEN_H * 0.4);

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

type UserPost = {
  id: string;
  imageUrls?: string[] | null;
  caption?: string | null;
  createdAt: string;
  totalVotes?: number | null;
  upvoteCount: number;
  downvoteCount: number;
  commentCount?: number | null;
  hypeCount?: number | null;
  saveCount?: number | null;
  votingEndsAt?: string | null;
  isVotingOpen?: boolean | null;
  options?: Array<{ label: string }> | null;
  category?: { id: string; name: string; slug: string } | null;
};

type SavedPost = {
  id: string;
  imageUrls?: string[] | null;
  caption?: string | null;
  isVotingOpen?: boolean | null;
  upvoteCount: number;
  downvoteCount: number;
};

type ScheduledPost = {
  id: string;
  contentText?: string | null;
  imageUrls?: string[] | null;
  options?: Array<{ label: string; imageUrl?: string | null }> | null;
  category?: { id: string; name?: string | null } | null;
  status: string;
  scheduledAt?: string | null;
};

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
  icon: string;
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
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[st.sectionTitle, { color: colors.text }]}>{title}</Text>
            {badge != null && badge > 0 ? (
              <View style={[st.sectionBadge, { backgroundColor: colors.accent }]}>
                <Text style={st.sectionBadgeText}>{badge > 99 ? "99+" : badge}</Text>
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { translateY } = useTabBar();
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    if (y < 60) {
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

  const [contentTab, setContentTab] = useState<"drops" | "scheduled" | "kept" | "voted">("drops");
  const [votedFilter, setVotedFilter] = useState<"all" | "anonymous">("all");
  const [peopleTab, setPeopleTab] = useState<"friends" | "received" | "sent" | "suggestions">("friends");
  const [search, setSearch] = useState("");
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());

  // Accordion open/close state — everything collapsed by default for a clean,
  // uncluttered first impression. Users expand what they want to see.
  const [openContent, setOpenContent] = useState(false);
  const [openPeople, setOpenPeople] = useState(false);
  const [openLegal, setOpenLegal] = useState(false);
  const [showAllInterests, setShowAllInterests] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const peopleY = useRef(0);

  const toggleContent = () => { animateLayout(); setOpenContent((v) => !v); };
  const toggleLegal = () => { animateLayout(); setOpenLegal((v) => !v); };
  const togglePeople = () => { animateLayout(); setOpenPeople((v) => !v); };

  // Friends stat / count → open People, focus the Friends tab, scroll it into view.
  function jumpToFriends() {
    setPeopleTab("friends");
    animateLayout();
    setOpenPeople(true);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(peopleY.current - 12, 0), animated: true });
    }, 160);
  }

  const setLoading = (id: string, on: boolean) =>
    setActionLoadingIds((prev) => { const s = new Set(prev); if (on) s.add(id); else s.delete(id); return s; });

  const { data: meData, loading: meLoading } = useQuery<MeData>(ME, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated,
  });
  const me = meData?.me;
  const isAdmin = (me?.role ?? storedUser?.role)?.toLowerCase() === "admin";

  const { data: postsData, loading: postsLoading } = useQuery<{ getPostsByUser: UserPost[] }>(USER_POSTS, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first",
    variables: { userId: me?.id }, skip: !me?.id,
  });

  const { data: savedData } = useQuery<{ mySavedPosts: SavedPost[] }>(MY_SAVED_POSTS, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated,
  });

  const { data: votedData, loading: votedLoading } = useQuery<{ myVotedPosts: UserPost[] }>(MY_VOTED_POSTS, {
    fetchPolicy: "cache-and-network",
    variables: { anonymousOnly: votedFilter === "anonymous" },
    skip: !isAuthenticated,
  });

  const { data: scheduledData, loading: scheduledLoading, refetch: refetchScheduled } = useQuery<{
    myScheduledPosts: ScheduledPost[];
  }>(MY_SCHEDULED_POSTS, {
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    skip: !isAuthenticated,
    pollInterval: 30000,
  });
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
        void refetchScheduled();
      }
    }, [isAuthenticated, refetchRequests, refetchScheduled]),
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

  const posts = postsData?.getPostsByUser ?? [];
  const savedPosts = savedData?.mySavedPosts ?? [];
  const votedPosts = votedData?.myVotedPosts ?? [];
  const scheduledPosts = scheduledData?.myScheduledPosts ?? [];

  async function handleCancelScheduled(postId: string) {
    Alert.alert("Cancel post", "This scheduled post will be removed. Are you sure?", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel post",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelScheduledMut({ variables: { postId } });
            void refetchScheduled();
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

  const comparesCount = posts.length;
  const votesCount = posts.reduce((s, p) => s + (p.totalVotes ?? (p.upvoteCount + p.downvoteCount)), 0);

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
    <ScrollView
      ref={scrollRef}
      style={[st.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_H + 16 }}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
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
              { label: "COMPARES", value: comparesCount, onPress: undefined as undefined | (() => void) },
              { label: "VOTES", value: votesCount, onPress: undefined },
              { label: "FRIENDS", value: friends.length, onPress: jumpToFriends },
              { label: "KEPT", value: savedPosts.length, onPress: undefined },
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

          {/* ── Your content (collapsible: drops / scheduled / kept / voted) ── */}
          <Section
            icon="📊"
            title="Your content"
            subtitle={
              posts.length + savedPosts.length + scheduledPosts.length === 0
                ? "Share your first compare"
                : `${posts.length} drops · ${scheduledPosts.length} scheduled · ${savedPosts.length} kept`
            }
            open={openContent}
            onToggle={toggleContent}
            colors={colors}
          >
          {/* ── Drops / Kept / Voted tab row ── */}
          <View style={[st.tabRow, { borderBottomColor: colors.border }]}>
            <Pressable
              style={[st.tabBtn, contentTab === "drops" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]}
              onPress={() => setContentTab("drops")}
            >
              <Text style={[st.tabBtnText, { color: contentTab === "drops" ? colors.accent : colors.muted }]}>
                ✦ Drops{posts.length > 0 ? ` (${posts.length})` : ""}
              </Text>
            </Pressable>
            <Pressable
              style={[st.tabBtn, contentTab === "scheduled" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]}
              onPress={() => setContentTab("scheduled")}
            >
              <Text numberOfLines={1} style={[st.tabBtnText, { color: contentTab === "scheduled" ? colors.accent : colors.muted }]}>
                ⏰ Sched{scheduledPosts.length > 0 ? ` (${scheduledPosts.length})` : ""}
              </Text>
            </Pressable>
            <Pressable
              style={[st.tabBtn, contentTab === "kept" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]}
              onPress={() => setContentTab("kept")}
            >
              <Text style={[st.tabBtnText, { color: contentTab === "kept" ? colors.accent : colors.muted }]}>
                🔖 Kept{savedPosts.length > 0 ? ` (${savedPosts.length})` : ""}
              </Text>
            </Pressable>
            <Pressable
              style={[st.tabBtn, contentTab === "voted" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]}
              onPress={() => setContentTab("voted")}
            >
              <Text style={[st.tabBtnText, { color: contentTab === "voted" ? colors.accent : colors.muted }]}>
                🗳️ Voted
              </Text>
            </Pressable>
          </View>

          {/* ── Content section (fixed height, nested scroll) ── */}
          <View style={{ height: SECTION_H }}>

            {/* ── Drops grid ── */}
            {contentTab === "drops" && (
              postsLoading && posts.length === 0 ? (
                <View style={st.centerBox}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : posts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>No posts yet — drop something!</Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={st.gridContainer}
                >
                  <View style={st.grid}>
                    {posts.map((p) => (
                      <View key={p.id} style={{ width: CARD_W }}>
                        <ProfileCompareCard
                          post={p}
                          variant="drops"
                          onEdit={() => router.push(`/post/${p.id}` as `/${string}`)}
                        />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )
            )}

            {/* ── Scheduled list ── */}
            {contentTab === "scheduled" && (
              scheduledLoading && scheduledPosts.length === 0 ? (
                <View style={st.centerBox}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : scheduledPosts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>
                    No scheduled posts. Pick "Schedule for later" when creating a post.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ padding: 14, gap: 12 }}
                >
                  {scheduledPosts.map((p) => {
                    const img0 = p.imageUrls?.[0] ?? p.options?.[0]?.imageUrl ?? null;
                    const img1 = p.imageUrls?.[1] ?? p.options?.[1]?.imageUrl ?? null;
                    const live = scheduledCountdown(p.scheduledAt) === "Going live…";
                    const goesAt = p.scheduledAt
                      ? new Date(p.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : null;
                    return (
                      <View key={p.id} style={[st.schedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[st.schedThumbStrip, { backgroundColor: colors.section }]}>
                          {img0 ? (
                            <Image source={{ uri: img0 }} style={st.schedThumb} contentFit="cover" cachePolicy="memory-disk" />
                          ) : (
                            <View style={[st.schedThumb, { alignItems: "center", justifyContent: "center" }]}>
                              <Text style={{ fontSize: 22 }}>🖼</Text>
                            </View>
                          )}
                          {img1 ? (
                            <Image source={{ uri: img1 }} style={st.schedThumb} contentFit="cover" cachePolicy="memory-disk" />
                          ) : null}
                        </View>
                        <View style={st.schedBody}>
                          {p.contentText ? (
                            <Text style={[st.schedCaption, { color: colors.text }]} numberOfLines={2}>{p.contentText}</Text>
                          ) : null}
                          <View style={st.schedMetaRow}>
                            <View style={[st.schedPill, { backgroundColor: live ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)" }]}>
                              <Text style={[st.schedPillText, { color: live ? "#22c55e" : "#f59e0b" }]}>
                                {live ? "🟢 Going live" : `⏱ in ${scheduledCountdown(p.scheduledAt)}`}
                              </Text>
                            </View>
                            {p.category?.name ? (
                              <Text style={[st.schedCategory, { color: colors.muted }]}>{p.category.name}</Text>
                            ) : null}
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
                      </View>
                    );
                  })}
                </ScrollView>
              )
            )}

            {/* ── Kept grid ── */}
            {contentTab === "kept" && (
              savedPosts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>No saved posts yet</Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={st.gridContainer}
                >
                  <View style={st.grid}>
                    {savedPosts.map((p) => (
                      <View key={p.id} style={{ width: CARD_W }}>
                        <ProfileCompareCard post={p} variant="kept" />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )
            )}

            {/* ── Voted tab ── */}
            {contentTab === "voted" && (
              <View style={{ flex: 1 }}>
                {/* Segmented All / Anonymous filter */}
                <View style={[st.votedFilterWrap, { backgroundColor: colors.section }]}>
                  {(["all", "anonymous"] as const).map((f) => (
                    <Pressable
                      key={f}
                      style={[
                        st.votedFilterBtn,
                        votedFilter === f && [st.votedFilterBtnActive, { backgroundColor: colors.card }],
                      ]}
                      onPress={() => setVotedFilter(f)}
                    >
                      <Text style={[st.votedFilterText, { color: votedFilter === f ? colors.accent : colors.muted }]}>
                        {f === "all" ? "All votes" : "👻 Anonymous"}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {votedLoading && votedPosts.length === 0 ? (
                  <View style={st.centerBox}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
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
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={st.gridContainer}
                    style={{ flex: 1 }}
                  >
                    <View style={st.grid}>
                      {votedPosts.map((p) => (
                        <View key={p.id} style={{ width: CARD_W }}>
                          <ProfileCompareCard post={p} variant="voted" />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}
          </View>
          </Section>

          {/* ── People (collapsible) ── */}
          <Section
            icon="👥"
            title="People"
            subtitle={
              friends.length > 0
                ? `${friends.length} friend${friends.length === 1 ? "" : "s"}${requestedMe.length > 0 ? ` · ${requestedMe.length} request${requestedMe.length === 1 ? "" : "s"}` : ""}`
                : "Find people to connect with"
            }
            badge={requestedMe.length}
            open={openPeople}
            onToggle={togglePeople}
            colors={colors}
            onLayout={(e) => { peopleY.current = e.nativeEvent.layout.y; }}
          >

          {/* Search */}
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

          {/* People sub-tabs */}
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

          {/* People tab content */}
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ height: PEOPLE_H }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          >
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
                      onPress={() => { animateLayout(); setPeopleTab("suggestions"); }}
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
                      <Pressable style={[st.iconBtn, { backgroundColor: colors.accent }]} onPress={() => void handleDm(f.id)}>
                        <Text style={{ fontSize: 14 }}>💬</Text>
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
          </Section>

          {/* ── Legal & about (collapsible) ── */}
          <Section
            icon="📄"
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
  tabBtnActive: {},
  tabBtnText: { fontSize: 12, fontWeight: "700" },
  schedCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  schedThumbStrip: { flexDirection: "row", height: 90 },
  schedThumb: { flex: 1, height: 90 },
  schedBody: { padding: 10, gap: 6 },
  schedCaption: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  schedMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  schedPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  schedPillText: { fontSize: 11, fontWeight: "700" },
  schedCategory: { fontSize: 11 },
  schedDate: { fontSize: 11 },
  schedActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 2 },
  schedEditBtn: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  schedEditText: { fontSize: 12, fontWeight: "700" },
  schedCancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5 },
  schedCancelText: { color: "#f87171", fontSize: 12, fontWeight: "700" },

  // Grid layout
  gridContainer: { padding: 14, paddingBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

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
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  ghostBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  ghostBtnText: { fontSize: 12, fontWeight: "600" },
  acceptBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#22c55e" },
  acceptBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  rejectBtn: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  rejectBtnText: { fontSize: 12, fontWeight: "600" },
  addBtn: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  addBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  pendingBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },

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
