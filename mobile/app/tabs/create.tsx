import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "../../context/TabBarContext";
import { CATEGORIES, CREATE_POST, FEED_POSTS, GET_POST_BY_ID, UPDATE_POST } from "@ctrend/shared/graphql/feed";
import { ACTIVE_CAMPAIGNS, CAMPAIGNS_ADMIN } from "@ctrend/shared/graphql/campaigns";
import { CREATE_SYSTEM_POST, PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { ImagePositionEditor } from "../../components/ImagePositionEditor";
import { hasCustomFocal, DEFAULT_IMAGE_FOCAL } from "../../lib/imageFocal";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const { width: SW } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name?: string | null };
type CategoriesData = { categories: Category[] };
type CampaignOption = { id: string; name: string; isActive?: boolean | null; isDefault?: boolean | null };
type ActiveCampaignsData = { activeCampaigns: CampaignOption[] };
type AdminCampaignsData = { campaigns: CampaignOption[] };
type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string } };

type EditPostData = {
  id: string;
  caption?: string | null;
  imageUrls?: (string | null)[] | null;
  options?: { label?: string | null; imageFocalX?: number | null; imageFocalY?: number | null }[] | null;
  category?: { id: string } | null;
  campaign?: { id: string } | null;
  votingEndsAt?: string | null;
  isUserGlobalBroadcast?: boolean | null;
};

