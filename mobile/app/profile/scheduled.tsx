import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_SCHEDULED_POSTS, CANCEL_SCHEDULED_POST, NEW_POSTS } from "@ctrend/shared/graphql/feed";
import { useSubscription } from "@apollo/client/react";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

type ScheduledPost = {
  id: string;
  contentText?: string | null;
  imageUrls?: string[] | null;
  options?: Array<{ label: string; imageUrl?: string | null }> | null;
  category?: { id: string; name: string } | null;
  status: string;
  scheduledAt?: string | null;
  createdAt: string;
};

type ScheduledData = { myScheduledPosts: ScheduledPost[] };

function countdown(scheduledAt: string | null | undefined): string {
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

export default function ScheduledPostsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showToast, ToastView } = useToast();

  const { data, loading, refetch } = useQuery<ScheduledData>(MY_SCHEDULED_POSTS, {
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });

  const [cancelMut, { loading: cancelling }] = useMutation(CANCEL_SCHEDULED_POST);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Live-post when a scheduled post goes live
  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    onData: () => void refetch(),
  });

  // Countdown tick
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const posts = data?.myScheduledPosts ?? [];

  async function handleCancel(postId: string) {
    Alert.alert("Cancel post", "This scheduled post will be removed. Are you sure?", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel post",
        style: "destructive",
        onPress: async () => {
          setCancellingId(postId);
          try {
            await cancelMut({ variables: { postId } });
            void refetch();
            showToast("Post cancelled", "success");
          } catch {
            showToast("Could not cancel post", "error");
          } finally {
            setCancellingId(null);
          }
        },
      },
    ]);
  }

  const st = styles(colors);

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <ToastView />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Scheduled Posts",
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 4 }}>
              <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 16 }}>← Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {loading && posts.length === 0 ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : posts.length === 0 ? (
        <View style={st.center}>
          <Text style={[st.emptyIcon]}>📅</Text>
          <Text style={[st.emptyText, { color: colors.muted }]}>No scheduled posts</Text>
          <Pressable style={[st.createBtn, { backgroundColor: colors.accent }]} onPress={() => router.push("/tabs/create" as `/${string}`)}>
            <Text style={st.createBtnText}>+ Create a post</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={st.list}
          renderItem={({ item: p }) => {
            const thumb = p.imageUrls?.[0] ?? p.options?.[0]?.imageUrl ?? null;
            const isCancelling = cancellingId === p.id && cancelling;
            const timeLabel = countdown(p.scheduledAt);
            const isGoingLive = p.status === "PUBLISHED" || timeLabel === "Going live…";

            return (
              <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Thumbnail */}
                {thumb ? (
                  <Image source={{ uri: thumb }} style={st.thumb} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[st.thumb, st.thumbPlaceholder, { backgroundColor: colors.section }]}>
                    <Text style={{ fontSize: 28 }}>🖼</Text>
                  </View>
                )}

                {/* Info */}
                <View style={st.info}>
                  {p.contentText ? (
                    <Text style={[st.caption, { color: colors.text }]} numberOfLines={2}>{p.contentText}</Text>
                  ) : null}
                  <View style={st.metaRow}>
                    <View style={[st.statusPill, { backgroundColor: isGoingLive ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)" }]}>
                      <Text style={[st.statusText, { color: isGoingLive ? "#22c55e" : "#f59e0b" }]}>
                        {isGoingLive ? "🟢 Going live" : `⏱ ${timeLabel}`}
                      </Text>
                    </View>
                    {p.category ? (
                      <Text style={[st.category, { color: colors.muted }]}>{p.category.name}</Text>
                    ) : null}
                  </View>
                  {p.scheduledAt ? (
                    <Text style={[st.date, { color: colors.muted }]}>
                      {new Date(p.scheduledAt).toLocaleString()}
                    </Text>
                  ) : null}
                </View>

                {/* Cancel */}
                <Pressable
                  style={[st.cancelBtn, { borderColor: "#f87171" }]}
                  onPress={() => void handleCancel(p.id)}
                  disabled={isCancelling}
                >
                  {isCancelling
                    ? <ActivityIndicator size="small" color="#f87171" />
                    : <Text style={st.cancelText}>✕</Text>
                  }
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function styles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyIcon: { fontSize: 48 },
    emptyText: { fontSize: 15, fontWeight: "600" },
    createBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
    createBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    list: { padding: 14, gap: 12 },
    card: {
      flexDirection: "row",
      borderRadius: 14,
      borderWidth: 1,
      overflow: "hidden",
      alignItems: "center",
    },
    thumb: { width: 80, height: 80 },
    thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    info: { flex: 1, padding: 10, gap: 4 },
    caption: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 11, fontWeight: "700" },
    category: { fontSize: 11 },
    date: { fontSize: 11, marginTop: 2 },
    cancelBtn: {
      width: 36, height: 36, borderRadius: 18,
      borderWidth: 1.5, alignItems: "center", justifyContent: "center",
      marginRight: 10,
    },
    cancelText: { color: "#f87171", fontSize: 14, fontWeight: "700" },
  });
}
