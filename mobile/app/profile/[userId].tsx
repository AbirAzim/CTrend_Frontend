import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ADD_FRIEND,
  FRIENDSHIP_STATUS,
  FRIEND_REQUESTS,
  GET_USER_PROFILE,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
  USER_FRIENDS,
  USER_VOTE_COUNT,
} from "@ctrend/shared/graphql/friends";
import { USER_POSTS } from "@ctrend/shared/graphql/profile";
import { ONLINE_USER_IDS, START_DIRECT_CONVERSATION } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useBackToFeed } from "../../hooks/useBackToFeed";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";
import { ProfileEngagementPanel } from "../../components/ProfileEngagementPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  email?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
  interests?: string[] | null;
  coins?: number | null;
};

type PostThumb = {
  id: string;
  imageUrls?: string[] | null;
  caption?: string | null;
  upvoteCount: number;
  downvoteCount: number;
  commentCount?: number | null;
};

type FriendshipStatus = "FRIEND" | "PENDING_SENT" | "PENDING_RECEIVED" | "NONE";

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

type ProfileData = { getUserProfile: UserProfile };
type StatusData = { friendshipStatus: string };
type PostsData = { getPostsByUser: PostThumb[] };
type OnlineData = { onlineUserIds: string[] };
type StartDmData = { startDirectConversation: { id: string } };
type UserFriendsData = { userFriends: FriendRow[] };
type VoteCountData = { userVoteCount: number };
type MyFriendsData = { myFriends: FriendRow[] };
type RequestsData = { friendRequests: { requestedByMe: FriendRow[]; requestedMe: FriendRow[] } };

const GRID_COLS = 3;
const { width: SCREEN_W } = Dimensions.get("window");
const THUMB_SIZE = Math.floor((SCREEN_W - 2) / GRID_COLS);
// Thumb size when the grid lives inside a padded accordion card.
const SCROLL_PAD = 20;
const CARD_BODY_PAD = 12;
const GRID_GAP = 4;
const CARD_THUMB = Math.floor(
  (SCREEN_W - SCROLL_PAD * 2 - CARD_BODY_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS,
);

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
}

// ─── Friend action button ─────────────────────────────────────────────────────

