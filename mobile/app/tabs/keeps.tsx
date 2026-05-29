import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Text,
  View,
} from "react-native";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_SAVED_POSTS } from "@ctrend/shared/graphql/feed";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import type { FeedPostView } from "@ctrend/shared/types/feed";
import { FeedPostCard } from "../../components/FeedPostCard";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

type SavedData = { mySavedPosts: unknown[] };

export default function KeepsScreen() {
  const { isAuthenticated, hydrated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data, loading, error, refetch } = useQuery<SavedData>(MY_SAVED_POSTS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const posts: FeedPostView[] = (data?.mySavedPosts ?? []).map(
    (p) => mapGqlPostToFeedView(p as Parameters<typeof mapGqlPostToFeedView>[0]),
  );

  const renderItem: ListRenderItem<FeedPostView> = ({ item }) => <FeedPostCard post={item} />;

  if (loading && posts.length === 0) {
    return (
      <View style={[{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
      onRefresh={() => void refetch()}
      refreshing={loading}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 }}>
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
                <Text style={{ fontSize: 14, color: colors.subtext, textAlign: "center", marginBottom: 16 }}>Tap the save icon on any post.</Text>
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
