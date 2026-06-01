import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME, USER_POSTS } from "@ctrend/shared/graphql/profile";
import { SWITCH_ACTIVE_ROLE } from "@ctrend/shared/graphql/auth";
import {
  MY_FRIENDS,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  ADD_FRIEND,
  UNFRIEND,
  RESPOND_FRIEND_REQUEST,
  CANCEL_FRIEND_REQUEST,
} from "@ctrend/shared/graphql/friends";
import { MY_SAVED_POSTS, EXTEND_POST_VOTING } from "@ctrend/shared/graphql/feed";
import { START_DIRECT_CONVERSATION } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const KEPT_CARD_W = (SCREEN_W - 48) / 2;
const TAB_BAR_H = 64 + 14;
// Fixed heights for nested scroll sections
const SECTION_H = Math.round(SCREEN_H * 0.42);
const PEOPLE_H = Math.round(SCREEN_H * 0.38);

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

type Person = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

// ─── Skeleton drop row ─────────────────────────────────────────────────────────

function SkeletonDropRow({ colors }: { colors: ReturnType<typeof useTheme>["colors"] }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[st.dropRow, { borderColor: colors.border, opacity }]}>
      <View style={[st.dropThumbWrap, { backgroundColor: colors.border, borderRadius: 8 }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 13, backgroundColor: colors.border, borderRadius: 4, width: "70%" }} />
        <View style={{ height: 10, backgroundColor: colors.border, borderRadius: 4, width: "45%" }} />
        <View style={{ height: 10, backgroundColor: colors.border, borderRadius: 4, width: "55%" }} />
      </View>
    </Animated.View>
  );
}

// ─── Drop list row (web-style) ─────────────────────────────────────────────────

