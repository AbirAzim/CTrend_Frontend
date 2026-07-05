import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_SAVED_POSTS } from "@ctrend/shared/graphql/feed";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = (SCREEN_W - 48) / 2; // 2 cols with 16px margins + 16px gap

type SavedPost = {
  id: string;
  authorId?: string | null;
  imageUrls?: string[] | null;
  caption?: string | null;
  isVotingOpen?: boolean | null;
  upvoteCount: number;
  downvoteCount: number;
  commentCount?: number | null;
};

type SavedData = { mySavedPosts: SavedPost[] };

// ─── Compact kept card ────────────────────────────────────────────────────────

function KeptCard({ post }: { post: SavedPost }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const img0 = post.imageUrls?.[0];
  const img1 = post.imageUrls?.[1];
  const totalVotes = post.upvoteCount + post.downvoteCount;
  const isOpen = post.isVotingOpen !== false;
  const isOwner = !!user && !!post.authorId && post.authorId === user.id;

  return (
    <Pressable
      style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
    >
      {/* Image area — 120px tall, two thumbs side by side */}
      <View style={st.imgArea}>
        {/* Owner shortcut — jump straight to the edit screen (skips full view). */}
        {isOwner ? (
          <Pressable
            style={st.editBtn}
            hitSlop={8}
            onPress={() => router.push({ pathname: "/tabs/create", params: { editId: post.id } })}
            accessibilityLabel="Edit this post"
          >
            <Text style={st.editBtnText}>✏️</Text>
          </Pressable>
        ) : null}
        {img0 ? (
          <Image
            source={{ uri: img0 }}
            style={[st.img, img1 && { borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[st.img, { backgroundColor: colors.section }]} />
        )}
        {img1 ? (
          <Image
            source={{ uri: img1 }}
            style={[st.img, { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: 2 }]}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
      </View>

      {/* Info row */}
      <View style={st.info}>
        {post.caption ? (
          <Text style={[st.caption, { color: colors.text }]} numberOfLines={1}>
            {post.caption}
          </Text>
        ) : null}
        <View style={st.metaRow}>
          <Text style={[st.votes, { color: colors.muted }]}>
            {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          </Text>
          <View style={[st.badge, { backgroundColor: isOpen ? "#22c55e22" : colors.section, borderColor: isOpen ? "#22c55e" : colors.border }]}>
            <Text style={[st.badgeText, { color: isOpen ? "#22c55e" : colors.muted }]}>
              {isOpen ? "OPEN" : "CLOSED"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    width: CARD_W,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },
  imgArea: { flexDirection: "row", height: 110 },
  editBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnText: { fontSize: 14 },
  img: { flex: 1, height: 110, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  info: { padding: 8, gap: 4 },
  caption: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  votes: { fontSize: 11 },
  badge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function KeepsScreen() {
  const { isAuthenticated, hydrated } = useAuth();
  const { colors } = useTheme();
  const { setSavedCount, translateY } = useTabBar();
  const insets = useSafeAreaInsets();

  // This screen doesn't hide the footer on scroll, so pin it visible on focus —
  // otherwise it inherits a hidden state left behind by the feed/profile scroll.
  useFocusEffect(useCallback(() => { translateY.value = 0; }, [translateY]));

  const { data, loading, error, refetch } = useQuery<SavedData>(MY_SAVED_POSTS, {
    variables: { take: 100 },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    skip: !isAuthenticated,
  });

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/auth/login" as never);
  }, [hydrated, isAuthenticated]);

  useEffect(() => {
    if (data?.mySavedPosts) setSavedCount(data.mySavedPosts.length);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const posts = (data?.mySavedPosts ?? []) as SavedPost[];

  const renderItem: ListRenderItem<SavedPost> = ({ item, index }) => (
    <View style={index % 2 === 0 ? { marginRight: 8 } : { marginLeft: 8 }}>
      <KeptCard post={item} />
    </View>
  );

  if (loading && posts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={2}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }}
      onRefresh={() => void refetch()}
      refreshing={loading}
      ListHeaderComponent={
        <View style={{ paddingBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>Keeps</Text>
          <Text style={{ fontSize: 13, color: colors.subtext, marginTop: 2 }}>Posts you've saved</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            {error ? (
              <Text style={{ fontSize: 15, color: "#ef4444" }}>Could not load saves.</Text>
            ) : (
              <>
                <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 8 }}>No keeps yet</Text>
                <Text style={{ fontSize: 14, color: colors.subtext, textAlign: "center", marginBottom: 16 }}>
                  Tap the save icon on any post.
                </Text>
                <Text
                  style={{ fontSize: 14, color: colors.accent, fontWeight: "700" }}
                  onPress={() => router.push("/tabs" as `/${string}`)}
                >
                  Browse the feed →
                </Text>
              </>
            )}
          </View>
        ) : null
      }
    />
  );
}
