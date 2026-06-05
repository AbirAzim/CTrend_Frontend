import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { ME, MY_VOTED_POSTS, USER_POSTS } from "@ctrend/shared/graphql/profile";
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
import { MY_SAVED_POSTS } from "@ctrend/shared/graphql/feed";
import { START_DIRECT_CONVERSATION } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
import ProfileCompareCard from "../../components/ProfileCompareCard";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CARD_W = Math.floor((SCREEN_W - 38) / 2); // 2×14 padding + 10 gap
const TAB_BAR_H = 64 + 14;
const SECTION_H = Math.round(SCREEN_H * 0.55);
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

  const [contentTab, setContentTab] = useState<"drops" | "kept" | "voted">("drops");
  const [votedFilter, setVotedFilter] = useState<"all" | "anonymous">("all");
  const [peopleTab, setPeopleTab] = useState<"friends" | "received" | "sent" | "suggestions">("friends");
  const [search, setSearch] = useState("");
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());

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
      if (isAuthenticated) void refetchRequests();
    }, [isAuthenticated, refetchRequests]),
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
  const friends = friendsData?.myFriends ?? [];
  const requestedMe = requestsData?.friendRequests?.requestedMe ?? [];
  const requestedByMe = requestsData?.friendRequests?.requestedByMe ?? [];
  const suggestions = suggestionsData?.friendSuggestions ?? [];

  const comparesCount = posts.length;
  const votesCount = posts.reduce((s, p) => s + (p.totalVotes ?? (p.upvoteCount + p.downvoteCount)), 0);
  const openCount = posts.filter((p) => p.isVotingOpen).length;

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
});