type Slot = {
  id: string;
  localUri: string | null;
  publicUrl: string | null;
  pasteUrl: string;
  uploading: boolean;
  error: string | null;
  label: string;
  imageFocalX: number;
  imageFocalY: number;
  /** Existing option on a post being edited — locked to protect its votes. */
  locked?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LABELS = ["A", "B", "C", "D"];

function makeSlot(id: string): Slot {
  return {
    id, localUri: null, publicUrl: null, pasteUrl: "", uploading: false, error: null, label: "",
    imageFocalX: DEFAULT_IMAGE_FOCAL, imageFocalY: DEFAULT_IMAGE_FOCAL,
  };
}

const QUICK_PRESETS = [
  { icon: "⚡", label: "1 hr", sub: "Quick poll", hours: 1, color: "#f97316" },
  { icon: "☀️", label: "12 hrs", sub: "Half day", hours: 12, color: "#f59e0b" },
  { icon: "📅", label: "1 day", sub: "Recommended", hours: 24, color: "#22c55e" },
  { icon: "🗓", label: "3 days", sub: "Extended", hours: 72, color: "#8b5cf6" },
  { icon: "🌙", label: "7 days", sub: "One week", hours: 168, color: "#6366f1" },
] as const;

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}
function deadlineSummary(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = d.getHours(); const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} at ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function dateLabelShort(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── DateTimePicker (shared between voting deadline + schedule) ───────────────

function DateTimePicker({
  colors, enabled, presetHours, onPresetChange,
  customDate, onCustomChange, showCustom,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  enabled: boolean;
  onToggle: (v: boolean) => void;
  presetHours: number | null;
  onPresetChange: (h: number | null) => void;
  customDate: Date;
  onCustomChange: (d: Date) => void;
  showCustom: boolean;
}) {
  return (
    <>
      {/* Preset cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingBottom: 2 }}>
        {QUICK_PRESETS.map((p) => {
          const active = presetHours === p.hours;
          return (
            <Pressable key={p.hours}
              style={[st.presetCard, { borderColor: active ? p.color : colors.border, backgroundColor: active ? p.color + "18" : colors.section }]}
              onPress={() => onPresetChange(p.hours)}>
              <Text style={st.presetIcon}>{p.icon}</Text>
              <Text style={[st.presetLabel, { color: active ? p.color : colors.text }]}>{p.label}</Text>
              <Text style={[st.presetSub, { color: active ? p.color + "cc" : colors.muted }]}>{p.sub}</Text>
              {active && <View style={[st.presetDot, { backgroundColor: p.color }]} />}
            </Pressable>
          );
        })}
        <Pressable
          style={[st.presetCard, { borderColor: presetHours === null ? colors.accent : colors.border, backgroundColor: presetHours === null ? colors.accent + "18" : colors.section }]}
          onPress={() => onPresetChange(null)}>
          <Text style={st.presetIcon}>✏️</Text>
          <Text style={[st.presetLabel, { color: presetHours === null ? colors.accent : colors.text }]}>Custom</Text>
          <Text style={[st.presetSub, { color: presetHours === null ? colors.accent + "cc" : colors.muted }]}>Pick date</Text>
          {presetHours === null && <View style={[st.presetDot, { backgroundColor: colors.accent }]} />}
        </Pressable>
      </ScrollView>

      {/* Custom date-time picker */}
      {showCustom && presetHours === null && (
        <View style={[st.dtCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
          {/* Date */}
          <View style={st.dtSection}>
            <Text style={[st.dtLabel, { color: colors.muted }]}>DATE</Text>
            <View style={st.dtNavRow}>
              <Pressable style={[st.dtNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setDate(n.getDate() - 1); return n > new Date() ? n : customDate; })())} hitSlop={8}>
                <Text style={[st.dtNavArrow, { color: colors.text }]}>‹</Text>
              </Pressable>
              <Text style={[st.dtDateText, { color: colors.text }]}>{dateLabelShort(customDate)}</Text>
              <Pressable style={[st.dtNavBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setDate(n.getDate() + 1); return n; })())} hitSlop={8}>
                <Text style={[st.dtNavArrow, { color: colors.text }]}>›</Text>
              </Pressable>
            </View>
          </View>
          <View style={[st.dtDivider, { backgroundColor: colors.border }]} />
          {/* Time */}
          <View style={st.dtSection}>
            <Text style={[st.dtLabel, { color: colors.muted }]}>TIME</Text>
            <View style={st.dtTimeRow}>
              <View style={st.dtSpinner}>
                <Pressable style={[st.dtSpinBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setHours((n.getHours() + 1) % 24); return n; })())} hitSlop={6}>
                  <Text style={[st.dtSpinArrow, { color: colors.text }]}>+</Text>
                </Pressable>
                <Text style={[st.dtTimeNum, { color: colors.text }]}>{String(customDate.getHours() % 12 || 12).padStart(2, "0")}</Text>
                <Pressable style={[st.dtSpinBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setHours((n.getHours() + 23) % 24); return n; })())} hitSlop={6}>
                  <Text style={[st.dtSpinArrow, { color: colors.text }]}>−</Text>
                </Pressable>
              </View>
              <Text style={[st.dtColon, { color: colors.accent }]}>:</Text>
              <View style={st.dtSpinner}>
                <Pressable style={[st.dtSpinBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setMinutes((Math.floor(n.getMinutes() / 5) + 1) * 5 % 60); return n; })())} hitSlop={6}>
                  <Text style={[st.dtSpinArrow, { color: colors.text }]}>+</Text>
                </Pressable>
                <Text style={[st.dtTimeNum, { color: colors.text }]}>{String(customDate.getMinutes()).padStart(2, "0")}</Text>
                <Pressable style={[st.dtSpinBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onCustomChange((() => { const n = new Date(customDate); const cur = Math.floor(n.getMinutes() / 5); n.setMinutes(((cur - 1 + 12) % 12) * 5); return n; })())} hitSlop={6}>
                  <Text style={[st.dtSpinArrow, { color: colors.text }]}>−</Text>
                </Pressable>
              </View>
              <Pressable style={[st.dtAmPm, { backgroundColor: colors.accent }]}
                onPress={() => onCustomChange((() => { const n = new Date(customDate); n.setHours((n.getHours() + 12) % 24); return n; })())}>
                <Text style={st.dtAmPmText}>{customDate.getHours() >= 12 ? "PM" : "AM"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Summary pill */}
      <View style={[st.summaryPill, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "44" }]}>
        <Text style={st.summaryIcon}>📅</Text>
        <View style={{ flex: 1 }}>
          <Text style={[st.summaryTitle, { color: colors.accent }]}>
            {enabled ? "Deadline" : "Schedule"}
          </Text>
          <Text style={[st.summaryDate, { color: colors.text }]}>
            {presetHours !== null
              ? deadlineSummary(new Date(Date.now() + presetHours * 3_600_000))
              : deadlineSummary(customDate)}
          </Text>
        </View>
      </View>
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, hydrated, user } = useAuth();
  const { colors } = useTheme();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const { platform: platformParam, editId } = useLocalSearchParams<{ platform?: string; editId?: string }>();
  const isEdit = Boolean(editId);

  const [slots, setSlots] = useState<Slot[]>([makeSlot("1"), makeSlot("2")]);
  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Pre-select platform-wide when admin arrives from "+ New platform post"
  const [platformWide, setPlatformWide] = useState(platformParam === "1");
  const [broadcastGlobally, setBroadcastGlobally] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [campaignModal, setCampaignModal] = useState(false);
  const [positionSlotId, setPositionSlotId] = useState<string | null>(null);

  // Voting deadline
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlinePreset, setDeadlinePreset] = useState<number | null>(24);
  const [deadlineCustom, setDeadlineCustom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d;
  });

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [schedulePreset, setSchedulePreset] = useState<number | null>(24);
  const [scheduleCustom, setScheduleCustom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
  });

  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Hide the floating tab bar while this screen is focused so its own action
  // buttons are unobstructed; restore it on blur. Focus-based (not mount-based)
  // because this tab screen stays mounted between visits.
  const { translateY } = useTabBar();
  useFocusEffect(useCallback(() => {
    const TAB_TOTAL = 64 + 14 + insets.bottom;
    Animated.timing(translateY, { toValue: TAB_TOTAL, duration: 180, useNativeDriver: true }).start();
    return () => {
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    };
  }, [translateY, insets.bottom]));

  const { data: catData, loading: catLoading } = useQuery<CategoriesData>(CATEGORIES, {
    fetchPolicy: "cache-first", skip: !isAuthenticated,
  });
  const categories = catData?.categories ?? [];
  const selectedCat = categories.find((c) => c.id === categoryId);

  // Campaigns — admin sees all (with inactive flagged), users see active only.
  const { data: activeCampData } = useQuery<ActiveCampaignsData>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-first", skip: !isAuthenticated || isAdmin,
  });
  const { data: adminCampData } = useQuery<AdminCampaignsData>(CAMPAIGNS_ADMIN, {
    fetchPolicy: "cache-first", skip: !isAuthenticated || !isAdmin,
  });
  const campaigns: CampaignOption[] = [
    ...(isAdmin ? adminCampData?.campaigns ?? [] : activeCampData?.activeCampaigns ?? []),
  ].sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  // Platform setting: can normal users broadcast a post globally? (Phase 36)
  const { data: platformSettingsData } = useQuery<{ platformSettings: { allowUserGlobalPosts: boolean } }>(
    PLATFORM_SETTINGS,
    { fetchPolicy: "cache-and-network", skip: !isAuthenticated || isAdmin },
  );
  const allowUserGlobalPosts = Boolean(platformSettingsData?.platformSettings?.allowUserGlobalPosts);

  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);
  const [createPost, { loading: submitting }] = useMutation(CREATE_POST);
  const [createSystemPost, { loading: submittingSystem }] = useMutation(CREATE_SYSTEM_POST);
  const [updatePost, { loading: updating }] = useMutation(UPDATE_POST);

  // Edit mode: load the post being edited and hydrate the form once.
  const { data: editData } = useQuery<{ getPostById: EditPostData | null }>(GET_POST_BY_ID, {
    variables: { id: editId },
    fetchPolicy: "cache-and-network",
    skip: !isEdit || !isAuthenticated,
  });
  const editLoadedRef = useRef(false);
  useEffect(() => {
    const post = editData?.getPostById;
    if (!isEdit || !post || editLoadedRef.current) return;
    editLoadedRef.current = true;
    setCaption(post.caption ?? "");
    setCategoryId(post.category?.id ?? "");
    setCampaignId(post.campaign?.id ?? "");
    setBroadcastGlobally(Boolean(post.isUserGlobalBroadcast));
    const urls = (post.imageUrls ?? []).filter((u): u is string => Boolean(u));
    if (urls.length >= 2) {
      setSlots(urls.map((url, i) => ({
        ...makeSlot(`edit-${i}`),
        publicUrl: url,
        label: post.options?.[i]?.label ?? "",
        imageFocalX: post.options?.[i]?.imageFocalX ?? DEFAULT_IMAGE_FOCAL,
        imageFocalY: post.options?.[i]?.imageFocalY ?? DEFAULT_IMAGE_FOCAL,
        locked: true,
      })));
    }
    if (post.votingEndsAt) {
      const d = new Date(post.votingEndsAt);
      if (!Number.isNaN(d.getTime())) {
        setDeadlineEnabled(true);
        setDeadlinePreset(null);
        setDeadlineCustom(d);
      }
    }
  }, [editData, isEdit]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/auth/login" as never);
  }, [hydrated, isAuthenticated]);

  // This screen lives in the tab navigator, so it stays mounted between visits.
  // Re-sync when the editId param changes: clear the form when returning to
  // "create" mode, or allow the edit form to re-hydrate for a different post.
  useEffect(() => {
    if (editId) editLoadedRef.current = false;
    else resetForm();
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated || !isAuthenticated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // ── Slot helpers ──────────────────────────────────────────────────────────
  function patchSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addSlot() {
    if (slots.length >= 4) return;
    setSlots((prev) => [...prev, makeSlot(String(Date.now()))]);
  }
  function removeSlot(id: string) {
    if (slots.length <= 2) return;
    setSlots((prev) => prev.filter((s) => (s.id === id ? !s.locked : true)));
  }

  // Clear the form back to a blank draft (after a successful launch, or when the
  // tab-mounted screen returns to create mode from edit mode).
  function resetForm() {
    editLoadedRef.current = false;
    setSlots([makeSlot("1"), makeSlot("2")]);
    setCaption("");
    setCategoryId("");
    setCampaignId("");
    setPlatformWide(platformParam === "1");
    setBroadcastGlobally(false);
    setSubmitError(null);
    setDeadlineEnabled(false);
    setDeadlinePreset(24);
    setScheduleEnabled(false);
    setSchedulePreset(24);
    const dl = new Date(); dl.setDate(dl.getDate() + 1); dl.setHours(20, 0, 0, 0);
    setDeadlineCustom(dl);
    const sc = new Date(); sc.setDate(sc.getDate() + 1); sc.setHours(10, 0, 0, 0);
    setScheduleCustom(sc);
  }

  // ── Image pick + upload ───────────────────────────────────────────────────
  async function pickAndUpload(slotId: string, useCamera: boolean) {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed", "Camera access required."); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed", "Gallery access required."); return; }
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? "image/jpeg";
      const ext = mimeType.split("/")[1] ?? "jpg";
      const filename = asset.fileName ?? `photo_${Date.now()}.${ext}`;
      patchSlot(slotId, { localUri: asset.uri, uploading: true, error: null, publicUrl: null });
      const { data } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
      if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL.");
      const { uploadUrl, publicUrl } = data.getImageUploadUrl;
      let uploadUri = asset.uri;
      if (Platform.OS === "android" && !asset.uri.startsWith("file://")) {
        uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: asset.uri, to: uploadUri });
      }
      const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
        httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed: ${res.status}`);
      patchSlot(slotId, { uploading: false, publicUrl });
    } catch (err: unknown) {
      patchSlot(slotId, { uploading: false, error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  async function applyPasteUrl(slotId: string, url: string) {
    if (!url.trim().startsWith("http")) return;
    patchSlot(slotId, { publicUrl: url.trim(), localUri: null, error: null });
  }

  function openImageOptions(slotId: string) {
    const slot = slotsRef.current.find((s) => s.id === slotId);
    if (slot?.localUri || slot?.publicUrl) {
      Alert.alert("Image options", undefined, [
        { text: "Replace from gallery", onPress: () => void pickAndUpload(slotId, false) },
        { text: "Take new photo", onPress: () => void pickAndUpload(slotId, true) },
        { text: "Remove", style: "destructive", onPress: () => patchSlot(slotId, { localUri: null, publicUrl: null, pasteUrl: "", error: null }) },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      Alert.alert("Add image", undefined, [
        { text: "Choose from gallery", onPress: () => void pickAndUpload(slotId, false) },
        { text: "Take a photo", onPress: () => void pickAndUpload(slotId, true) },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(isSchedule: boolean) {
    setSubmitError(null);
    if (!categoryId) { setSubmitError("Please select a category."); return; }
    const readySlots = slots.filter((s) => s.publicUrl);
    if (readySlots.length < 2) { setSubmitError("Upload or paste at least 2 images."); return; }
    if (slots.some((s) => s.uploading)) { setSubmitError("Please wait for uploads to finish."); return; }

    const imageUrls = readySlots.map((s) => s.publicUrl as string);
    const options = readySlots.map((s, i) => ({
      label: s.label.trim() || `Option ${SLOT_LABELS[i] ?? i + 1}`,
      imageUrl: s.publicUrl as string,
      imageFocalX: s.imageFocalX,
      imageFocalY: s.imageFocalY,
    }));

    // ── Edit mode: update the existing post instead of creating a new one ──
    if (isEdit && editId) {
      const updateInput: Record<string, unknown> = {
        categoryId,
        imageUrls,
        options,
        // Always send caption so clearing it persists; "" clears the campaign too.
        caption: caption.trim() || undefined,
        campaignId,
      };
      const wasGlobal = Boolean(editData?.getPostById?.isUserGlobalBroadcast);
      if (!isAdmin && allowUserGlobalPosts && broadcastGlobally !== wasGlobal) {
        updateInput.broadcastGlobally = broadcastGlobally;
      }
      if (deadlineEnabled) {
        updateInput.votingEndsAt = deadlinePreset !== null ? hoursFromNow(deadlinePreset) : deadlineCustom.toISOString();
      }
      try {
        await updatePost({ variables: { postId: editId, input: updateInput } });
        router.back();
      } catch (err: unknown) {
        setSubmitError(getApolloErrorMessage(err));
      }
      return;
    }

    const input: Record<string, unknown> = { categoryId, imageUrls, options };
    if (caption.trim()) { input.caption = caption.trim(); input.contentText = caption.trim(); }
    if (campaignId) input.campaignId = campaignId;
    // Non-admin global broadcast (admins use createSystemPost instead) — Phase 36
    if (!isAdmin && allowUserGlobalPosts && broadcastGlobally) input.broadcastGlobally = true;

    if (deadlineEnabled) {
      input.votingEndsAt = deadlinePreset !== null ? hoursFromNow(deadlinePreset) : deadlineCustom.toISOString();
    }
    if (isSchedule && scheduleEnabled) {
      const scheduledAt = schedulePreset !== null
        ? new Date(Date.now() + schedulePreset * 3_600_000).toISOString()
        : scheduleCustom.toISOString();
      if (new Date(scheduledAt) > new Date()) input.scheduledAt = scheduledAt;
    }

    try {
      const mutFn = isAdmin && platformWide ? createSystemPost : createPost;
      await mutFn({ variables: { input }, refetchQueries: isAdmin && platformWide ? [] : [{ query: FEED_POSTS }] });
      resetForm();
      router.replace("/tabs");
    } catch (err: unknown) {
      setSubmitError(getApolloErrorMessage(err));
    }
  }

  function confirmCancel() {
    const dirty = slots.some((s) => s.localUri || s.pasteUrl) || caption.trim();
    if (!dirty) { router.back(); return; }
    Alert.alert("Discard post?", "Your draft will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const isSubmitting = submitting || submittingSystem || updating;
  const slotW = (SW - 16 * 2 - 12) / 2;

  return (
    <KeyboardAvoidingView style={[{ flex: 1, backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 100, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={st.topRow}>
          <View style={{ width: 40 }} />
          <Text style={[st.screenTitle, { color: colors.text }]}>{isEdit ? "Edit Compare" : "New Compare"}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Image slots (2-col grid) ── */}
        <View style={{ gap: 12 }}>
          {isEdit && (
            <Text style={[st.lockedNote, { color: colors.muted, backgroundColor: colors.section, borderColor: colors.border }]}>
              🔒 Existing options are locked to protect their votes. You can add new
              options below — changing an existing image would reset all votes.
            </Text>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {slots.map((slot, idx) => {
              const imgSrc = slot.localUri ?? (slot.publicUrl && !slot.pasteUrl ? slot.publicUrl : null);
              const hasImage = imgSrc || (slot.pasteUrl && slot.publicUrl);
              const locked = Boolean(slot.locked);
              return (
                <View key={slot.id} style={{ width: slotW, gap: 6 }}>
                  {/* Image tile */}
                  <Pressable
                    style={[st.slotTile, { borderColor: slot.error ? "#ef4444" : hasImage ? colors.accent + "66" : colors.border }]}
                    onPress={locked ? undefined : () => openImageOptions(slot.id)}
                    disabled={locked}
                  >
                    {hasImage ? (
                      <Image source={{ uri: imgSrc ?? slot.publicUrl ?? "" }} style={st.slotImg} contentFit="cover" />
                    ) : (
                      <View style={st.slotEmpty}>
                        <Text style={[st.slotPlus, { color: colors.muted }]}>+</Text>
                        <Text style={[st.slotHint, { color: colors.muted }]}>Add photo</Text>
                      </View>
                    )}
                    <View style={[st.slotBadge, { backgroundColor: colors.accent }]}>
                      <Text style={st.slotBadgeText}>{SLOT_LABELS[idx] ?? idx + 1}</Text>
                    </View>
                    {slot.uploading && (
                      <View style={st.slotOverlay}>
                        <ActivityIndicator color="#fff" />
                        <Text style={st.slotOverlayText}>Uploading…</Text>
                      </View>
                    )}
                    {slot.publicUrl && !slot.uploading && !locked && (
                      <View style={st.slotDone}>
                        <Text style={st.slotDoneText}>✓</Text>
                      </View>
                    )}
                    {locked && (
                      <View style={st.slotLock}>
                        <Text style={st.slotLockText}>🔒</Text>
                      </View>
                    )}
                    {slots.length > 2 && !locked && (
                      <Pressable style={st.slotRemove} onPress={() => removeSlot(slot.id)} hitSlop={6}>
                        <Text style={st.slotRemoveText}>✕</Text>
                      </Pressable>
                    )}
                  </Pressable>
                  {slot.error ? <Text style={st.slotError}>{slot.error}</Text> : null}
                  {/* Position editor trigger */}
                  {!locked && hasImage && (slot.localUri || slot.publicUrl) ? (
                    <Pressable
                      style={[st.positionBtn, { backgroundColor: colors.section, borderColor: colors.border }]}
                      onPress={() => setPositionSlotId(slot.id)}
                    >
                      <Text style={[st.positionBtnText, { color: colors.subtext }]}>
                        ⊹ Position{hasCustomFocal(slot.imageFocalX, slot.imageFocalY) ? " ·" : ""}
                      </Text>
                    </Pressable>
                  ) : null}
                  {/* Paste URL — new options only */}
                  {!locked && (
                    <TextInput
                      style={[st.slotInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                      value={slot.pasteUrl}
                      onChangeText={(v) => {
                        patchSlot(slot.id, { pasteUrl: v });
                        if (v.trim().startsWith("http")) void applyPasteUrl(slot.id, v);
                      }}
                      placeholder="or paste URL"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  )}
                  {/* Label */}
                  <TextInput
                    style={[st.slotInput, { backgroundColor: colors.section, borderColor: colors.border, color: locked ? colors.muted : colors.text }]}
                    value={slot.label}
                    onChangeText={(v) => patchSlot(slot.id, { label: v })}
                    placeholder="Label…"
                    placeholderTextColor={colors.muted}
                    maxLength={40}
                    editable={!locked}
                  />
                </View>
              );
            })}
          </View>

          {/* Add option */}
          {slots.length < 4 && (
            <Pressable style={[st.addSlotBtn, { borderColor: colors.accent + "88" }]} onPress={addSlot}>
              <Text style={[st.addSlotText, { color: colors.accent }]}>+ Add option</Text>
            </Pressable>
          )}
        </View>

        {/* ── Settings card ── */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Admin: post type */}
          {isAdmin && !isEdit && (
            <View style={[st.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[st.settingKey, { color: colors.text }]}>Post type</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["Regular", "Platform-wide"] as const).map((opt) => {
                  const active = opt === "Platform-wide" ? platformWide : !platformWide;
                  return (
                    <Pressable
                      key={opt}
                      style={[st.typeChip, { backgroundColor: active ? colors.accent : colors.section, borderColor: active ? colors.accent : colors.border }]}
                      onPress={() => setPlatformWide(opt === "Platform-wide")}
                    >
                      <Text style={[st.typeChipText, { color: active ? "#fff" : colors.subtext }]}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Non-admin: opt in to broadcast globally (Phase 36) */}
          {!isAdmin && allowUserGlobalPosts && (
            <View style={[st.settingRow, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 14 }}>🌍</Text>
                  <Text style={[st.settingKey, { color: colors.text }]}>Post globally</Text>
                </View>
                <Text style={[st.optional, { color: colors.muted, marginTop: 2 }]}>
                  Show this to everyone &amp; notify them with your name.
                </Text>
              </View>
              <Switch
                value={broadcastGlobally}
                onValueChange={setBroadcastGlobally}
                trackColor={{ false: colors.section, true: "#16a34a" }}
                thumbColor="#fff"
              />
            </View>
          )}

          {/* Category */}
          <Pressable style={[st.settingRow, { borderBottomColor: colors.border }]} onPress={() => setCategoryModal(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.accent, fontSize: 14 }}>◆</Text>
              <Text style={[st.settingKey, { color: colors.text }]}>Category</Text>
              <View style={st.requiredBadge}>
                <Text style={st.requiredText}>REQUIRED</Text>
              </View>
            </View>
            <View style={[st.catPicker, { backgroundColor: colors.section, borderColor: colors.border }]}>
              <Text style={[st.catPickerText, { color: selectedCat ? colors.text : colors.muted }]}>
                {catLoading ? "Loading…" : selectedCat?.name?.trim() || "Pick a category"}
              </Text>
              <Text style={[st.catChevron, { color: colors.muted }]}>▼</Text>
            </View>
          </Pressable>

          {/* Campaign (optional) */}
          {campaigns.length > 0 && (
            <Pressable style={[st.settingRow, { borderBottomColor: colors.border }]} onPress={() => setCampaignModal(true)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 14 }}>🎯</Text>
                <Text style={[st.settingKey, { color: colors.text }]}>Campaign</Text>
                <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
              </View>
              <View style={[st.catPicker, { backgroundColor: colors.section, borderColor: colors.border }]}>
                <Text style={[st.catPickerText, { color: selectedCampaign ? colors.text : colors.muted }]} numberOfLines={1}>
                  {selectedCampaign?.name?.trim() || "No campaign"}
                </Text>
                <Text style={[st.catChevron, { color: colors.muted }]}>▼</Text>
              </View>
            </Pressable>
          )}

          {/* Caption */}
          <View style={[st.settingCol, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.accent, fontSize: 14 }}>✎</Text>
              <Text style={[st.settingKey, { color: colors.text }]}>Caption</Text>
              <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
            </View>
            <TextInput
              style={[st.captionInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="What are you comparing?"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
          </View>

          {/* Set voting deadline */}
          <View style={[st.settingRow, !deadlineEnabled ? {} : { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 14 }}>⏱</Text>
              <Text style={[st.settingKey, { color: colors.text }]}>Set voting deadline</Text>
              <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
            </View>
            <Switch
              value={deadlineEnabled}
              onValueChange={setDeadlineEnabled}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#fff"
            />
          </View>
          {deadlineEnabled && (
            <View style={{ gap: 10, paddingBottom: 6, paddingTop: 4 }}>
              <DateTimePicker
                colors={colors} enabled={deadlineEnabled} onToggle={setDeadlineEnabled}
                presetHours={deadlinePreset} onPresetChange={setDeadlinePreset}
                customDate={deadlineCustom} onCustomChange={setDeadlineCustom}
                showCustom={deadlineEnabled}
              />
            </View>
          )}
        </View>

        {/* Schedule date picker — only shown when schedule mode is active */}
        {scheduleEnabled && (
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.accent + "66" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <Text style={{ fontSize: 16 }}>🕐</Text>
              <Text style={[st.settingKey, { color: colors.text, fontSize: 15 }]}>Schedule for later</Text>
            </View>
            <DateTimePicker
              colors={colors} enabled={scheduleEnabled} onToggle={setScheduleEnabled}
              presetHours={schedulePreset} onPresetChange={setSchedulePreset}
              customDate={scheduleCustom} onCustomChange={setScheduleCustom}
              showCustom={scheduleEnabled}
            />
          </View>
        )}

        {/* Error */}
        {submitError ? (
          <View style={[st.errorBanner, { backgroundColor: "#450a0a" }]}>
            <Text style={{ color: "#fca5a5", fontSize: 14 }}>{submitError}</Text>
          </View>
        ) : null}

        {/* ── Action buttons (inside scroll, above tab bar) ── */}
        <View style={{ gap: 10 }}>
          <View style={st.footerBtns}>
            <Pressable
              style={[st.launchBtn, { backgroundColor: colors.accent }, isSubmitting && { opacity: 0.6 }]}
              onPress={() => void handleSubmit(false)}
              disabled={isSubmitting}
            >
              {isSubmitting && !scheduleEnabled
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.launchBtnText}>{isEdit ? "Save changes" : isAdmin && platformWide ? "Launch platform-wide →" : "Launch it →"}</Text>
              }
            </Pressable>
            {!isEdit && (
              <Pressable
                style={[st.scheduleBtn, { borderColor: colors.border, backgroundColor: scheduleEnabled ? colors.accent + "18" : colors.section }]}
                onPress={() => setScheduleEnabled((v) => !v)}
              >
                <Text style={{ fontSize: 14 }}>🕐</Text>
                <Text style={[st.scheduleBtnText, { color: scheduleEnabled ? colors.accent : colors.text }]}>
                  {scheduleEnabled ? "Cancel" : "Schedule"}
                </Text>
              </Pressable>
            )}
          </View>
          {!isEdit && scheduleEnabled && (
            <Pressable
              style={[st.confirmScheduleBtn, { backgroundColor: colors.accent }, isSubmitting && { opacity: 0.6 }]}
              onPress={() => void handleSubmit(true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={st.launchBtnText}>🕐 Confirm schedule →</Text>}
            </Pressable>
          )}
          <Pressable onPress={confirmCancel} hitSlop={10} style={{ alignItems: "center", paddingVertical: 4 }}>
            <Text style={[st.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
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
                    {active && <Text style={[{ color: colors.accent, fontSize: 16, fontWeight: "700" }]}>✓</Text>}
                  </Pressable>
                );
              })}
              {categories.length === 0 && !catLoading && <Text style={[st.modalEmpty, { color: colors.muted }]}>No categories available.</Text>}
              {catLoading && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.accent} />}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Campaign modal */}
      <Modal visible={campaignModal} transparent animationType="slide" onRequestClose={() => setCampaignModal(false)}>
        <Pressable style={st.modalOverlay} onPress={() => setCampaignModal(false)}>
          <View style={[st.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={[st.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[st.modalTitle, { color: colors.text }]}>Attach a campaign</Text>
            <ScrollView>
              <Pressable
                style={[st.modalRow, { borderBottomColor: colors.border }, !campaignId && { backgroundColor: colors.section }]}
                onPress={() => { setCampaignId(""); setCampaignModal(false); }}
              >
                <Text style={[st.modalRowText, { color: !campaignId ? colors.accent : colors.text }, !campaignId && { fontWeight: "700" }]}>
                  No campaign
                </Text>
                {!campaignId && <Text style={[{ color: colors.accent, fontSize: 16, fontWeight: "700" }]}>✓</Text>}
              </Pressable>
              {campaigns.map((camp) => {
                const active = camp.id === campaignId;
                const inactive = camp.isActive === false;
                const suffix = `${camp.isDefault ? "  (default)" : ""}${inactive ? "  (inactive)" : ""}`;
                return (
                  <Pressable
                    key={camp.id}
                    style={[st.modalRow, { borderBottomColor: colors.border }, active && { backgroundColor: colors.section }]}
                    onPress={() => { setCampaignId(camp.id); setCampaignModal(false); }}
                  >
                    <Text style={[st.modalRowText, { color: active ? colors.accent : colors.text }, active && { fontWeight: "700" }]}>
                      {camp.name?.trim() || camp.id}{suffix}
                    </Text>
                    {active && <Text style={[{ color: colors.accent, fontSize: 16, fontWeight: "700" }]}>✓</Text>}
                  </Pressable>
                );
              })}
              {campaigns.length === 0 && <Text style={[st.modalEmpty, { color: colors.muted }]}>No campaigns available.</Text>}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Image position editor */}
      {(() => {
        const slot = slots.find((s) => s.id === positionSlotId);
        const src = slot ? (slot.localUri ?? slot.publicUrl) : null;
        if (!slot || !src) return null;
        const idx = slots.indexOf(slot);
        return (
          <ImagePositionEditor
            visible
            src={src}
            label={slot.label.trim() || `Option ${SLOT_LABELS[idx] ?? idx + 1}`}
            focalX={slot.imageFocalX}
            focalY={slot.imageFocalY}
            onChange={(x, y) => patchSlot(slot.id, { imageFocalX: x, imageFocalY: y })}
            onClose={() => setPositionSlotId(null)}
          />
        );
      })()}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  screenTitle: { fontSize: 17, fontWeight: "800" },

  // Slot tile
  slotTile: {
    aspectRatio: 1, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed",
    overflow: "hidden", justifyContent: "center", alignItems: "center",
    backgroundColor: "transparent",
  },
  slotImg: { width: "100%", height: "100%" },
  slotEmpty: { alignItems: "center", gap: 4 },
  slotPlus: { fontSize: 30, fontWeight: "300" },
  slotHint: { fontSize: 11 },
  slotBadge: { position: "absolute", top: 6, left: 6, width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  slotBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  slotOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", gap: 6 } as never,
  slotOverlayText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  slotDone: { position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center" },
  slotDoneText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  slotRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  slotRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  slotLock: { position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  slotLockText: { fontSize: 11 },
  lockedNote: { fontSize: 12, lineHeight: 17, borderWidth: 1, borderRadius: 10, padding: 10 },
  slotError: { color: "#f87171", fontSize: 10, textAlign: "center" },
  slotInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  positionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignItems: "center" },
  positionBtnText: { fontSize: 12, fontWeight: "700" },

  addSlotBtn: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  addSlotText: { fontSize: 14, fontWeight: "700" },

  // Settings card
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  settingCol: { paddingHorizontal: 14, paddingVertical: 12, gap: 8, borderBottomWidth: 1 },
  settingKey: { fontSize: 14, fontWeight: "600" },
  optional: { fontSize: 12, fontWeight: "400" },
  requiredBadge: { borderRadius: 4, backgroundColor: "#450a0a", paddingHorizontal: 6, paddingVertical: 2 },
  requiredText: { color: "#fca5a5", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // Category picker
  catPicker: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8, flex: 1, marginLeft: 12, maxWidth: "60%" },
  catPickerText: { flex: 1, fontSize: 13 },
  catChevron: { fontSize: 11 },

  // Post type chips (admin)
  typeChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  typeChipText: { fontSize: 12, fontWeight: "700" },

  captionInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 70, textAlignVertical: "top" },

  // Preset cards
  presetCard: { width: 82, borderRadius: 14, borderWidth: 1.5, padding: 10, alignItems: "center", gap: 3, position: "relative" },
  presetIcon: { fontSize: 20, marginBottom: 2 },
  presetLabel: { fontSize: 12, fontWeight: "800" },
  presetSub: { fontSize: 9, fontWeight: "500" },
  presetDot: { position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: 4 },

  // Date-time picker
  dtCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  dtSection: { padding: 14, gap: 10 },
  dtLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  dtDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  dtNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dtNavBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dtNavArrow: { fontSize: 22, fontWeight: "300" },
  dtDateText: { fontSize: 15, fontWeight: "700" },
  dtTimeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  dtSpinner: { alignItems: "center", gap: 6 },
  dtSpinBtn: { width: 38, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dtSpinArrow: { fontSize: 18, fontWeight: "600" },
  dtTimeNum: { fontSize: 30, fontWeight: "800", minWidth: 50, textAlign: "center" },
  dtColon: { fontSize: 30, fontWeight: "800", marginTop: -6 },
  dtAmPm: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  dtAmPmText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  summaryPill: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  summaryIcon: { fontSize: 20 },
  summaryTitle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  summaryDate: { fontSize: 13, fontWeight: "700", marginTop: 2 },

  errorBanner: { borderRadius: 10, padding: 12 },

  // Action area (inside scroll)
  footer: { gap: 8 },
  footerBtns: { flexDirection: "row", gap: 10 },
  launchBtn: { flex: 1.4, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  launchBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  scheduleBtn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, flexDirection: "row", gap: 6 },
  scheduleBtnText: { fontSize: 14, fontWeight: "700" },
  confirmScheduleBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 14, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, maxHeight: "70%" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, paddingHorizontal: 4 },
  modalRowText: { fontSize: 15 },
  modalEmpty: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
});
