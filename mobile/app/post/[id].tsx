import { useQuery } from "@apollo/client/react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GET_POST_BY_ID } from "@ctrend/shared/graphql/feed";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { useAuth } from "../../context/AuthContext";
import { useBackToFeed } from "../../hooks/useBackToFeed";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";
import { postWebUrl } from "../../lib/postPermalink";
import * as Clipboard from "expo-clipboard";
import { FeedPostCard } from "../../components/FeedPostCard";

type PostData = { getPostById: unknown };

export default function PostDetailScreen() {
  const { id, commentId: deepLinkCommentId } = useLocalSearchParams<{
    id: string;
    commentId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, isAuthenticated, hydrated } = useAuth();
  const { showToast, ToastView } = useToast();

  const { data: postData, loading: postLoading, error: postError } = useQuery<PostData>(
    GET_POST_BY_ID,
    { variables: { id }, skip: !id || !isAuthenticated, fetchPolicy: "cache-first" },
  );

  const post = postData?.getPostById
    ? mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0])
    : null;

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  const goBack = useBackToFeed();

  async function copyLink() {
    if (!id) return;
    try {
      await Clipboard.setStringAsync(postWebUrl(id));
      showToast("Copied ✓", "success");
    } catch {
      /* ignore */
    }
  }

  const st = useMemo(
    () =>
      StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.bg },
        scroll: { flex: 1 },
        headerBack: { paddingHorizontal: 4 },
        headerBackText: { fontSize: 16, color: colors.accent, fontWeight: "700" },
        headerCopy: { paddingHorizontal: 8, paddingVertical: 4 },
        headerCopyText: { fontSize: 14, color: colors.accent, fontWeight: "700" },
        loadingRow: { paddingVertical: 24, alignItems: "center" },
        errorRow: { paddingHorizontal: 14, paddingVertical: 12 },
        errorText: { fontSize: 14, color: "#f87171" },
        ownerActions: {
          flexDirection: "row",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        ownerBtn: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 10,
          alignItems: "center",
          borderWidth: 1,
          borderColor: colors.border,
        },
        ownerBtnText: { fontSize: 13, fontWeight: "700", color: colors.text },
      }),
    [colors],
  );

  if (!hydrated || !isAuthenticated) {
    return (
      <View style={[st.flex, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={st.flex}>
      <ToastView />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Post",
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text },
          headerLeft: () => (
            <TouchableOpacity onPress={goBack} style={st.headerBack}>
              <Text style={st.headerBackText}>← Back</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => void copyLink()}
              style={st.headerCopy}
              accessibilityLabel="Copy link"
            >
              <Text style={st.headerCopyText}>🔗 Copy link</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={st.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {postLoading && !post ? (
          <View style={st.loadingRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : postError && !post ? (
          <View style={st.errorRow}>
            <Text style={st.errorText}>Could not load post.</Text>
          </View>
        ) : post ? (
          <FeedPostCard
            post={post}
            variant="detail"
            initialCommentsOpen={Boolean(deepLinkCommentId)}
            highlightCommentId={deepLinkCommentId ?? null}
          />
        ) : null}

        {post && user && post.authorId === user.id ? (
          <View style={st.ownerActions}>
            <TouchableOpacity
              style={st.ownerBtn}
              onPress={() => {
                const fmt = post.format ?? "";
                if (fmt === "poll" || fmt === "announcement") {
                  router.push({ pathname: "/edit-post", params: { postId: post.id } } as never);
                } else {
                  router.push({ pathname: "/tabs/create", params: { editId: post.id } });
                }
              }}
              accessibilityLabel="Edit this post"
            >
              <Text style={st.ownerBtnText}>✏️ Edit post</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
