import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ADD_FRIEND,
  FRIENDSHIP_STATUS,
  GET_USER_PROFILE,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
} from "@ctrend/shared/graphql/friends";
import { USER_POSTS } from "@ctrend/shared/graphql/profile";
import { ONLINE_USER_IDS, START_DIRECT_CONVERSATION } from "@ctrend/shared/graphql/messages";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserProfile = {
  id: string;
  username: string;
  displayName?: string | null;
  email?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
  interests?: string[] | null;
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

type ProfileData = { getUserProfile: UserProfile };
type StatusData = { friendshipStatus: string };
type PostsData = { getPostsByUser: PostThumb[] };
type OnlineData = { onlineUserIds: string[] };
type StartDmData = { startDirectConversation: { id: string } };

const GRID_COLS = 3;
const { width: SCREEN_W } = Dimensions.get("window");
const THUMB_SIZE = Math.floor((SCREEN_W - 2) / GRID_COLS);

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();
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

  if (isOwnProfile) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const profile = profileData?.getUserProfile;
  const friendshipStatus = (statusData?.friendshipStatus ?? "NONE") as FriendshipStatus;
  const isFriend = friendshipStatus === "FRIEND";
  const posts = postsData?.getPostsByUser ?? [];
  const onlineSet = new Set(onlineData?.onlineUserIds ?? []);
  const isOnline = isFriend && Boolean(userId) && onlineSet.has(userId ?? "");

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
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
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

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Posts grid */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Posts</Text>

          {postsLoading && posts.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : posts.length === 0 ? (
            <View style={[styles.center, { paddingVertical: 32 }]}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>No posts yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {posts.map((post) => {
                const thumb = post.imageUrls?.[0];
                return (
                  <Pressable
                    key={post.id}
                    style={styles.gridItem}
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
                    {/* vote count overlay */}
                    <View style={styles.gridOverlay}>
                      <Text style={styles.gridOverlayText}>
                        {post.upvoteCount + post.downvoteCount > 0
                          ? `${post.upvoteCount + post.downvoteCount} votes`
                          : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
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
    marginBottom: 20,
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