function FriendButton({
  status,
  userId,
  colors,
  showToast,
  onStatusChange,
}: {
  status: FriendshipStatus;
  userId: string;
  colors: ReturnType<typeof useTheme>["colors"];
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  onStatusChange: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [addFriend] = useMutation(ADD_FRIEND);
  const [unfriend] = useMutation(UNFRIEND);
  const [respond] = useMutation(RESPOND_FRIEND_REQUEST);

  async function handleAdd() {
    setLoading(true);
    try {
      await addFriend({ variables: { userId } });
      showToast("Friend request sent ✓", "success");
      onStatusChange();
    } catch {
      showToast("Failed to send request", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    setLoading(true);
    try {
      await respond({ variables: { requesterId: userId, accept: true } });
      showToast("Friend request accepted ✓", "success");
      onStatusChange();
    } catch {
      showToast("Failed to accept", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnfriend() {
    setLoading(true);
    try {
      await unfriend({ variables: { userId } });
      showToast("Unfriended", "info");
      onStatusChange();
    } catch {
      showToast("Failed to unfriend", "error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "FRIEND") {
    return (
      <Pressable
        style={[styles.friendBtn, { backgroundColor: colors.section, borderColor: colors.border }]}
        onPress={() => void handleUnfriend()}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator size="small" color={colors.muted} />
          : <Text style={[styles.friendBtnText, { color: colors.muted }]}>✓ Friends</Text>
        }
      </Pressable>
    );
  }

  if (status === "PENDING_SENT") {
    return (
      <View style={[styles.friendBtn, { backgroundColor: colors.section, borderColor: colors.border }]}>
        <Text style={[styles.friendBtnText, { color: colors.muted }]}>Pending…</Text>
      </View>
    );
  }

  if (status === "PENDING_RECEIVED") {
    return (
      <Pressable
        style={[styles.friendBtn, { backgroundColor: "#22c55e22", borderColor: "#22c55e" }]}
        onPress={() => void handleAccept()}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator size="small" color="#22c55e" />
          : <Text style={[styles.friendBtnText, { color: "#22c55e" }]}>Accept Request</Text>
        }
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.friendBtn, { backgroundColor: colors.accent }]}
      onPress={() => void handleAdd()}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text style={[styles.friendBtnText, { color: "#fff" }]}>+ Add Friend</Text>
      }
    </Pressable>
  );
}

// ─── Collapsible accordion card ─────────────────────────────────────────────────

function Section({
  icon, title, subtitle, open, onToggle, colors, children, onLayout,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  children: ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View
      style={[styles.accCard, { borderColor: colors.border, backgroundColor: colors.card }]}
      onLayout={onLayout}
    >
      <Pressable
        style={styles.accHead}
        onPress={onToggle}
        android_ripple={{ color: colors.accent + "11" }}
      >
        <View style={[styles.accIcon, { backgroundColor: colors.accent + "1a" }]}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.accTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.accSub, { color: colors.muted }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        <View style={[styles.accChevron, { borderColor: colors.border, backgroundColor: open ? colors.accent + "14" : "transparent" }]}>
          <Text style={{ color: open ? colors.accent : colors.muted, fontSize: 13, fontWeight: "800" }}>
            {open ? "▾" : "▸"}
          </Text>
        </View>
      </Pressable>
      {open ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();
  const goBack = useBackToFeed(); // cold-start from a notification → back to feed
  const [dmLoading, setDmLoading] = useState(false);
  const [startDm] = useMutation<StartDmData>(START_DIRECT_CONVERSATION);

  const isOwnProfile = Boolean(user && userId && user.id === userId);

  useEffect(() => {
    if (isOwnProfile) {
      router.replace("/tabs/profile" as `/${string}`);
    }
  }, [isOwnProfile]);

  const { data: profileData, loading: profileLoading, error: profileError } = useQuery<ProfileData>(
    GET_USER_PROFILE,
    { variables: { userId }, skip: !userId || isOwnProfile, fetchPolicy: "cache-and-network" },
  );

  const { data: statusData, refetch: refetchStatus } = useQuery<StatusData>(
    FRIENDSHIP_STATUS,
    {
      variables: { userId },
      skip: !userId || !isAuthenticated || isOwnProfile,
      fetchPolicy: "network-only",
    },
  );

  const { data: postsData, loading: postsLoading } = useQuery<PostsData>(
    USER_POSTS,
    { variables: { userId }, skip: !userId || isOwnProfile, fetchPolicy: "cache-and-network" },
  );

  const { data: onlineData } = useQuery<OnlineData>(ONLINE_USER_IDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });

  const { data: userFriendsData, loading: userFriendsLoading } = useQuery<UserFriendsData>(
    USER_FRIENDS,
    { variables: { userId }, skip: !userId || isOwnProfile || !isAuthenticated, fetchPolicy: "cache-and-network" },
  );

  const { data: voteCountData } = useQuery<VoteCountData>(
    USER_VOTE_COUNT,
    { variables: { userId }, skip: !userId || isOwnProfile || !isAuthenticated, fetchPolicy: "cache-and-network" },
  );

  // My own friends + pending-sent, to label rows in their friend list correctly.
  const { data: myFriendsData } = useQuery<MyFriendsData>(MY_FRIENDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const { data: myRequestsData } = useQuery<RequestsData>(FRIEND_REQUESTS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  const [addFriendRow] = useMutation(ADD_FRIEND);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // Accordion sections — collapsed by default for a clean first impression.
  const [openPosts, setOpenPosts] = useState(false);
  const [openFriends, setOpenFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const postsY = useRef(0);
  const friendsY = useRef(0);

  const togglePosts = () => { animateLayout(); setOpenPosts((v) => !v); };
  const toggleFriends = () => { animateLayout(); setOpenFriends((v) => !v); };

  // A stat tile → open its section and scroll it into view.
  function jumpTo(which: "posts" | "friends") {
    animateLayout();
    if (which === "posts") setOpenPosts(true);
    else setOpenFriends(true);
    const yRef = which === "posts" ? postsY : friendsY;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(yRef.current - 12, 0), animated: true });
    }, 170);
  }

  async function sendFriendRequest(targetId: string) {
    setAddingIds((s) => new Set(s).add(targetId));
    try {
      await addFriendRow({ variables: { userId: targetId } });
      setPendingIds((s) => new Set(s).add(targetId));
      showToast("Friend request sent ✓", "success");
    } catch {
      showToast("Failed to send request", "error");
    } finally {
      setAddingIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
    }
  }

  if (isOwnProfile) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const profile = profileData?.getUserProfile;
  const friendshipStatus = (statusData?.friendshipStatus ?? "NONE") as FriendshipStatus;
  const isFriend = friendshipStatus === "FRIEND";
  const posts = postsData?.getPostsByUser ?? [];
  const onlineSet = new Set(onlineData?.onlineUserIds ?? []);
  const isOnline = isFriend && Boolean(userId) && onlineSet.has(userId ?? "");
  const userFriends = userFriendsData?.userFriends ?? [];
  const voteCount = voteCountData?.userVoteCount ?? 0;
  const myFriendIds = new Set((myFriendsData?.myFriends ?? []).map((f) => f.id));
  const mySentIds = new Set((myRequestsData?.friendRequests?.requestedByMe ?? []).map((f) => f.id));
  const friendQuery = friendSearch.trim().toLowerCase();
  const shownFriends = friendQuery
    ? userFriends.filter((f) =>
        (f.displayName ?? "").toLowerCase().includes(friendQuery) ||
        (f.username ?? "").toLowerCase().includes(friendQuery) ||
        (f.email ?? "").toLowerCase().includes(friendQuery))
    : userFriends;

  const name = profile?.displayName?.trim() || profile?.username || "User";
  const initial = name.slice(0, 1).toUpperCase();
  const avatar = normalizeProfileImageUrl(profile?.profileImageUrl);

  async function handleMessage() {
    if (!userId) return;
    setDmLoading(true);
    try {
      const { data } = await startDm({ variables: { userId } });
      if (!data?.startDirectConversation) throw new Error();
      router.push(`/chat/${data.startDirectConversation.id}` as `/${string}`);
    } catch {
      showToast("Could not open chat", "error");
    } finally {
      setDmLoading(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ToastView />

      {/* Header bar */}
      <View
        style={[
          styles.topbar,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.topbarTitle, { color: colors.text }]} numberOfLines={1}>
          {profile?.username ? `@${profile.username}` : "Profile"}
        </Text>
        <View style={{ width: 56 }} />
      </View>

      {profileLoading && !profile ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : profileError || !profile ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>🔍</Text>
          <Text style={[styles.errorText, { color: colors.text }]}>User not found</Text>
          <Pressable onPress={goBack} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          {/* Avatar + name */}
          <View style={styles.heroSection}>
            <View style={[styles.avatarRing, { borderColor: isFriend ? "#22c55e" : colors.accent }]}>
              <View style={[styles.avatarWrap, { overflow: "hidden" }]}>
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  </View>
                )}
              </View>
              {isOnline && <View style={styles.onlineDot} />}
            </View>

            <Text style={[styles.displayName, { color: colors.text }]}>{name}</Text>
            {profile.username ? (
              <Text style={[styles.username, { color: colors.accent }]}>@{profile.username}</Text>
            ) : null}
            {profile.email ? (
              <Text style={[styles.email, { color: colors.muted }]}>{profile.email}</Text>
            ) : null}
            {isOnline && (
              <View style={styles.onlinePill}>
                <Text style={styles.onlinePillText}>● Online now</Text>
              </View>
            )}
          </View>

          {/* Bio */}
          {profile.bio ? (
            <Text style={[styles.bio, { color: colors.subtext }]}>{profile.bio}</Text>
          ) : null}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 ? (
            <View style={styles.interestsRow}>
              {profile.interests.map((tag) => (
                <View key={tag} style={[styles.interestTag, { backgroundColor: colors.section, borderColor: colors.border }]}>
                  <Text style={[styles.interestText, { color: colors.subtext }]}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <ProfileEngagementPanel
            userId={profile.id}
            coins={profile.coins ?? 0}
            isSelf={false}
            displayName={name}
          />

          {/* Action buttons */}
          {isAuthenticated && (
            <View style={styles.actionsRow}>
              <FriendButton
                status={friendshipStatus}
                userId={userId ?? ""}
                colors={colors}
                showToast={showToast}
                onStatusChange={() => void refetchStatus()}
              />
              {isFriend && (
                <Pressable
                  style={[styles.friendBtn, { backgroundColor: colors.card, borderColor: colors.border, marginLeft: 10 }]}
                  onPress={() => void handleMessage()}
                  disabled={dmLoading}
                >
                  {dmLoading
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Text style={[styles.friendBtnText, { color: colors.accent }]}>💬 Message</Text>
                  }
                </Pressable>
              )}
            </View>
          )}

          {/* Stats — compares & friends jump to their sections */}
          {isAuthenticated && (
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable style={styles.stat} onPress={() => jumpTo("posts")} android_ripple={{ color: colors.accent + "18" }}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{posts.length}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>compares ›</Text>
              </Pressable>
              <View style={[styles.statSep, { backgroundColor: colors.border }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.text }]}>{voteCount}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>votes</Text>
              </View>
              <View style={[styles.statSep, { backgroundColor: colors.border }]} />
              <Pressable style={styles.stat} onPress={() => jumpTo("friends")} android_ripple={{ color: colors.accent + "18" }}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{userFriends.length}</Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>friends ›</Text>
              </Pressable>
            </View>
          )}

          {/* Compares (collapsible) */}
          {isAuthenticated && (
            <Section
              icon="📊"
              title="Compares"
              subtitle={posts.length > 0 ? `${posts.length} compare${posts.length === 1 ? "" : "s"} to explore` : "No compares yet"}
              open={openPosts}
              onToggle={togglePosts}
              colors={colors}
              onLayout={(e) => { postsY.current = e.nativeEvent.layout.y; }}
            >
              {postsLoading && posts.length === 0 ? (
                <View style={[styles.center, { paddingVertical: 20 }]}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : posts.length === 0 ? (
                <View style={[styles.center, { paddingVertical: 24 }]}>
                  <Text style={{ fontSize: 30, marginBottom: 6 }}>📭</Text>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>No compares yet</Text>
                </View>
              ) : (
                <View style={styles.gridCard}>
                  {posts.map((post) => {
                    const thumb = post.imageUrls?.[0];
                    const votes = post.upvoteCount + post.downvoteCount;
                    return (
                      <Pressable
                        key={post.id}
                        style={styles.gridItemCard}
                        onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
                      >
                        {thumb ? (
                          <Image
                            source={{ uri: thumb }}
                            style={styles.gridThumb}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={[styles.gridThumb, { backgroundColor: colors.section, alignItems: "center", justifyContent: "center" }]}>
                            <Text style={{ color: colors.muted, fontSize: 20 }}>🖼</Text>
                          </View>
                        )}
                        {votes > 0 && (
                          <View style={styles.gridOverlay}>
                            <Text style={styles.gridOverlayText}>{votes} votes</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Section>
          )}

          {/* Friends (collapsible + search) */}
          {isAuthenticated && (
            <Section
              icon="👥"
              title="Friends"
              subtitle={userFriends.length > 0 ? `${userFriends.length} friend${userFriends.length === 1 ? "" : "s"}` : "No friends yet"}
              open={openFriends}
              onToggle={toggleFriends}
              colors={colors}
              onLayout={(e) => { friendsY.current = e.nativeEvent.layout.y; }}
            >
              {userFriendsLoading && userFriends.length === 0 ? (
                <View style={[styles.center, { paddingVertical: 20 }]}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : userFriends.length === 0 ? (
                <View style={[styles.center, { paddingVertical: 24 }]}>
                  <Text style={{ fontSize: 28, marginBottom: 6 }}>👥</Text>
                  <Text style={[styles.emptyText, { color: colors.muted }]}>No friends to show yet</Text>
                </View>
              ) : (
                <View style={{ alignSelf: "stretch" }}>
                  {/* search */}
                  <View style={[styles.searchWrap, { backgroundColor: colors.section, borderColor: colors.border }]}>
                    <Text style={{ color: colors.muted, fontSize: 14 }}>🔍</Text>
                    <TextInput
                      style={[styles.searchInput, { color: colors.text }]}
                      placeholder="Search friends"
                      placeholderTextColor={colors.muted}
                      value={friendSearch}
                      onChangeText={setFriendSearch}
                      autoCapitalize="none"
                    />
                    {friendSearch.length > 0 ? (
                      <Pressable onPress={() => setFriendSearch("")} hitSlop={8}>
                        <Text style={{ color: colors.muted, fontSize: 15 }}>✕</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {shownFriends.length === 0 ? (
                    <View style={[styles.center, { paddingVertical: 18 }]}>
                      <Text style={[styles.emptyText, { color: colors.muted }]}>
                        No friends match “{friendSearch.trim()}”
                      </Text>
                    </View>
                  ) : shownFriends.map((f) => {
                    const fName = f.displayName?.trim() || f.username?.trim() || "User";
                    const fInitial = fName.slice(0, 1).toUpperCase();
                    const fAvatar = normalizeProfileImageUrl(f.profileImageUrl);
                    const isMe = Boolean(user && f.id === user.id);
                    const alreadyFriend = myFriendIds.has(f.id);
                    const requested = mySentIds.has(f.id) || pendingIds.has(f.id);
                    return (
                      <View key={f.id} style={[styles.friendRow, { borderBottomColor: colors.border }]}>
                        <Pressable
                          style={styles.friendRowMain}
                          onPress={() => router.push(`/profile/${f.id}` as `/${string}`)}
                        >
                          <View style={styles.friendAvatarWrap}>
                            {fAvatar ? (
                              <Image source={{ uri: fAvatar }} style={styles.friendAvatar} contentFit="cover" cachePolicy="memory-disk" />
                            ) : (
                              <View style={[styles.friendAvatar, styles.avatarFallback]}>
                                <Text style={styles.friendAvatarInitial}>{fInitial}</Text>
                              </View>
                            )}
                            {onlineSet.has(f.id) && <View style={styles.friendOnlineDot} />}
                          </View>
                          <Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{fName}</Text>
                        </Pressable>
                        {!isMe && (
                          alreadyFriend ? (
                            <View style={[styles.friendAddBtn, { borderColor: colors.border, backgroundColor: colors.section }]}>
                              <Text style={[styles.friendAddText, { color: colors.muted }]}>✓ Friend</Text>
                            </View>
                          ) : requested ? (
                            <View style={[styles.friendAddBtn, { borderColor: colors.border, backgroundColor: colors.section }]}>
                              <Text style={[styles.friendAddText, { color: colors.muted }]}>Requested</Text>
                            </View>
                          ) : (
                            <Pressable
                              style={[styles.friendAddBtn, { backgroundColor: colors.accent }]}
                              onPress={() => void sendFriendRequest(f.id)}
                              disabled={addingIds.has(f.id)}
                            >
                              {addingIds.has(f.id)
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={[styles.friendAddText, { color: "#fff" }]}>+ Add</Text>}
                            </Pressable>
                          )
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 56, justifyContent: "center" },
  backText: { fontSize: 18, fontWeight: "600" },
  topbarTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  errorText: { fontSize: 18, fontWeight: "700" },
  scrollContent: { alignItems: "center", paddingTop: 28, paddingHorizontal: 20 },
  heroSection: { alignItems: "center", marginBottom: 12 },
  avatarRing: {
    borderRadius: 56,
    borderWidth: 3,
    padding: 3,
    marginBottom: 14,
    position: "relative",
  },
  avatarWrap: { borderRadius: 50 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarFallback: {
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "700" },
  onlineDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  displayName: { fontSize: 22, fontWeight: "800", marginBottom: 2 },
  username: { fontSize: 14, marginBottom: 6 },
  email: { fontSize: 13, marginBottom: 8 },
  onlinePill: {
    backgroundColor: "#16a34a22",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 4,
  },
  onlinePillText: { color: "#22c55e", fontSize: 12, fontWeight: "700" },
  bio: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  interestsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  interestTag: {
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  interestText: { fontSize: 12, fontWeight: "600" },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  friendBtn: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: "center",
  },
  friendBtnText: { fontSize: 14, fontWeight: "700" },
  divider: { width: "100%", height: StyleSheet.hairlineWidth, marginBottom: 16 },
  statsRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  statSep: { width: StyleSheet.hairlineWidth, height: 28 },
  friendsSection: { alignSelf: "stretch", marginTop: 20 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  friendRowMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  friendAvatarWrap: { position: "relative", marginRight: 12 },
  friendAvatar: { width: 44, height: 44, borderRadius: 22 },
  friendAvatarInitial: { color: "#fff", fontSize: 18, fontWeight: "700" },
  friendOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  friendName: { flex: 1, fontSize: 15, fontWeight: "700" },
  friendAddBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minWidth: 76,
    alignItems: "center",
    marginLeft: 10,
  },
  friendAddText: { fontSize: 13, fontWeight: "700" },
  // Accordion card
  accCard: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  accHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  accIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  accTitle: { fontSize: 15.5, fontWeight: "800" },
  accSub: { fontSize: 11.5, marginTop: 2 },
  accChevron: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  accBody: { paddingHorizontal: CARD_BODY_PAD, paddingBottom: 12 },
  // Card-fitted compares grid
  gridCard: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridItemCard: {
    width: CARD_THUMB,
    height: CARD_THUMB,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  // Friends search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  emptyText: { fontSize: 14, fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    marginHorizontal: -20,
  },
  gridItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderWidth: 1,
    borderColor: "transparent",
    overflow: "hidden",
    position: "relative",
  },
  gridThumb: { width: "100%", height: "100%" },
  gridOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  gridOverlayText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});
