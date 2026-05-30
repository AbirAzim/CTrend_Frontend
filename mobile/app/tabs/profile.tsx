import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME, USER_POSTS } from "@ctrend/shared/graphql/profile";
import { MY_FRIENDS } from "@ctrend/shared/graphql/friends";
import { MY_SAVED_POSTS, EXTEND_POST_VOTING } from "@ctrend/shared/graphql/feed";
import { START_DIRECT_CONVERSATION, ONLINE_USER_IDS } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

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
};

type UserPostsData = { getPostsByUser: UserPost[] };

type Friend = {
  id: string;
  username: string;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

type FriendsData = { myFriends: Friend[] };

type SavedPost = {
  id: string;
  imageUrls?: string[] | null;
  caption?: string | null;
};

type SavedPostsData = { mySavedPosts: SavedPost[] };
type OnlineData = { onlineUserIds: string[] };

// ─── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({ value, label, colors }: {
  value: number;
  label: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

// ─── Drop card ─────────────────────────────────────────────────────────────────

function DropCard({
  post,
  colors,
  onExtend,
}: {
  post: UserPost;
  colors: ReturnType<typeof useTheme>["colors"];
  onExtend: (postId: string, hours: number) => void;
}) {
  const img0 = post.imageUrls?.[0];
  const img1 = post.imageUrls?.[1];
  const totalVotes = post.totalVotes ?? (post.upvoteCount + post.downvoteCount);
  const timeLabel = post.votingEndsAt
    ? post.isVotingOpen
      ? `${formatRelativeTime(post.votingEndsAt)} left`
      : "Voting closed"
    : "";

  return (
    <View style={[styles.dropCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Comparison thumbnails */}
      <View style={styles.dropImgRow}>
        {img0 ? (
          <Image source={{ uri: img0 }} style={styles.dropImg} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.dropImg, { backgroundColor: colors.border }]} />
        )}
        {img1 ? (
          <Image source={{ uri: img1 }} style={[styles.dropImg, { marginLeft: 3 }]} contentFit="cover" cachePolicy="memory-disk" />
        ) : null}
      </View>

      {/* Caption */}
      {post.caption ? (
        <Text style={[styles.dropCaption, { color: colors.text }]} numberOfLines={2}>
          {post.caption}
        </Text>
      ) : null}

      {/* Time + vote count */}
      <View style={styles.dropMeta}>
        {timeLabel ? (
          <Text style={[styles.dropTime, { color: post.isVotingOpen ? colors.accent : colors.muted }]}>
            {timeLabel}
          </Text>
        ) : null}
        <Text style={[styles.dropVotes, { color: colors.muted }]}>
          {totalVotes} votes · {post.commentCount ?? 0} comments
        </Text>
      </View>

      {/* Action buttons */}
      <Pressable
        style={[styles.dropBtn, { backgroundColor: colors.accent }]}
        onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
      >
        <Text style={styles.dropBtnText}>Edit post</Text>
      </Pressable>

      {post.isVotingOpen ? (
        <>
          <Text style={[styles.extendLabel, { color: colors.muted }]}>Extend voting deadline</Text>
          <View style={styles.extendRow}>
            {([12, 24, 72] as const).map((h) => (
              <Pressable
                key={h}
                style={[styles.extendBtn, { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}
                onPress={() => onExtend(post.id, h)}
              >
                <Text style={[styles.extendBtnText, { color: colors.accent }]}>
                  +{h < 24 ? `${h}h` : `${h / 24}d`}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ─── Friend row ────────────────────────────────────────────────────────────────

function FriendRow({
  friend,
  isOnline,
  colors,
  onDm,
}: {
  friend: Friend;
  isOnline: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  onDm: (friendId: string) => void;
}) {
  const avatar = normalizeProfileImageUrl(friend.profileImageUrl);
  const name = friend.displayName?.trim() || friend.username;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <View style={[styles.friendRow, { borderColor: colors.border }]}>
      <Pressable
        style={styles.friendLeft}
        onPress={() => router.push(`/profile/${friend.id}` as `/${string}`)}
      >
        <View style={[styles.friendAvatar, { overflow: "hidden" }]}>
          {avatar
            ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={styles.friendAvatarText}>{initial}</Text>
          }
          {isOnline && <View style={styles.onlineDot} />}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.friendUsername, { color: colors.muted }]}>@{friend.username}</Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.dmBtn, { backgroundColor: colors.accent }]}
        onPress={() => onDm(friend.id)}
      >
        <Text style={styles.dmBtnText}>💬</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { logout, isAuthenticated, hydrated, user: storedUser } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dmLoading, setDmLoading] = useState<string | null>(null);

  const { data: meData, loading: meLoading } = useQuery<MeData>(ME, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  const me = meData?.me;
  const isAdmin = (me?.role ?? storedUser?.role)?.toLowerCase() === "admin";

  const { data: postsData, loading: postsLoading } = useQuery<UserPostsData>(USER_POSTS, {
    fetchPolicy: "cache-and-network",
    variables: { userId: me?.id },
    skip: !me?.id,
  });

  const { data: friendsData, loading: friendsLoading } = useQuery<FriendsData>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  const { data: savedData, loading: savedLoading } = useQuery<SavedPostsData>(MY_SAVED_POSTS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  const { data: onlineData } = useQuery<OnlineData>(ONLINE_USER_IDS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
    pollInterval: 30000,
  });

  const [extendVoting] = useMutation(EXTEND_POST_VOTING);
  const [startDm] = useMutation<{ startDirectConversation: { id: string } }>(START_DIRECT_CONVERSATION);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const avatar = normalizeProfileImageUrl(me?.profileImageUrl ?? storedUser?.profileImageUrl);
  const name = me?.displayName?.trim() || me?.username || storedUser?.displayName || storedUser?.username || "You";
  const initial = name.slice(0, 1).toUpperCase();

  const posts = postsData?.getPostsByUser ?? [];
  const friends = friendsData?.myFriends ?? [];
  const savedPosts = savedData?.mySavedPosts ?? [];
  const onlineSet = new Set(onlineData?.onlineUserIds ?? []);

  // Stats
  const comparesCount = posts.length;
  const imagesCount = posts.reduce((s, p) => s + (p.imageUrls?.length ?? 0), 0);
  const votesCount = posts.reduce((s, p) => s + (p.totalVotes ?? (p.upvoteCount + p.downvoteCount)), 0);
  const openCount = posts.filter((p) => p.isVotingOpen).length;

  async function handleExtend(postId: string, hours: number) {
    const newDate = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    try {
      await extendVoting({ variables: { postId, newVotingEndsAt: newDate } });
    } catch {
      Alert.alert("Error", "Could not extend voting deadline.");
    }
  }

  async function handleDm(friendId: string) {
    setDmLoading(friendId);
    try {
      const { data } = await startDm({ variables: { userId: friendId } });
      if (!data?.startDirectConversation) throw new Error();
      router.push(`/chat/${data.startDirectConversation.id}` as `/${string}`);
    } catch {
      Alert.alert("Error", "Could not open conversation.");
    } finally {
      setDmLoading(null);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/auth/login");
  }

  const loading = meLoading && !me;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Topbar corner label ── */}
      <Text style={[styles.cornerLabel, { color: colors.muted }]}>YOUR CORNER OF KE JITBE</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <>
          {/* ── Avatar + identity ── */}
          <View style={styles.identityRow}>
            <View style={[styles.avatarWrap, { borderColor: colors.accent }]}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: "#312e81", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )}
            </View>

            <View style={styles.identityInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={[styles.onlineBadge, { backgroundColor: "#22c55e22", borderColor: "#22c55e" }]}>
                  <Text style={styles.onlineBadgeText}>● Online</Text>
                </View>
              </View>
              {me?.email ? (
                <Text style={[styles.email, { color: colors.muted }]} numberOfLines={1}>{me.email}</Text>
              ) : null}
              <View style={styles.usernameRow}>
                {me?.username ? (
                  <Text style={[styles.username, { color: colors.accent }]}>@{me.username}</Text>
                ) : null}
                {isAdmin ? (
                  <View style={[styles.adminBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.adminBadgeText}>ADMIN</Text>
                  </View>
                ) : null}
              </View>
              {me?.bio ? (
                <Text style={[styles.bio, { color: colors.subtext }]} numberOfLines={2}>{me.bio}</Text>
              ) : null}
            </View>
          </View>

          {/* ── Edit profile button ── */}
          <Pressable
            style={[styles.editBtn, { backgroundColor: colors.card, borderColor: colors.accent }]}
            onPress={() => router.push("/profile/edit" as `/${string}`)}
          >
            <Text style={[styles.editBtnText, { color: colors.accent }]}>✎  Edit profile</Text>
          </Pressable>

          {/* ── Stats row ── */}
          <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <StatBox value={comparesCount} label="COMPARES" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBox value={imagesCount} label="IMAGES" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBox value={votesCount} label="VOTES" colors={colors} />
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <StatBox value={openCount} label="OPEN" colors={colors} />
          </View>

          {/* ── Action buttons ── */}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/friends" as `/${string}`)}
            >
              <Text style={[styles.actionBtnText, { color: colors.text }]}>+ Invite a friend</Text>
            </Pressable>
            {isAdmin ? (
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Alert.alert("Admin", "Admin management is available on the web app at kejitbe.app/admin")}
              >
                <Text style={[styles.actionBtnText, { color: colors.text }]}>+ Invite admin</Text>
              </Pressable>
            ) : null}
          </View>

          {/* ── Admin quick links ── */}
          {isAdmin ? (
            <View style={styles.adminRow}>
              <Text style={[styles.adminRowLabel, { color: colors.muted }]}>ADMIN</Text>
              <Pressable
                style={[styles.adminTab, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/admin" as `/${string}`)}
              >
                <Text style={[styles.adminTabText, { color: colors.text }]}>Admin Panel ▾</Text>
              </Pressable>
              <Pressable
                style={[styles.adminTab, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push("/profile/scheduled" as `/${string}`)}
              >
                <Text style={[styles.adminTabText, { color: colors.text }]}>Scheduled ▾</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Your drops ── */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>✦</Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your drops</Text>
          </View>

          {postsLoading && posts.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
          ) : posts.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No posts yet — drop something!</Text>
            </View>
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dropList}
              renderItem={({ item }) => (
                <DropCard
                  post={item}
                  colors={colors}
                  onExtend={handleExtend}
                />
              )}
            />
          )}

          {/* ── Friends ── */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Friends</Text>
            {friends.length > 0 ? (
              <Pressable onPress={() => router.push("/friends" as `/${string}`)}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </Pressable>
            ) : null}
          </View>

          {friendsLoading && friends.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
          ) : friends.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No friends yet</Text>
            </View>
          ) : (
            <View style={styles.friendsContainer}>
              {friends.slice(0, 5).map((f) => (
                <FriendRow
                  key={f.id}
                  friend={f}
                  isOnline={onlineSet.has(f.id)}
                  colors={colors}
                  onDm={handleDm}
                />
              ))}
              {friends.length > 5 ? (
                <Pressable
                  style={[styles.seeMoreBtn, { borderColor: colors.border }]}
                  onPress={() => router.push("/friends" as `/${string}`)}
                >
                  <Text style={[styles.seeMoreText, { color: colors.accent }]}>
                    +{friends.length - 5} more friends
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {/* ── Kept posts ── */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Kept posts</Text>
          </View>

          {savedLoading && savedPosts.length === 0 ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
          ) : savedPosts.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No saved posts yet</Text>
            </View>
          ) : (
            <View style={styles.keptGrid}>
              {savedPosts.map((p) => {
                const img0 = p.imageUrls?.[0];
                const img1 = p.imageUrls?.[1];
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.keptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push(`/post/${p.id}` as `/${string}`)}
                  >
                    <View style={styles.keptImgRow}>
                      {img0 ? (
                        <Image source={{ uri: img0 }} style={styles.keptImg} contentFit="cover" cachePolicy="memory-disk" />
                      ) : (
                        <View style={[styles.keptImg, { backgroundColor: colors.border }]} />
                      )}
                      {img1 ? (
                        <Image source={{ uri: img1 }} style={[styles.keptImg, { marginLeft: 2 }]} contentFit="cover" cachePolicy="memory-disk" />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* ── Email footer + logout ── */}
          {me?.email ? (
            <Text style={[styles.emailFooter, { color: colors.muted }]}>{me.email}</Text>
          ) : null}
        </>
      )}

      <Pressable
        style={[styles.logoutBtn, { backgroundColor: colors.card }]}
        onPress={() => void handleLogout()}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  cornerLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 16,
  },

  // Identity
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 14,
  },
  avatarWrap: { borderRadius: 50, borderWidth: 3, padding: 3 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: "#fff", fontSize: 30, fontWeight: "700" },
  identityInfo: { flex: 1, justifyContent: "center", gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 20, fontWeight: "800" },
  onlineBadge: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  onlineBadgeText: { color: "#22c55e", fontSize: 11, fontWeight: "700" },
  email: { fontSize: 12 },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  username: { fontSize: 13, fontWeight: "600" },
  adminBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  adminBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  bio: { fontSize: 13, lineHeight: 18 },

  // Edit button
  editBtn: {
    alignSelf: "center",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderWidth: 1,
    marginBottom: 20,
  },
  editBtnText: { fontSize: 14, fontWeight: "700" },

  // Stats
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 14 },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: "center",
  },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  // Admin row
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  adminRowLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  adminTab: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  adminTabText: { fontSize: 13, fontWeight: "600" },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionIcon: { color: "#f59e0b", fontSize: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  seeAll: { fontSize: 13, fontWeight: "700" },

  // Empty state
  emptyBox: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyText: { fontSize: 14 },

  // Drop cards
  dropList: { paddingHorizontal: 20, paddingBottom: 4, gap: 12 },
  dropCard: {
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    marginBottom: 20,
  },
  dropImgRow: { flexDirection: "row", marginBottom: 8 },
  dropImg: { flex: 1, height: 90, borderRadius: 8 },
  dropCaption: { fontSize: 13, fontWeight: "600", marginBottom: 6, lineHeight: 18 },
  dropMeta: { marginBottom: 8, gap: 2 },
  dropTime: { fontSize: 11, fontWeight: "700" },
  dropVotes: { fontSize: 11 },
  dropBtn: { borderRadius: 8, paddingVertical: 8, alignItems: "center", marginBottom: 8 },
  dropBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  extendLabel: { fontSize: 11, marginBottom: 6 },
  extendRow: { flexDirection: "row", gap: 6 },
  extendBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  extendBtnText: { fontSize: 12, fontWeight: "700" },

  // Friends
  friendsContainer: { paddingHorizontal: 20, marginBottom: 20, gap: 8 },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  friendLeft: { flex: 1, flexDirection: "row", alignItems: "center" },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#0a0a0a",
  },
  friendName: { fontSize: 14, fontWeight: "700" },
  friendUsername: { fontSize: 12, marginTop: 1 },
  dmBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dmBtnText: { fontSize: 16 },
  seeMoreBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  seeMoreText: { fontSize: 13, fontWeight: "700" },

  // Kept posts grid
  keptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  keptCard: {
    width: "47%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    padding: 6,
  },
  keptImgRow: { flexDirection: "row", gap: 3 },
  keptImg: { flex: 1, height: 70, borderRadius: 6 },

  // Footer
  emailFooter: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  logoutBtn: {
    alignSelf: "center",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 8,
  },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "700" },
});
