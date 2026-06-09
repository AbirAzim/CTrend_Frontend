import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GET_POST_BY_ID, UPDATE_POST, CATEGORIES } from "@ctrend/shared/graphql/feed";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { ImagePositionEditor } from "../components/ImagePositionEditor";
import { DEFAULT_IMAGE_FOCAL, hasCustomFocal } from "../lib/imageFocal";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string } };

type Category = { id: string; name?: string | null };
type CategoriesData = { categories: Category[] };
type PostData = { getPostById: unknown };

const SCHEDULE_PRESETS: { label: string; hours: number }[] = [
  { label: "+1h", hours: 1 },
  { label: "+6h", hours: 6 },
  { label: "+1d", hours: 24 },
  { label: "+3d", hours: 72 },
  { label: "+1w", hours: 168 },
];

function fmtScheduleSummary(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const { data: postData, loading: postLoading } = useQuery<PostData>(GET_POST_BY_ID, {
    variables: { id: postId },
    skip: !postId,
    fetchPolicy: "network-only",
  });

  const { data: catData } = useQuery<CategoriesData>(CATEGORIES, { fetchPolicy: "cache-first" });
  const categories = catData?.categories ?? [];

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [options, setOptions] = useState<
    Array<{ label: string; imageUrl: string; imageFocalX?: number | null; imageFocalY?: number | null }>
  >([]);
  const [isPoll, setIsPoll] = useState(false);
  // Whether the post already has votes — gates the replace-photo warning.
  const [hasVotes, setHasVotes] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [positionIdx, setPositionIdx] = useState<number | null>(null);
  // Poll-only: post-level body/context photos, shown locked (votes depend on them).
  const [bodyImages, setBodyImages] = useState<string[]>([]);
  // Friends-only ↔ platform-wide (global) audience toggle (post owners only).
  const [broadcastGlobally, setBroadcastGlobally] = useState(false);
  const [initialBroadcast, setInitialBroadcast] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [endingSoonLead, setEndingSoonLead] = useState("5");
  const [initialized, setInitialized] = useState(false);
  // Scheduled (not-yet-published) posts can change their go-live time. Once
  // published this section never shows, so the schedule time is locked.
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });

  // Pre-fill form when post loads
  useEffect(() => {
    if (!postData?.getPostById || initialized) return;
    const post = mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0]);
    const poll = post.format === "poll";
    setIsPoll(poll);
    const optionVotes = (post.optionStats ?? []).reduce(
      (sum, s) => sum + (s.count ?? 0),
      0,
    );
    setHasVotes(
      (post.upvoteCount ?? 0) + (post.downvoteCount ?? 0) > 0 || optionVotes > 0,
    );
    setCaption(post.caption ?? "");
    setEndingSoonLead(String(post.endingSoonLeadMinutes ?? 5));
    setBroadcastGlobally(Boolean(post.isUserGlobalBroadcast));
    setInitialBroadcast(Boolean(post.isUserGlobalBroadcast));
    const scheduled = (post.status ?? "").toLowerCase() === "scheduled";
    setIsScheduled(scheduled);
    if (scheduled && post.scheduledAt) {
      const d = new Date(post.scheduledAt);
      if (!Number.isNaN(d.getTime())) setScheduleDate(d);
    }
    if (poll) {
      // Poll options carry their own (optional) thumbnail; body photos are separate.
      setOptions(
        (post.postOptions ?? []).map((o) => ({
          label: o.label ?? "",
          imageUrl: o.imageUrl ?? "",
          imageFocalX: o.imageFocalX ?? null,
          imageFocalY: o.imageFocalY ?? null,
        })),
      );
      setBodyImages(post.imageUrls ?? []);
    } else {
      setOptions(
        post.imageUrls.map((url, i) => ({
          imageUrl: url,
          label: post.postOptions?.[i]?.label ?? "",
          imageFocalX: post.postOptions?.[i]?.imageFocalX ?? null,
          imageFocalY: post.postOptions?.[i]?.imageFocalY ?? null,
        })),
      );
    }
    // Try to match category by checking the raw data
    const raw = postData.getPostById as Record<string, unknown>;
    const cat = raw.category as { id: string } | null | undefined;
    if (cat?.id) setCategoryId(cat.id);
    setInitialized(true);
  }, [postData, initialized]);

  const [updatePost, { loading: saving }] = useMutation(UPDATE_POST);
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);

  // Upload a freshly picked image into an option slot; a new image resets that
  // option's focal point (it was framed at pick time).
  async function uploadOptionImage(
    idx: number,
    uri: string,
    mimeType = "image/jpeg",
    fileName?: string,
  ) {
    setUploadingIdx(idx);
    setSubmitError(null);
    try {
      const ext = mimeType.split("/")[1] ?? "jpg";
      const filename = fileName ?? `photo_${Date.now()}.${ext}`;
      const { data } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
      if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL.");
      const { uploadUrl, publicUrl } = data.getImageUploadUrl;
      let uploadUri = uri;
      if (Platform.OS === "android" && !uri.startsWith("file://")) {
        uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: uploadUri });
      }
      const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed: ${res.status}`);
      setOptions((prev) =>
        prev.map((o, j) =>
          j === idx
            ? { ...o, imageUrl: publicUrl, imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL }
            : o,
        ),
      );
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    }
    setUploadingIdx(null);
  }

  async function pickOptionImage(idx: number) {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Gallery access is required.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.92,
        // Compare images frame portrait; poll thumbnails are square-ish.
        allowsEditing: true,
        aspect: isPoll ? [1, 1] : [4, 5],
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await uploadOptionImage(idx, asset.uri, asset.mimeType ?? "image/jpeg", asset.fileName ?? undefined);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  // Swapping an existing option's image resets votes — confirm first when votes
  // exist. Repositioning (focal) never resets, so it's not gated.
  function requestReplaceImage(idx: number) {
    if (hasVotes && options[idx]?.imageUrl) {
      Alert.alert(
        isPoll ? "Replace photo?" : "Replace image?",
        `Replacing this ${isPoll ? "option's photo" : "image"} will remove all current votes on this post. Repositioning the existing ${isPoll ? "photo" : "image"} keeps the votes.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Replace anyway", style: "destructive", onPress: () => void pickOptionImage(idx) },
        ],
      );
      return;
    }
    void pickOptionImage(idx);
  }

  async function handleSave() {
    setSubmitError(null);
    if (!categoryId) { setSubmitError("Please select a category."); return; }

    const adminInput = isAdmin
      ? {
          endingSoonLeadMinutes: Math.max(
            1,
            Math.min(1440, Math.round(Number(endingSoonLead) || 5)),
          ),
        }
      : {};
    // Only owners (non-admins) toggle audience, and only send it when changed.
    const audienceInput =
      !isAdmin && broadcastGlobally !== initialBroadcast ? { broadcastGlobally } : {};

    // Reschedule only for not-yet-published posts; published posts never send it.
    let scheduleInput: { scheduledAt: string } | Record<string, never> = {};
    if (isScheduled) {
      if (scheduleDate.getTime() <= Date.now()) {
        setSubmitError("Schedule time must be in the future.");
        return;
      }
      scheduleInput = { scheduledAt: scheduleDate.toISOString() };
    }

    if (isPoll) {
      const labeled = options.filter((o) => o.label.trim().length > 0);
      if (labeled.length < 2) {
        setSubmitError("A poll needs at least 2 options with labels.");
        return;
      }
      try {
        await updatePost({
          variables: {
            postId,
            input: {
              caption: caption.trim() || undefined,
              categoryId,
              // Preserve each option's image/focal — only labels change, so votes
              // stay intact. imageUrls (body photos) is omitted to leave it untouched.
              options: labeled.map((o) => ({
                label: o.label.trim(),
                ...(o.imageUrl
                  ? {
                      imageUrl: o.imageUrl,
                      imageFocalX: o.imageFocalX ?? undefined,
                      imageFocalY: o.imageFocalY ?? undefined,
                    }
                  : {}),
              })),
              ...adminInput,
              ...audienceInput,
              ...scheduleInput,
            },
          },
        });
        router.back();
      } catch (err: unknown) {
        setSubmitError(getApolloErrorMessage(err));
      }
      return;
    }

    try {
      await updatePost({
        variables: {
          postId,
          input: {
            caption: caption.trim() || undefined,
            categoryId,
            options: options.map((o) => ({
              label: o.label,
              imageUrl: o.imageUrl,
              imageFocalX: o.imageFocalX ?? undefined,
              imageFocalY: o.imageFocalY ?? undefined,
            })),
            imageUrls: options.map((o) => o.imageUrl),
            ...adminInput,
            ...audienceInput,
            ...scheduleInput,
          },
        },
      });
      router.back();
    } catch (err: unknown) {
      setSubmitError(getApolloErrorMessage(err));
    }
  }

  const selectedCat = categories.find((c) => c.id === categoryId);

  if (postLoading || !initialized) {
    return (
      <View style={[st.center, { backgroundColor: colors.bg }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[st.flex, { backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={st.flex}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={st.topRow}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={[st.cancelText, { color: colors.muted }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[st.screenTitle, { color: colors.text }]}>
            {isScheduled ? "Edit Scheduled" : isPoll ? "Edit Poll" : "Edit Compare"}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Poll body photos — locked (votes depend on them) */}
        {isPoll && bodyImages.length > 0 ? (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.cardLabel, { color: colors.subtext }]}>🔒 PHOTOS · LOCKED</Text>
            <View style={st.bodyPhotoRow}>
              {bodyImages.map((url, i) => (
                <View key={i} style={[st.bodyPhoto, { backgroundColor: colors.section }]}>
                  <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
              Photos can't be changed after posting — they're tied to existing votes.
            </Text>
          </View>
        ) : null}

        {/* Options — labels + positions editable; replacing a photo resets votes */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.cardLabel, { color: colors.subtext }]}>
            {isPoll ? "POLL OPTIONS" : "COMPARE OPTIONS"}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
            Edit labels and reposition {isPoll ? "photos" : "images"} anytime — votes stay intact.
            {hasVotes
              ? ` Replacing ${isPoll ? "an option's photo" : "an image"} resets all votes (you'll be asked to confirm).`
              : " You can also swap them freely until the first vote is cast."}
          </Text>
          {options.map((opt, i) => {
            const hasImage = Boolean(opt.imageUrl);
            return (
              <View key={i} style={[st.optionRow, { borderTopColor: colors.border }]}>
                <Pressable
                  style={[st.optionThumb, { backgroundColor: colors.section, overflow: "hidden" }]}
                  onPress={() => requestReplaceImage(i)}
                >
                  {hasImage ? (
                    <Image
                      source={{ uri: opt.imageUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      contentPosition={{
                        left: `${opt.imageFocalX ?? DEFAULT_IMAGE_FOCAL}%`,
                        top: `${opt.imageFocalY ?? DEFAULT_IMAGE_FOCAL}%`,
                      }}
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Text style={{ fontSize: 20, color: colors.muted }}>{isPoll ? "📊" : "🖼"}</Text>
                  )}
                  {uploadingIdx === i ? (
                    <View style={[StyleSheet.absoluteFill, st.thumbOverlay]}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : null}
                </Pressable>
                <View style={{ flex: 1, gap: 6 }}>
                  <TextInput
                    style={[st.optionLabel, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                    value={opt.label}
                    onChangeText={(v) => setOptions((prev) => prev.map((o, j) => j === i ? { ...o, label: v } : o))}
                    placeholder={isPoll ? `Option ${i + 1} label` : `Label ${String.fromCharCode(65 + i)}`}
                    placeholderTextColor={colors.muted}
                    maxLength={isPoll ? 200 : 60}
                  />
                  <View style={st.optionActions}>
                    {hasImage ? (
                      <Pressable
                        style={[st.optionActionBtn, { borderColor: colors.border, backgroundColor: colors.section }]}
                        onPress={() => setPositionIdx(i)}
                      >
                        <Text style={[st.optionActionText, { color: colors.subtext }]}>
                          ↔ Position{hasCustomFocal(opt.imageFocalX ?? DEFAULT_IMAGE_FOCAL, opt.imageFocalY ?? DEFAULT_IMAGE_FOCAL) ? " ·" : ""}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[st.optionActionBtn, { borderColor: colors.border, backgroundColor: colors.section }]}
                      onPress={() => requestReplaceImage(i)}
                      disabled={uploadingIdx !== null}
                    >
                      <Text style={[st.optionActionText, { color: colors.subtext }]}>
                        {hasImage ? (isPoll ? "🔁 Replace photo" : "🔁 Replace image") : (isPoll ? "📁 Add photo" : "📁 Add image")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* Settings */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Category */}
          <Pressable style={[st.row, { borderBottomColor: colors.border }]} onPress={() => setCategoryModal(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[st.rowKey, { color: colors.text }]}>Category</Text>
              <View style={{ borderRadius: 4, backgroundColor: "#450a0a", paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: "#fca5a5", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 }}>REQUIRED</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[st.rowVal, { color: selectedCat ? colors.text : colors.muted }]}>
                {selectedCat?.name?.trim() || "Pick one"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
            </View>
          </Pressable>

          {/* Caption */}
          <View style={{ gap: 8, paddingVertical: 10 }}>
            <Text style={[st.rowKey, { color: colors.text }]}>
              Caption  <Text style={{ fontSize: 12, fontWeight: "400", color: colors.muted }}>optional</Text>
            </Text>
            <TextInput
              style={[st.captionInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
              value={caption}
              onChangeText={setCaption}
              placeholder={isPoll ? "What's this poll about?" : "What are you comparing?"}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              maxLength={300}
            />
          </View>

          {/* Audience: friends-only ↔ platform-wide (owners only) */}
          {!isAdmin ? (
            <View style={[st.audienceRow, { borderTopColor: colors.border }]}>
              <View style={{ flex: 1, paddingRight: 12, gap: 2 }}>
                <Text style={[st.rowKey, { color: colors.text }]}>Post platform-wide (global)</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {broadcastGlobally
                    ? "Everyone can see and vote — not just your friends."
                    : "Only your friends can see and vote on this post."}
                </Text>
              </View>
              <Switch
                value={broadcastGlobally}
                onValueChange={setBroadcastGlobally}
                trackColor={{ true: colors.accent }}
              />
            </View>
          ) : null}

          {/* Ending-soon threshold (admin only) */}
          {isAdmin ? (
            <View style={{ gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={[st.rowKey, { color: colors.text }]}>
                Ending-soon alert lead time  <Text style={{ fontSize: 12, fontWeight: "400", color: colors.muted }}>admin · minutes</Text>
              </Text>
              <TextInput
                style={[st.captionInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text, minHeight: 0 }]}
                value={endingSoonLead}
                onChangeText={(v) => setEndingSoonLead(v.replace(/[^0-9]/g, ""))}
                placeholder="5"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Show "Poll ending soon, vote now!" within this many minutes before the deadline (1–1440).
              </Text>
            </View>
          ) : null}
        </View>

        {/* Go-live time — only for not-yet-published (scheduled) posts */}
        {isScheduled ? (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.cardLabel, { color: colors.subtext }]}>⏰ GO-LIVE TIME</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
              Not published yet — change when this post goes live.
            </Text>

            {/* Quick presets (relative to now) */}
            <View style={st.presetRow}>
              {SCHEDULE_PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  style={[st.presetChip, { borderColor: colors.border, backgroundColor: colors.section }]}
                  onPress={() => {
                    const d = new Date(Date.now() + p.hours * 3_600_000);
                    d.setSeconds(0, 0);
                    setScheduleDate(d);
                    setSubmitError(null);
                  }}
                >
                  <Text style={[st.presetChipText, { color: colors.text }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Custom date + time steppers */}
            <View style={[st.dtCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
              <View style={st.dtRow}>
                <Text style={[st.dtLabel, { color: colors.muted }]}>DATE</Text>
                <View style={st.dtStepper}>
                  <Pressable
                    style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n.getTime() > Date.now() ? n : d; })}
                    hitSlop={8}
                  >
                    <Text style={[st.dtArrow, { color: colors.text }]}>‹</Text>
                  </Pressable>
                  <Text style={[st.dtValue, { color: colors.text }]}>
                    {scheduleDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </Text>
                  <Pressable
                    style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
                    hitSlop={8}
                  >
                    <Text style={[st.dtArrow, { color: colors.text }]}>›</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[st.dtDivider, { backgroundColor: colors.border }]} />

              <View style={st.dtRow}>
                <Text style={[st.dtLabel, { color: colors.muted }]}>TIME</Text>
                <View style={st.dtTimeGroup}>
                  <View style={st.dtStepper}>
                    <Pressable
                      style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setHours((n.getHours() + 1) % 24); return n; })}
                      hitSlop={6}
                    >
                      <Text style={[st.dtArrow, { color: colors.text }]}>+</Text>
                    </Pressable>
                    <Text style={[st.dtValue, { color: colors.text }]}>{String(scheduleDate.getHours() % 12 || 12).padStart(2, "0")}</Text>
                    <Pressable
                      style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setHours((n.getHours() + 23) % 24); return n; })}
                      hitSlop={6}
                    >
                      <Text style={[st.dtArrow, { color: colors.text }]}>−</Text>
                    </Pressable>
                  </View>
                  <Text style={[st.dtColon, { color: colors.accent }]}>:</Text>
                  <View style={st.dtStepper}>
                    <Pressable
                      style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setMinutes((Math.floor(n.getMinutes() / 5) + 1) * 5 % 60); return n; })}
                      hitSlop={6}
                    >
                      <Text style={[st.dtArrow, { color: colors.text }]}>+</Text>
                    </Pressable>
                    <Text style={[st.dtValue, { color: colors.text }]}>{String(scheduleDate.getMinutes()).padStart(2, "0")}</Text>
                    <Pressable
                      style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setScheduleDate((d) => { const n = new Date(d); const cur = Math.floor(n.getMinutes() / 5); n.setMinutes(((cur - 1 + 12) % 12) * 5); return n; })}
                      hitSlop={6}
                    >
                      <Text style={[st.dtArrow, { color: colors.text }]}>−</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={[st.dtAmPm, { backgroundColor: colors.accent }]}
                    onPress={() => setScheduleDate((d) => { const n = new Date(d); n.setHours((n.getHours() + 12) % 24); return n; })}
                  >
                    <Text style={st.dtAmPmText}>{scheduleDate.getHours() >= 12 ? "PM" : "AM"}</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={[st.scheduleSummary, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" }]}>
              <Text style={{ fontSize: 18 }}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.scheduleSummaryTitle, { color: colors.accent }]}>Goes live</Text>
                <Text style={[st.scheduleSummaryDate, { color: colors.text }]}>{fmtScheduleSummary(scheduleDate)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Error */}
        {submitError ? (
          <View style={[st.errorBanner, { backgroundColor: "#450a0a" }]}>
            <Text style={{ color: "#fca5a5", fontSize: 14 }}>{submitError}</Text>
          </View>
        ) : null}

        {/* Save */}
        <Pressable
          style={[st.saveBtn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]}
          onPress={() => void handleSave()}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.saveBtnText}>Save changes</Text>}
        </Pressable>
      </ScrollView>

      {/* Category modal */}
      <Modal visible={categoryModal} transparent animationType="slide" onRequestClose={() => setCategoryModal(false)}>
        <Pressable style={st.modalOverlay} onPress={() => setCategoryModal(false)}>
          <View style={[st.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={[st.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[st.modalTitle, { color: colors.text }]}>Select category</Text>
            <ScrollView>
              {categories.map((cat) => {
                const active = cat.id === categoryId;
                return (
                  <Pressable
                    key={cat.id}
                    style={[st.modalRow, { borderBottomColor: colors.border }, active && { backgroundColor: colors.section }]}
                    onPress={() => { setCategoryId(cat.id); setCategoryModal(false); }}
                  >
                    <Text style={[st.modalRowText, { color: active ? colors.accent : colors.text }, active && { fontWeight: "700" }]}>
                      {cat.name?.trim() || cat.id}
                    </Text>
                    {active && <Text style={{ color: colors.accent, fontSize: 16, fontWeight: "700" }}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Image position (focal) editor — focal-only, never resets votes */}
      {positionIdx !== null && options[positionIdx]?.imageUrl ? (
        <ImagePositionEditor
          visible
          src={options[positionIdx].imageUrl}
          label={options[positionIdx].label?.trim() || `Option ${positionIdx + 1}`}
          focalX={options[positionIdx].imageFocalX ?? DEFAULT_IMAGE_FOCAL}
          focalY={options[positionIdx].imageFocalY ?? DEFAULT_IMAGE_FOCAL}
          onChange={(x, y) =>
            setOptions((prev) =>
              prev.map((o, j) => (j === positionIdx ? { ...o, imageFocalX: x, imageFocalY: y } : o)),
            )
          }
          onClose={() => setPositionIdx(null)}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  cancelText: { fontSize: 15, fontWeight: "600" },
  screenTitle: { fontSize: 17, fontWeight: "800" },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 0 },
  cardLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 8 },
  optionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  optionThumb: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  thumbOverlay: { backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  optionActions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  optionActionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  optionActionText: { fontSize: 12, fontWeight: "600" },
  bodyPhotoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bodyPhoto: { width: 72, height: 72, borderRadius: 8, overflow: "hidden" },
  optionLabel: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  audienceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1 },
  rowKey: { fontSize: 14, fontWeight: "600" },
  rowVal: { fontSize: 14 },
  captionInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 60, textAlignVertical: "top" },
  errorBanner: { borderRadius: 10, padding: 12 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  presetChipText: { fontSize: 13, fontWeight: "700" },
  dtCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  dtRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dtLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  dtStepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  dtTimeGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  dtBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dtArrow: { fontSize: 18, fontWeight: "700" },
  dtValue: { fontSize: 16, fontWeight: "700", minWidth: 44, textAlign: "center" },
  dtColon: { fontSize: 18, fontWeight: "800" },
  dtDivider: { height: StyleSheet.hairlineWidth },
  dtAmPm: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dtAmPmText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  scheduleSummary: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  scheduleSummaryTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  scheduleSummaryDate: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, maxHeight: "70%" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, paddingHorizontal: 4 },
  modalRowText: { fontSize: 15 },
});
