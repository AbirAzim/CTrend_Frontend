import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { PollIcon, ImagesIcon, VoteIcon } from "../components/ContentIcons";
import { CompareImageCropper } from "../components/CompareImageCropper";
import { DEFAULT_IMAGE_FOCAL } from "../lib/imageFocal";
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

const DEADLINE_PRESETS: { label: string; hours: number }[] = [
  { label: "+12h", hours: 12 },
  { label: "+1d", hours: 24 },
  { label: "+3d", hours: 72 },
  { label: "+1w", hours: 168 },
];

type StepperPalette = {
  card: string;
  section: string;
  border: string;
  text: string;
  accent: string;
};

/** Date + time stepper (shared by go-live and voting-deadline editors). */
function DateTimeStepper({
  date,
  onChange,
  colors,
}: {
  date: Date;
  onChange: (d: Date) => void;
  colors: StepperPalette;
}) {
  return (
    <View style={[st.dtCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
      <View style={st.dtRow}>
        <Text style={[st.dtLabel, { color: colors.text }]}>DATE</Text>
        <View style={st.dtStepper}>
          <Pressable
            style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { const n = new Date(date); n.setDate(n.getDate() - 1); if (n.getTime() > Date.now()) onChange(n); }}
            hitSlop={8}
          >
            <Text style={[st.dtArrow, { color: colors.text }]}>‹</Text>
          </Pressable>
          <Text style={[st.dtValue, { color: colors.text }]}>
            {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </Text>
          <Pressable
            style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { const n = new Date(date); n.setDate(n.getDate() + 1); onChange(n); }}
            hitSlop={8}
          >
            <Text style={[st.dtArrow, { color: colors.text }]}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={[st.dtDivider, { backgroundColor: colors.border }]} />

      <View style={st.dtRow}>
        <Text style={[st.dtLabel, { color: colors.text }]}>TIME</Text>
        <View style={st.dtTimeGroup}>
          <View style={st.dtStepper}>
            <Pressable style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { const n = new Date(date); n.setHours((n.getHours() + 1) % 24); onChange(n); }} hitSlop={6}>
              <Text style={[st.dtArrow, { color: colors.text }]}>+</Text>
            </Pressable>
            <Text style={[st.dtValue, { color: colors.text }]}>{String(date.getHours() % 12 || 12).padStart(2, "0")}</Text>
            <Pressable style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { const n = new Date(date); n.setHours((n.getHours() + 23) % 24); onChange(n); }} hitSlop={6}>
              <Text style={[st.dtArrow, { color: colors.text }]}>−</Text>
            </Pressable>
          </View>
          <Text style={[st.dtColon, { color: colors.accent }]}>:</Text>
          <View style={st.dtStepper}>
            <Pressable style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { const n = new Date(date); n.setMinutes((Math.floor(n.getMinutes() / 5) + 1) * 5 % 60); onChange(n); }} hitSlop={6}>
              <Text style={[st.dtArrow, { color: colors.text }]}>+</Text>
            </Pressable>
            <Text style={[st.dtValue, { color: colors.text }]}>{String(date.getMinutes()).padStart(2, "0")}</Text>
            <Pressable style={[st.dtBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { const n = new Date(date); const cur = Math.floor(n.getMinutes() / 5); n.setMinutes(((cur - 1 + 12) % 12) * 5); onChange(n); }} hitSlop={6}>
              <Text style={[st.dtArrow, { color: colors.text }]}>−</Text>
            </Pressable>
          </View>
          <Pressable style={[st.dtAmPm, { backgroundColor: colors.accent }]} onPress={() => { const n = new Date(date); n.setHours((n.getHours() + 12) % 24); onChange(n); }}>
            <Text style={st.dtAmPmText}>{date.getHours() >= 12 ? "PM" : "AM"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
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
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  // Whether the post already has votes — gates the replace-photo warning.
  const [hasVotes, setHasVotes] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  // Pending crop for an option image. `reset` = true when it's a replace with a
  // different photo (wipes votes); false when cropping/repositioning the same one.
  const [cropper, setCropper] = useState<{ idx: number; uri: string; reset: boolean } | null>(null);
  // Whether this edit must wipe votes (replace different photo / remove option).
  const votesResetRef = useRef(false);
  // Poll-only: post-level body/context photos. Existing ones carry votes —
  // replacing/removing one resets votes; adding new ones is safe.
  const [bodyImages, setBodyImages] = useState<
    Array<{ id: string; url: string; existing: boolean }>
  >([]);
  const [bodyUploadingId, setBodyUploadingId] = useState<string | null>(null);
  // Friends-only ↔ platform-wide (global) audience toggle (post owners only).
  const [broadcastGlobally, setBroadcastGlobally] = useState(false);
  const [initialBroadcast, setInitialBroadcast] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [endingSoonLead, setEndingSoonLead] = useState("5");
  const [initialized, setInitialized] = useState(false);
  // Published posts can change/extend their voting deadline (votingEndsAt).
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [votingEnd, setVotingEnd] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24, 0, 0, 0);
    return d;
  });
  const [initialVotingEnd, setInitialVotingEnd] = useState<string | null>(null);
  const [votingOpen, setVotingOpen] = useState(true);
  // Scheduled (not-yet-published) posts can change their go-live time. Once
  // published this section never shows, so the schedule time is locked.
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d;
  });

  // Reset initialization when postId changes so a mounted screen re-hydrates
  // with the new post's data instead of showing the previous post's form state.
  useEffect(() => {
    setInitialized(false);
  }, [postId]);

  // Pre-fill form when post loads
  useEffect(() => {
    if (!postData?.getPostById || initialized) return;
    const post = mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0]);
    // Guard against hydrating with another post's (stale) data.
    if (post.id !== postId) return;
    const poll = post.format === "poll";
    const announcement = post.format === "announcement";
    setIsPoll(poll);
    setIsAnnouncement(announcement);
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
    setVotingOpen(post.isVotingOpen !== false);
    if (post.votingEndsAt) {
      const d = new Date(post.votingEndsAt);
      if (!Number.isNaN(d.getTime())) {
        setVotingEnd(d);
        setInitialVotingEnd(post.votingEndsAt);
      }
    }
    if (announcement) {
      // Announcement body images sit in imageUrls; there are no compare options.
      setBodyImages(
        (post.imageUrls ?? []).map((url, i) => ({ id: `body-${i}`, url, existing: true })),
      );
      setOptions([]);
    } else if (poll) {
      // Poll options carry their own (optional) thumbnail; body photos are separate.
      setOptions(
        (post.postOptions ?? []).map((o) => ({
          label: o.label ?? "",
          imageUrl: o.imageUrl ?? "",
          imageFocalX: o.imageFocalX ?? null,
          imageFocalY: o.imageFocalY ?? null,
        })),
      );
      setBodyImages(
        (post.imageUrls ?? []).map((url, i) => ({ id: `body-${i}`, url, existing: true })),
      );
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
  }, [postData, initialized, postId]);

  const [updatePost, { loading: saving }] = useMutation(UPDATE_POST);
  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);

  // Robust back: this screen can be reached via router.replace (e.g. redirected
  // from the create tab for polls), leaving nothing to pop — fall back to feed.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/tabs" as never);
  }

  // Android hardware back button — use the same goBack() fallback so pressing
  // the system back never closes the app when the stack is empty.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

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

  // Pick a DIFFERENT photo for an option, then crop it (replace → wipes votes).
  async function pickOptionImage(idx: number) {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Gallery access is required.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.92 });
      if (result.canceled || !result.assets[0]) return;
      setCropper({ idx, uri: result.assets[0].uri, reset: true });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  /** Crop & reposition the CURRENT option image — never resets votes. */
  function cropExistingOption(idx: number) {
    const url = options[idx]?.imageUrl;
    if (!url) { void pickOptionImage(idx); return; }
    setCropper({ idx, uri: url, reset: false });
  }

  // Replacing an existing option with a DIFFERENT photo wipes votes — confirm.
  function requestReplaceImage(idx: number) {
    if (hasVotes && options[idx]?.imageUrl) {
      Alert.alert(
        isPoll ? "Replace photo?" : "Replace image?",
        `Replacing this with a different ${isPoll ? "photo" : "image"} will remove all current votes. Cropping or repositioning the same one keeps the votes.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Replace anyway", style: "destructive", onPress: () => void pickOptionImage(idx) },
        ],
      );
      return;
    }
    void pickOptionImage(idx);
  }

  // ── Poll context/body photos ──────────────────────────────────────────────
  async function uploadBodyImage(id: string, uri: string, mimeType = "image/jpeg", fileName?: string) {
    setBodyUploadingId(id);
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
      setBodyImages((prev) => prev.map((b) => (b.id === id ? { ...b, url: publicUrl } : b)));
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
      // Drop an empty just-added slot that failed to upload.
      setBodyImages((prev) => prev.filter((b) => b.id !== id || b.url));
    }
    setBodyUploadingId(null);
  }

  async function pickBodyImage(id: string) {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Gallery access is required.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (result.canceled || !result.assets[0]) {
        setBodyImages((prev) => prev.filter((b) => b.id !== id || b.url));
        return;
      }
      const asset = result.assets[0];
      await uploadBodyImage(id, asset.uri, asset.mimeType ?? "image/jpeg", asset.fileName ?? undefined);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function addBodyImage() {
    if (bodyImages.length >= 6) return;
    const id = `body-new-${Date.now()}`;
    setBodyImages((prev) => [...prev, { id, url: "", existing: false }]);
    void pickBodyImage(id);
  }

  function requestReplaceBody(id: string) {
    const img = bodyImages.find((b) => b.id === id);
    const go = () => {
      if (img?.existing) votesResetRef.current = true;
      void pickBodyImage(id);
    };
    if (img?.existing && img.url && hasVotes) {
      Alert.alert(
        "Replace photo?",
        "Replacing this context photo will remove all current votes on this poll.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Replace anyway", style: "destructive", onPress: go },
        ],
      );
      return;
    }
    go();
  }

  function removeBodyImage(id: string) {
    const img = bodyImages.find((b) => b.id === id);
    const doRemove = () => {
      if (img?.existing) votesResetRef.current = true;
      setBodyImages((prev) => prev.filter((b) => b.id !== id));
    };
    if (img?.existing && img.url && hasVotes) {
      Alert.alert(
        "Remove photo?",
        "Removing this context photo will remove all current votes on this poll.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove anyway", style: "destructive", onPress: doRemove },
        ],
      );
      return;
    }
    doRemove();
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

    // Change/extend the voting deadline (published posts only).
    let deadlineInput: { votingEndsAt: string } | Record<string, never> = {};
    if (!isScheduled && deadlineEnabled) {
      if (votingEnd.getTime() <= Date.now()) {
        setSubmitError("Voting deadline must be in the future.");
        return;
      }
      deadlineInput = { votingEndsAt: votingEnd.toISOString() };
    }

    if (isAnnouncement) {
      try {
        await updatePost({
          variables: {
            postId,
            input: {
              caption: caption.trim() || undefined,
              categoryId,
              imageUrls: bodyImages.map((b) => b.url.trim()).filter((u) => u.length > 0),
              ...adminInput,
              ...scheduleInput,
            },
          },
        });
        goBack();
      } catch (err: unknown) {
        setSubmitError(getApolloErrorMessage(err));
      }
      return;
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
              // Crop = keep votes; replace/remove a photo = reset (flag set above).
              resetVotes: votesResetRef.current,
              imageUrls: bodyImages.map((b) => b.url.trim()).filter((u) => u.length > 0),
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
              ...deadlineInput,
            },
          },
        });
        goBack();
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
            resetVotes: votesResetRef.current,
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
            ...deadlineInput,
          },
        },
      });
      goBack();
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
          <TouchableOpacity onPress={goBack} hitSlop={10}>
            <Text style={[st.cancelText, { color: colors.muted }]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[st.screenTitle, { color: colors.text }]}>
            {isScheduled ? "Edit Scheduled" : isAnnouncement ? "Edit Announcement" : isPoll ? "Edit Poll" : "Edit Compare"}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Announcement body images */}
        {isAnnouncement ? (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.cardLabel, { color: colors.subtext }]}>IMAGES</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
              Optional images shown in the announcement.
            </Text>
            <View style={st.bodyPhotoRow}>
              {bodyImages.map((b) => (
                <View key={b.id} style={[st.bodyPhoto, { backgroundColor: colors.section }]}>
                  {b.url ? (
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => requestReplaceBody(b.id)}>
                      <Image source={{ uri: b.url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                    </Pressable>
                  ) : (
                    <View style={[StyleSheet.absoluteFill, st.thumbOverlay]}>
                      <ImagesIcon size={18} color="#fff" />
                    </View>
                  )}
                  {bodyUploadingId === b.id ? (
                    <View style={[StyleSheet.absoluteFill, st.thumbOverlay]}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : (
                    <Pressable style={st.bodyPhotoRemove} onPress={() => removeBodyImage(b.id)} hitSlop={6}>
                      <Text style={st.bodyPhotoRemoveText}>✕</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {bodyImages.length < 6 ? (
                <Pressable
                  style={[st.bodyPhoto, st.bodyPhotoAdd, { borderColor: colors.border }]}
                  onPress={addBodyImage}
                  disabled={bodyUploadingId !== null}
                >
                  <Text style={{ fontSize: 26, color: colors.muted }}>+</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Poll context/body photos — editable (replace/remove resets votes) */}
        {isPoll ? (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.cardLabel, { color: colors.subtext }]}>CONTEXT PHOTOS</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
              Shown above the options.
              {hasVotes
                ? " Replacing or removing an existing photo resets all votes (you'll be asked to confirm); adding is safe."
                : " Add, replace or remove freely until the first vote is cast."}
            </Text>
            <View style={st.bodyPhotoRow}>
              {bodyImages.map((b) => (
                <View key={b.id} style={[st.bodyPhoto, { backgroundColor: colors.section }]}>
                  {b.url ? (
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => requestReplaceBody(b.id)}>
                      <Image source={{ uri: b.url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                    </Pressable>
                  ) : (
                    <View style={[StyleSheet.absoluteFill, st.thumbOverlay]}>
                      <ImagesIcon size={18} color="#fff" />
                    </View>
                  )}
                  {bodyUploadingId === b.id ? (
                    <View style={[StyleSheet.absoluteFill, st.thumbOverlay]}>
                      <ActivityIndicator color="#fff" size="small" />
                    </View>
                  ) : (
                    <Pressable style={st.bodyPhotoRemove} onPress={() => removeBodyImage(b.id)} hitSlop={6}>
                      <Text style={st.bodyPhotoRemoveText}>✕</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {bodyImages.length < 6 ? (
                <Pressable
                  style={[st.bodyPhoto, st.bodyPhotoAdd, { borderColor: colors.border }]}
                  onPress={addBodyImage}
                  disabled={bodyUploadingId !== null}
                >
                  <Text style={{ fontSize: 26, color: colors.muted }}>+</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Options — labels + positions editable; replacing a photo resets votes */}
        {!isAnnouncement ? (
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.cardLabel, { color: colors.subtext }]}>
            {isPoll ? "POLL OPTIONS" : "COMPARE OPTIONS"}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8 }}>
            Tap a {isPoll ? "photo" : "image"} to crop & reposition it — labels and crops stay free.
            {hasVotes
              ? ` Replacing one with a different ${isPoll ? "photo" : "image"} resets votes (you'll be asked to confirm).`
              : " You can also replace them freely until the first vote is cast."}
          </Text>
          {options.map((opt, i) => {
            const hasImage = Boolean(opt.imageUrl);
            return (
              <View key={i} style={[st.optionRow, { borderTopColor: colors.border }]}>
                <Pressable
                  style={[st.optionThumb, { backgroundColor: colors.section, overflow: "hidden" }]}
                  onPress={() => (hasImage ? cropExistingOption(i) : requestReplaceImage(i))}
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
                  ) : isPoll ? (
                    <PollIcon size={20} color={colors.muted} />
                  ) : (
                    <ImagesIcon size={20} color={colors.muted} />
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
                        onPress={() => cropExistingOption(i)}
                      >
                        <Text style={[st.optionActionText, { color: colors.subtext }]}>✂️ Crop & reposition</Text>
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
        ) : null}

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
              placeholder={isAnnouncement ? "Write your announcement…" : isPoll ? "What's this poll about?" : "What are you comparing?"}
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

        {/* Voting deadline — for published posts (change / extend the end time) */}
        {!isScheduled ? (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12, gap: 2 }}>
                <Text style={[st.rowKey, { color: colors.text }]}>⏰ Change voting deadline</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {initialVotingEnd
                    ? `Current: ${fmtScheduleSummary(new Date(initialVotingEnd))}${votingOpen ? "" : " · Closed"}`
                    : "No deadline set — voting stays open."}
                </Text>
              </View>
              <Switch
                value={deadlineEnabled}
                onValueChange={setDeadlineEnabled}
                trackColor={{ true: colors.accent }}
              />
            </View>

            {deadlineEnabled ? (
              <View style={{ marginTop: 12, gap: 12 }}>
                <View style={st.presetRow}>
                  {DEADLINE_PRESETS.map((p) => (
                    <Pressable
                      key={p.label}
                      style={[st.presetChip, { borderColor: colors.border, backgroundColor: colors.section }]}
                      onPress={() => {
                        const base = votingEnd.getTime() > Date.now() ? votingEnd : new Date();
                        const d = new Date(base.getTime() + p.hours * 3_600_000);
                        d.setSeconds(0, 0);
                        setVotingEnd(d);
                        setSubmitError(null);
                      }}
                    >
                      <Text style={[st.presetChipText, { color: colors.text }]}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <DateTimeStepper date={votingEnd} onChange={setVotingEnd} colors={colors} />
                <View style={[st.scheduleSummary, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" }]}>
                  <VoteIcon size={18} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.scheduleSummaryTitle, { color: colors.accent }]}>Voting ends</Text>
                    <Text style={[st.scheduleSummaryDate, { color: colors.text }]}>{fmtScheduleSummary(votingEnd)}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

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

      {/* Crop + reposition editor (same as create). Re-cropping the same image
          keeps votes; a replace (reset:true) wipes them. */}
      <CompareImageCropper
        visible={cropper !== null}
        uri={cropper?.uri ?? null}
        aspect={isPoll ? 1 : 1.25}
        onCancel={() => setCropper(null)}
        onDone={(croppedUri) => {
          const target = cropper;
          setCropper(null);
          if (!target) return;
          if (target.reset) votesResetRef.current = true;
          void uploadOptionImage(target.idx, croppedUri, "image/jpeg");
        }}
      />
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
  bodyPhotoRemove: { position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  bodyPhotoRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  bodyPhotoAdd: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed" },
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