function DropRow({ post, colors, onExtend }: {
  post: UserPost;
  colors: ReturnType<typeof useTheme>["colors"];
  onExtend: (id: string, hours: number) => void;
}) {
  const img0 = post.imageUrls?.[0];
  const img1 = post.imageUrls?.[1];
  const totalVotes = post.totalVotes ?? (post.upvoteCount + post.downvoteCount);
  const isOpen = post.isVotingOpen !== false;
  const options = post.options?.slice(0, 4) ?? [];
  const category = post.category?.name;

  return (
    <Pressable
      style={[st.dropRow, { borderColor: colors.border }]}
      onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
    >
      {/* Thumbnails */}
      <View style={st.dropThumbWrap}>
        {img0 ? (
          <Image source={{ uri: img0 }} style={[st.dropThumb, img1 ? st.dropThumbLeft : {}]} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[st.dropThumb, { backgroundColor: colors.border }]} />
        )}
        {img1 ? (
          <Image source={{ uri: img1 }} style={st.dropThumb} contentFit="cover" cachePolicy="memory-disk" />
        ) : null}
      </View>

      {/* Meta */}
      <View style={st.dropMeta}>
        <Text style={[st.dropTitle, { color: colors.text }]} numberOfLines={1}>
          {post.caption || "Compare"}
        </Text>
        <Text style={[st.dropSub, { color: colors.muted }]}>
          {[category, `${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`].filter(Boolean).join("  ·  ")}
        </Text>
        {options.length > 0 && (
          <View style={st.chipRow}>
            {options.map((o, i) => (
              <View key={i} style={[st.optionChip, { backgroundColor: colors.section, borderColor: colors.border }]}>
                <Text style={[st.optionChipText, { color: colors.subtext }]} numberOfLines={1}>{o.label}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={st.dropStatusRow}>
          <View style={[st.dot, { backgroundColor: isOpen ? "#22c55e" : colors.muted }]} />
          <Text style={[st.dropStatusText, { color: isOpen ? "#22c55e" : colors.muted }]}>
            {isOpen ? "Open" : "Closed"}
          </Text>
        </View>
      </View>

      {/* Action icons */}
      <View style={st.dropActions}>
        <Pressable
          hitSlop={8}
          onPress={(e) => { e.stopPropagation?.(); router.push(`/edit-post?postId=${post.id}` as `/${string}`); }}
        >
          <Text style={[st.dropActionIcon, { color: colors.subtext }]}>✏️</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); router.push(`/post/${post.id}` as `/${string}`); }}>
          <Text style={[st.dropActionIcon, { color: colors.subtext }]}>👁</Text>
        </Pressable>
        {isOpen && (
          <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onExtend(post.id, 24); }}>
            <Text style={[st.dropActionIcon, { color: colors.subtext }]}>⏱</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ─── Compact kept card (2-column grid) ────────────────────────────────────────

function KeptCard({ post, colors }: { post: SavedPost; colors: ReturnType<typeof useTheme>["colors"] }) {
  const img0 = post.imageUrls?.[0];
  const img1 = post.imageUrls?.[1];
  const totalVotes = post.upvoteCount + post.downvoteCount;
  const isOpen = post.isVotingOpen !== false;

  return (
    <Pressable
      style={[st.keptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
    >
      <View style={st.keptImgArea}>
        {img0 ? (
          <Image source={{ uri: img0 }} style={[st.keptImg, img1 ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}]} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[st.keptImg, { backgroundColor: colors.section }]} />
        )}
        {img1 ? (
          <Image source={{ uri: img1 }} style={[st.keptImg, { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: 2 }]} contentFit="cover" cachePolicy="memory-disk" />
        ) : null}
      </View>
      <View style={{ padding: 7, gap: 4 }}>
        {post.caption ? (
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }} numberOfLines={1}>{post.caption}</Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>{totalVotes}v</Text>
          <View style={{ borderRadius: 20, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, borderColor: isOpen ? "#22c55e" : colors.border, backgroundColor: isOpen ? "#22c55e22" : colors.section }}>
            <Text style={{ fontSize: 9, fontWeight: "800", color: isOpen ? "#22c55e" : colors.muted }}>{isOpen ? "OPEN" : "CLOSED"}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Person row (Friends / Requests / Suggestions) ────────────────────────────

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

  // Content tab: drops | kept
  const [contentTab, setContentTab] = useState<"drops" | "kept">("drops");
  // People sub-tab: friends | requests | suggestions
  const [peopleTab, setPeopleTab] = useState<"friends" | "requests" | "suggestions">("friends");
  const [search, setSearch] = useState("");
  // Per-row action loading
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());

  const setLoading = (id: string, on: boolean) =>
    setActionLoadingIds((prev) => { const s = new Set(prev); on ? s.add(id) : s.delete(id); return s; });

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

  const { data: friendsData, refetch: refetchFriends } = useQuery<{ myFriends: Person[] }>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated,
  });

  const { data: requestsData, refetch: refetchRequests } = useQuery<{ friendRequests: { requestedByMe: Person[]; requestedMe: Person[] } }>(
    FRIEND_REQUESTS, { fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", skip: !isAuthenticated },
  );

  const { data: suggestionsData, refetch: refetchSuggestions } = useQuery<{ friendSuggestions: Person[] }>(
    FRIEND_SUGGESTIONS, { fetchPolicy: "cache-and-network", nextFetchPolicy: "cache-first", variables: { limit: 50 }, skip: !isAuthenticated },
  );

  // Debounce suggestions search — server-side when on Suggestions tab
  useEffect(() => {
    if (peopleTab !== "suggestions") return;
    const timer = setTimeout(() => {
      void refetchSuggestions({ limit: 50, search: search.trim() || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, peopleTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const [extendVoting] = useMutation(EXTEND_POST_VOTING);
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
  const friends = friendsData?.myFriends ?? [];
  const requestedMe = requestsData?.friendRequests?.requestedMe ?? [];
  const requestedByMe = requestsData?.friendRequests?.requestedByMe ?? [];
  const suggestions = suggestionsData?.friendSuggestions ?? [];

  const comparesCount = posts.length;
  const votesCount = posts.reduce((s, p) => s + (p.totalVotes ?? (p.upvoteCount + p.downvoteCount)), 0);
  const openCount = posts.filter((p) => p.isVotingOpen).length;

  // Friends: client-side filter (small list). Suggestions: server-side via refetch.
  const q = search.toLowerCase();
  const filteredFriends = friends.filter((f) => !q || (f.displayName || f.username).toLowerCase().includes(q));
  const filteredSuggestions = suggestions; // server already filtered via refetch

  async function handleExtend(postId: string, hours: number) {
    const newDate = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    try { await extendVoting({ variables: { postId, newVotingEndsAt: newDate } }); }
    catch { Alert.alert("Error", "Could not extend voting deadline."); }
  }

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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {me.interests.map((tag) => (
                      <View key={tag} style={[st.interestTag, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
                        <Text style={[st.interestTagText, { color: colors.accent }]}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
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

          {/* ── Sound preferences link ── */}
          <View style={[st.editRow, { marginTop: -8 }]}>
            <Pressable
              style={[st.editBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/profile/sounds" as `/${string}`)}
            >
              <Text style={[st.editBtnText, { color: colors.subtext }]}>🔊  Sound preferences</Text>
            </Pressable>
          </View>

          {/* ── Stats row ── */}
          <View style={[st.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {[
              { label: "COMPARES", value: comparesCount },
              { label: "VOTES", value: votesCount },
              { label: "OPEN", value: openCount },
              { label: "KEPT", value: savedPosts.length },
            ].map((s, i, arr) => (
              <View key={s.label} style={{ flex: 1, flexDirection: "row" }}>
                <View style={st.statBox}>
                  <Text style={[st.statValue, { color: colors.text }]}>{s.value}</Text>
                  <Text style={[st.statLabel, { color: colors.muted }]}>{s.label}</Text>
                </View>
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
              <Pressable style={[st.adminTab, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push("/profile/scheduled" as `/${string}`)}>
                <Text style={[st.adminTabText, { color: colors.text }]}>Scheduled →</Text>
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

          {/* ── Drops / Kept tab row ── */}
          <View style={[st.tabRow, { borderBottomColor: colors.border }]}>
            <Pressable style={[st.tabBtn, contentTab === "drops" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]} onPress={() => setContentTab("drops")}>
              <Text style={[st.tabBtnText, { color: contentTab === "drops" ? colors.accent : colors.muted }]}>
                ✦ Your drops{posts.length > 0 ? ` (${posts.length})` : ""}
              </Text>
            </Pressable>
            <Pressable style={[st.tabBtn, contentTab === "kept" && [st.tabBtnActive, { borderBottomColor: colors.accent }]]} onPress={() => setContentTab("kept")}>
              <Text style={[st.tabBtnText, { color: contentTab === "kept" ? colors.accent : colors.muted }]}>
                🔖 Kept{savedPosts.length > 0 ? ` (${savedPosts.length})` : ""}
              </Text>
            </Pressable>
          </View>

          {/* ── Drops / Kept content — fixed height, nested scroll ── */}
          <View style={{ height: SECTION_H }}>
            {contentTab === "drops" && (
              postsLoading && posts.length === 0 ? (
                <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                  {[0, 1, 2].map((i) => <SkeletonDropRow key={i} colors={colors} />)}
                </View>
              ) : posts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>No posts yet — drop something!</Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}
                >
                  {posts.map((p) => (
                    <DropRow key={p.id} post={p} colors={colors} onExtend={handleExtend} />
                  ))}
                </ScrollView>
              )
            )}

            {contentTab === "kept" && (
              savedPosts.length === 0 ? (
                <View style={[st.emptyBox, { borderColor: colors.border }]}>
                  <Text style={[st.emptyText, { color: colors.muted }]}>No saved posts yet</Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  <View style={st.keptGrid}>
                    {savedPosts.map((p, idx) => (
                      <View key={p.id} style={idx % 2 === 0 ? { marginRight: 8 } : { marginLeft: 8 }}>
                        <KeptCard post={p} colors={colors} />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )
            )}
          </View>

          {/* ── People section ── */}
          <View style={[st.peopleSectionHeader, { borderTopColor: colors.border }]}>
            <Text style={[st.peopleSectionTitle, { color: colors.text }]}>People</Text>
          </View>

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
              { key: "requests", label: `Requests${requestedMe.length > 0 ? ` (${requestedMe.length})` : ""}` },
              { key: "suggestions", label: "Suggestions" },
            ] as const).map((t) => (
              <Pressable
                key={t.key}
                style={[st.peopleTabBtn, peopleTab === t.key && [st.peopleTabBtnActive, { borderBottomColor: colors.accent }]]}
                onPress={() => setPeopleTab(t.key)}
              >
                <Text style={[st.peopleTabText, { color: peopleTab === t.key ? colors.accent : colors.muted }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* People tab content — fixed height, nested scroll */}
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={{ height: PEOPLE_H }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
          >
            {peopleTab === "friends" && (
              filteredFriends.length === 0 ? (
                <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>
                  {search ? "No friends match." : "No friends yet"}
                </Text>
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

            {peopleTab === "requests" && (
              requestedMe.length === 0 && requestedByMe.length === 0 ? (
                <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>No pending requests</Text>
              ) : (
                <>
                  {requestedMe.length > 0 && (
                    <>
                      <Text style={[st.requestsHeader, { color: colors.muted }]}>REQUESTED ME</Text>
                      {requestedMe.map((f) => (
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
                      ))}
                    </>
                  )}
                  {requestedByMe.length > 0 && (
                    <>
                      <Text style={[st.requestsHeader, { color: colors.muted, marginTop: requestedMe.length > 0 ? 12 : 0 }]}>SENT BY ME</Text>
                      {requestedByMe.map((f) => (
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
                      ))}
                    </>
                  )}
                </>
              )
            )}

            {peopleTab === "suggestions" && (
              filteredSuggestions.length === 0 ? (
                <Text style={[st.emptyText, { color: colors.muted, paddingVertical: 16 }]}>
                  {search ? "No suggestions match." : "No suggestions"}
                </Text>
              ) : filteredSuggestions.map((f) => (
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
  interestTag: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 2 },
  interestTagText: { fontSize: 12, fontWeight: "600" },

  // Edit + logout row
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

  // Admin row
  adminRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  adminRowLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  adminTab: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  adminTabText: { fontSize: 12, fontWeight: "600" },
  roleChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  roleChipText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  // Drops / Kept tab row
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginBottom: 4 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: {},
  tabBtnText: { fontSize: 13, fontWeight: "700" },

  // Drop list row
  dropRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropThumbWrap: { flexDirection: "row", width: 84, height: 60, borderRadius: 8, overflow: "hidden", flexShrink: 0 },
  dropThumb: { flex: 1, height: 60 },
  dropThumbLeft: {},
  dropMeta: { flex: 1, gap: 3 },
  dropTitle: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  dropSub: { fontSize: 11 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  optionChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, maxWidth: 130 },
  optionChipText: { fontSize: 11 },
  dropStatusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dropStatusText: { fontSize: 11, fontWeight: "600" },
  dropActions: { gap: 8, alignItems: "center", paddingTop: 2 },
  dropActionIcon: { fontSize: 16 },

  // Kept grid
  keptGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 8, marginBottom: 4 },
  keptCard: { width: KEPT_CARD_W, borderRadius: 12, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  keptImgArea: { flexDirection: "row", height: 100 },
  keptImg: { flex: 1, height: 100 },

  // Empty state
  emptyBox: { marginHorizontal: 16, borderRadius: 10, borderWidth: 1, padding: 18, alignItems: "center", marginBottom: 12 },
  emptyText: { fontSize: 13 },

  // People section
  peopleSectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, borderTopWidth: 1, marginTop: 8 },
  peopleSectionTitle: { fontSize: 18, fontWeight: "800" },
  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  peopleTabRow: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginBottom: 4 },
  peopleTabBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: "transparent" },
  peopleTabBtnActive: {},
  peopleTabText: { fontSize: 12, fontWeight: "700" },
  peopleList: { paddingHorizontal: 16, paddingBottom: 8 },
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
});
