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
import { ImagesIcon } from "../../components/ContentIcons";

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
    pollInterval: 10000,
  });

  const [cancelMut, { loading: cancelling }] = useMutation(CANCEL_SCHEDULED_POST);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Live-post when a scheduled post goes live
  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    onData: () => void refetch(),
  });

  // Countdown tick
  const [, setTick] = useState(0);
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
            const img0 = p.imageUrls?.[0] ?? p.options?.[0]?.imageUrl ?? null;
            const img1 = p.imageUrls?.[1] ?? p.options?.[1]?.imageUrl ?? null;
            const isCancelling = cancellingId === p.id && cancelling;
            const timeLabel = countdown(p.scheduledAt);
            const isGoingLive = p.status === "PUBLISHED" || timeLabel === "Going live…";
            const goesLiveAt = p.scheduledAt ? new Date(p.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
            const optionChips = (p.options ?? []).slice(0, 4).filter((o) => o.label);

            return (
              <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Thumbnail strip — show both images side by side */}
                <View style={[st.thumbStrip, { backgroundColor: colors.section }]}>
                  {img0 ? (
                    <Image source={{ uri: img0 }} style={[st.thumb, img1 ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}]} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[st.thumb, { alignItems: "center", justifyContent: "center" }]}>
                      <ImagesIcon size={24} color={colors.muted} />
                    </View>
                  )}
                  {img1 ? (
                    <Image source={{ uri: img1 }} style={[st.thumb, { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]} contentFit="cover" cachePolicy="memory-disk" />
                  ) : null}
                </View>

                {/* Info */}
                <View style={st.info}>
                  {p.contentText ? (
                    <Text style={[st.caption, { color: colors.text }]} numberOfLines={1}>{p.contentText}</Text>
                  ) : null}

                  {/* Option chips */}
                  {optionChips.length > 0 && (
                    <View style={st.chipRow}>
                      {optionChips.map((o, i) => (
                        <View key={i} style={[st.chip, { backgroundColor: colors.section, borderColor: colors.border }]}>
                          <Text style={[st.chipText, { color: colors.subtext }]} numberOfLines={1}>{o.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Status + countdown */}
                  <View style={st.metaRow}>
                    <View style={[st.statusPill, { backgroundColor: isGoingLive ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)" }]}>
                      <Text style={[st.statusText, { color: isGoingLive ? "#22c55e" : "#f59e0b" }]}>
                        {isGoingLive ? "🟢 Going live" : `⏱ in ${timeLabel}`}
                      </Text>
                    </View>
                    {p.category ? (
                      <Text style={[st.category, { color: colors.muted }]}>{p.category.name}</Text>
                    ) : null}
                  </View>

                  {/* Absolute "Goes live at" date */}
                  {goesLiveAt && !isGoingLive ? (
                    <Text style={[st.date, { color: colors.muted }]}>Goes live at {goesLiveAt}</Text>
                  ) : null}
                </View>

                {/* Edit + Cancel */}
                <View style={st.actionRow}>
                  <Pressable
                    style={[st.editBtn, { borderColor: colors.accent }]}
                    onPress={() => router.push(`/edit-post?postId=${p.id}` as `/${string}`)}
                  >
                    <Text style={[st.editText, { color: colors.accent }]}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={[st.cancelBtn, { borderColor: "#f87171" }]}
                    onPress={() => void handleCancel(p.id)}
                    disabled={isCancelling}
                  >
                    {isCancelling
                      ? <ActivityIndicator size="small" color="#f87171" />
                      : <Text style={st.cancelText}>Cancel</Text>
                    }
                  </Pressable>
                </View>
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
    list: { padding: 14, gap: 14 },
    card: {
      borderRadius: 14,
      borderWidth: 1,
      overflow: "hidden",
    },
    thumbStrip: { flexDirection: "row", height: 90 },
    thumb: { flex: 1, height: 90, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
    info: { padding: 10, gap: 5 },
    caption: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    chipText: { fontSize: 11 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 11, fontWeight: "700" },
    category: { fontSize: 11 },
    date: { fontSize: 11 },
    actionRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      margin: 10,
      marginTop: 0,
    },
    editBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
    },
    editText: { fontSize: 12, fontWeight: "700" },
    cancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 64,
    },
    cancelText: { color: "#f87171", fontSize: 12, fontWeight: "700" },
  });
}
