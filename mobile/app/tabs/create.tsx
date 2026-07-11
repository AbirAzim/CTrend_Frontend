import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBar } from "../../context/TabBarContext";
import { CATEGORIES, CREATE_POST, FEED_POSTS, GET_POST_BY_ID, UPDATE_POST } from "@ctrend/shared/graphql/feed";
import { PUBLIC_CAMPAIGNS, CAMPAIGNS_ADMIN } from "@ctrend/shared/graphql/campaigns";
import { CAMPAIGN_BADGE_ICON } from "@ctrend/shared/lib/campaignUi";
import { CompareIcon, PollIcon, ImagesIcon } from "../../components/ContentIcons";
import { CREATE_SYSTEM_POST, PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { CompareImageCropper } from "../../components/CompareImageCropper";
import { AppActionSheet, AppConfirmDialog } from "../../components/AppDialog";
import { DEFAULT_IMAGE_FOCAL } from "../../lib/imageFocal";
import { useAuth } from "../../context/AuthContext";
import { useCoins } from "../../context/CoinsContext";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import { useTheme } from "../../context/ThemeContext";
import { FeedPostCard } from "../../components/FeedPostCard";
import { MentionAutocomplete } from "../../components/MentionAutocomplete";
import { useMentionAutocomplete } from "../../hooks/useMentionAutocomplete";
import type { FeedPostView, CompareLayout } from "@ctrend/shared/types/feed";
import { toGqlCompareLayout, normalizeCompareLayout, compareCropAspect, compareCellAspectRatio } from "@ctrend/shared/lib/compareLayout";
import { Ionicons } from "@expo/vector-icons";

const { width: SW } = Dimensions.get("window");

function defaultCategoryId(cats: Array<{ id: string; name?: string | null }>): string {
  return cats.find((c) => c.name?.trim().toLowerCase() === "entertainment")?.id ?? "";
}

type PendingConfirm = {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

// Enable smooth layout transitions (e.g. the campaign pill morph) on Android.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name?: string | null };
type CategoriesData = { categories: Category[] };
type CampaignOption = { id: string; name: string; isActive?: boolean | null; isDefault?: boolean | null };
type PublicCampaignsData = { publicCampaigns: CampaignOption[] };
type AdminCampaignsData = { campaigns: CampaignOption[] };
type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string } };

type EditPostData = {
  id: string;
  format?: string | null;
  compareLayout?: string | null;
  caption?: string | null;
  imageUrls?: (string | null)[] | null;
  options?: { label?: string | null; imageFocalX?: number | null; imageFocalY?: number | null }[] | null;
  category?: { id: string } | null;
  campaign?: { id: string } | null;
  votingEndsAt?: string | null;
  announceWinnerAfterVotingEnd?: boolean | null;
  isUserGlobalBroadcast?: boolean | null;
  upvoteCount?: number | null;
  downvoteCount?: number | null;
  optionStats?: { index: number; count?: number | null }[] | null;
};

/** Poll-only context/body image (post-level `imageUrls`). Optional, 0+. */
type BodyImg = {
  id: string;
  localUri: string | null;
  publicUrl: string | null;
  uploading: boolean;
  error: string | null;
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
  { label: "1 hr", hours: 1, color: "#f97316" },
  { label: "1 day", hours: 24, color: "#22c55e" },
  { label: "3 days", hours: 72, color: "#8b5cf6" },
  { label: "7 days", hours: 168, color: "#6366f1" },
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
      {/* Preset options — one compact row, no scrolling or stacking needed */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {QUICK_PRESETS.map((p) => {
          const active = presetHours === p.hours;
          return (
            <Pressable key={p.hours}
              style={[st.presetChip, { borderColor: active ? p.color : colors.border, backgroundColor: active ? p.color + "18" : colors.section }]}
              onPress={() => onPresetChange(p.hours)}>
              <Ionicons name="time-outline" size={14} color={active ? p.color : colors.muted} />
              <Text style={[st.presetChipText, { color: active ? p.color : colors.text }]} numberOfLines={1}>{p.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[st.presetChip, { borderColor: presetHours === null ? colors.accent : colors.border, backgroundColor: presetHours === null ? colors.accent + "18" : colors.section }]}
          onPress={() => onPresetChange(null)}>
          <Ionicons name="create-outline" size={14} color={presetHours === null ? colors.accent : colors.muted} />
          <Text style={[st.presetChipText, { color: presetHours === null ? colors.accent : colors.text }]} numberOfLines={1}>Custom</Text>
        </Pressable>
      </View>

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
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
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

  // Post layout: `compare` (image grid) or `poll` (stacked option rows).
  const [format, setFormat] = useState<"compare" | "poll" | "announcement">("compare");
  const [compareLayout, setCompareLayout] = useState<CompareLayout>("horizontal");
  const isPoll = format === "poll";
  const isAnnouncement = format === "announcement";

  const [slots, setSlots] = useState<Slot[]>([makeSlot("1"), makeSlot("2")]);
  // Poll-only body/context images (post-level imageUrls). Optional, 0+.
  const [bodyImages, setBodyImages] = useState<BodyImg[]>([]);
  const [caption, setCaption] = useState("");
  const captionMention = useMentionAutocomplete({
    value: caption,
    onChange: setCaption,
    mode: { kind: "global" },
  });
  const [categoryId, setCategoryId] = useState("");
  // Pre-select platform-wide when admin arrives from "+ New platform post"
  const [platformWide, setPlatformWide] = useState(platformParam === "1");
  const [broadcastGlobally, setBroadcastGlobally] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [campaignModal, setCampaignModal] = useState(false);
  const [imageSheetSlotId, setImageSheetSlotId] = useState<string | null>(null);
  // Pending crop: compare images pass through the crop+zoom editor before upload.
  const [cropper, setCropper] = useState<{ slotId: string; uri: string; fileName?: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Voting deadline
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [announceWinnerAfterVotingEnd, setAnnounceWinnerAfterVotingEnd] = useState(false);
  const [deadlinePreset, setDeadlinePreset] = useState<number | null>(24);
  const [deadlineCustom, setDeadlineCustom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(20, 0, 0, 0); return d;
  });

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [schedulePreset, setSchedulePreset] = useState<number | null>(24);
  const [scheduleCustom, setScheduleCustom] = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d;
  });

  const scrollRef = useRef<import("react-native").ScrollView>(null);
  const [pasteUrlActiveId, setPasteUrlActiveId] = useState<string | null>(null);

  // Hide the floating tab bar while this screen is focused so its own action
  // buttons are unobstructed; restore it on blur. Focus-based (not mount-based)
  // because this tab screen stays mounted between visits.
  const { translateY } = useTabBar();
  useFocusEffect(useCallback(() => {
    const TAB_TOTAL = 64 + 14 + insets.bottom;
    translateY.value = withTiming(TAB_TOTAL, { duration: 180 });
    return () => {
      translateY.value = withTiming(0, { duration: 180 });
    };
  }, [translateY, insets.bottom]));

  const { data: catData, loading: catLoading } = useQuery<CategoriesData>(CATEGORIES, {
    fetchPolicy: "cache-first", skip: !isAuthenticated,
  });
  const categories = catData?.categories ?? [];
  const selectedCat = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (isEdit || categoryId || categories.length === 0) return;
    const entId = defaultCategoryId(categories);
    if (entId) setCategoryId(entId);
  }, [categories, categoryId, isEdit]);

  // Campaigns — admin sees all (with inactive flagged); users see only
  // campaigns admins enabled for users (isPublic).
  const { data: publicCampData } = useQuery<PublicCampaignsData>(PUBLIC_CAMPAIGNS, {
    fetchPolicy: "cache-first", skip: !isAuthenticated || isAdmin,
  });
  const { data: adminCampData } = useQuery<AdminCampaignsData>(CAMPAIGNS_ADMIN, {
    fetchPolicy: "cache-first", skip: !isAuthenticated || !isAdmin,
  });
  const campaigns: CampaignOption[] = [
    ...(isAdmin ? adminCampData?.campaigns ?? [] : publicCampData?.publicCampaigns ?? []),
  ].sort((a, b) => {
    if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  const previewPost = useMemo((): FeedPostView => {
    const compareImages = slots
      .map((s) => s.publicUrl || s.localUri || "")
      .filter((u) => u.length > 0);
    return {
      id: "preview",
      format: format as "compare" | "poll" | "announcement",
      compareLayout: !isPoll && !isAnnouncement ? compareLayout : "horizontal",
      postType: isAdmin && (platformWide || isAnnouncement) ? "system" : "user",
      isUserGlobalBroadcast: broadcastGlobally || null,
      authorId: user?.id ?? "preview",
      authorUsername: user?.username ?? "you",
      authorDisplayName: user?.displayName ?? null,
      authorProfileImageUrl: user?.profileImageUrl ?? null,
      caption: caption.trim() || null,
      imageUrls: format === "compare" ? compareImages : bodyImages.map((b) => b.publicUrl || b.localUri || "").filter(Boolean),
      postOptions: slots.map((s) => ({
        label: s.label.trim() || "",
        imageUrl: s.publicUrl || s.localUri || null,
        imageFocalX: s.imageFocalX,
        imageFocalY: s.imageFocalY,
      })),
      optionStats: [],
      upvoteCount: 0,
      downvoteCount: 0,
      viewerVote: null,
      mySelectedOptionIndex: null,
      isVotingOpen: isAnnouncement ? false : true,
      createdAt: new Date().toISOString(),
      category: selectedCat ? { id: selectedCat.id, name: selectedCat.name ?? "", slug: null, color: null } : null,
      campaign: selectedCampaign ? { id: selectedCampaign.id, name: selectedCampaign.name, slug: "", prizePerWinner: 0, hasRewards: null, hasWinner: null } : null,
      commentCount: 0,
      hypeCount: 0,
      saveCount: 0,
    };
  }, [format, compareLayout, isAnnouncement, slots, caption, user, isAdmin, platformWide, broadcastGlobally, bodyImages, selectedCat, selectedCampaign, isPoll]);

  // Platform setting: can normal users broadcast a post globally? (Phase 36)
  const { data: platformSettingsData } = useQuery<{ platformSettings: { allowUserGlobalPosts: boolean } }>(
    PLATFORM_SETTINGS,
    { fetchPolicy: "cache-and-network", skip: !isAuthenticated || isAdmin },
  );
  const allowUserGlobalPosts = Boolean(platformSettingsData?.platformSettings?.allowUserGlobalPosts);

  const { awardCoins } = useCoins();
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
  // Tracks WHICH post id has been hydrated — not just a boolean — so opening a
  // different post (the tab stays mounted) always re-hydrates, and stale data
  // for the previous post is never applied.
  const editLoadedRef = useRef<string | null>(null);
  // Set true when an existing image is REPLACED with a different photo (or an
  // option is removed) → votes are wiped. Cropping the same image leaves it false.
  const votesResetRef = useRef(false);
  useEffect(() => {
    const post = editData?.getPostById;
    if (!isEdit || !post) return;
    // Ignore data that isn't (yet) the post we're editing — guards against
    // Apollo briefly returning the previous post's cached result.
    if (post.id !== editId) return;
    if (editLoadedRef.current === editId) return;
    editLoadedRef.current = editId ?? null;
    votesResetRef.current = false;
    // Polls and announcements have dedicated edit UIs — hand off.
    const fmt = (post.format ?? "").toLowerCase();
    if (fmt === "poll" || fmt === "announcement") {
      router.replace(`/edit-post?postId=${post.id}` as never);
      return;
    }
    setCaption(post.caption ?? "");
    setCompareLayout(normalizeCompareLayout(post.compareLayout));
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
        setAnnounceWinnerAfterVotingEnd(Boolean(post.announceWinnerAfterVotingEnd));
      }
    } else {
      // Don't carry a deadline over from a previously-edited post.
      setDeadlineEnabled(false);
      setAnnounceWinnerAfterVotingEnd(false);
    }
  }, [editData, isEdit, editId]);

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/auth/login" as never);
  }, [hydrated, isAuthenticated]);

  // This screen lives in the tab navigator, so it stays mounted between visits.
  // Reset when editId is cleared (back to create mode) OR when it switches from
  // one post directly to another (A→B without going through null) to avoid
  // showing the previous post's stale form values while the new post loads.
  useEffect(() => {
    if (!editId || (editLoadedRef.current !== null && editLoadedRef.current !== editId)) {
      editLoadedRef.current = null;
      resetForm();
    }
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated || !isAuthenticated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // ── Slot helpers ──────────────────────────────────────────────────────────
  function patchSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function addSlot() {
    const max = isPoll ? 8 : 4;
    if (slots.length >= max) return;
    const newId = String(Date.now());
    setSlots((prev) => [...prev, makeSlot(newId)]);
    // Scroll to the new slot and immediately offer the image picker
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      setImageSheetSlotId(newId);
    }, 150);
  }
  function removeSlot(id: string) {
    if (slots.length <= 2) return;
    // Remove the targeted slot unless it's a locked (existing/voted) option;
    // keep everything else. (The predicate was inverted, so unlocked options
    // could never be removed.)
    setSlots((prev) => prev.filter((s) => s.id !== id || s.locked));
  }

  // Clear the form back to a blank draft (after a successful launch, or when the
  // tab-mounted screen returns to create mode from edit mode).
  function resetForm() {
    editLoadedRef.current = null;
    setFormat("compare");
    setCompareLayout("horizontal");
    setSlots([makeSlot("1"), makeSlot("2")]);
    setBodyImages([]);
    setCaption("");
    setCategoryId(defaultCategoryId(categories));
    setCampaignId("");
    setPlatformWide(platformParam === "1");
    setBroadcastGlobally(true);
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
  // Upload a local image uri (already picked/cropped) into a slot.
  async function uploadToSlot(slotId: string, uri: string, mimeType = "image/jpeg", fileName?: string) {
    const ext = mimeType.split("/")[1] ?? "jpg";
    const filename = fileName ?? `photo_${Date.now()}.${ext}`;
    // A fresh image resets the focal point — the cropper already framed it.
    patchSlot(slotId, {
      localUri: uri,
      uploading: true,
      error: null,
      publicUrl: null,
      pasteUrl: "",
      imageFocalX: DEFAULT_IMAGE_FOCAL,
      imageFocalY: DEFAULT_IMAGE_FOCAL,
    });
    try {
      const { data } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
      if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL.");
      const { uploadUrl, publicUrl } = data.getImageUploadUrl;
      let uploadUri = uri;
      if (Platform.OS === "android" && !uri.startsWith("file://")) {
        uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: uploadUri });
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

  async function pickAndUpload(slotId: string, useCamera: boolean) {
    setPasteUrlActiveId((id) => (id === slotId ? null : id));
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed", "Camera access required."); return; }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed", "Gallery access required."); return; }
      }
      // Compare images go through our crop+zoom editor for a uniform shape;
      // poll thumbnails use the OS square crop (small + square-ish).
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.92, allowsEditing: isPoll })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.92, allowsEditing: isPoll });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      // Picking a brand-new photo for an existing option = a replace → wipes votes.
      const slot = slots.find((s) => s.id === slotId);
      if (isEdit && slot?.locked) votesResetRef.current = true;
      if (!isPoll) {
        setCropper({ slotId, uri: asset.uri, fileName: asset.fileName ?? undefined });
        return;
      }
      await uploadToSlot(slotId, asset.uri, asset.mimeType ?? "image/jpeg", asset.fileName ?? undefined);
    } catch (err: unknown) {
      patchSlot(slotId, { uploading: false, error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  async function applyPasteUrl(slotId: string, url: string) {
    if (!url.trim().startsWith("http")) return;
    const trimmed = url.trim();
    patchSlot(slotId, { publicUrl: trimmed, localUri: null, error: null });
  }

  function dismissPasteUrl(slotId: string) {
    setPasteUrlActiveId((id) => (id === slotId ? null : id));
    setSlots((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        return {
          ...s,
          pasteUrl: "",
          ...(s.localUri ? {} : { publicUrl: null, error: null }),
        };
      }),
    );
  }

  function clearSlotImage(slot: Slot) {
    if (!slot.localUri && !slot.publicUrl && !slot.pasteUrl) return;
    const doClear = () => {
      setPasteUrlActiveId((id) => (id === slot.id ? null : id));
      patchSlot(slot.id, {
        localUri: null,
        publicUrl: null,
        pasteUrl: "",
        uploading: false,
        error: null,
        imageFocalX: DEFAULT_IMAGE_FOCAL,
        imageFocalY: DEFAULT_IMAGE_FOCAL,
      });
      if (slot.locked) votesResetRef.current = true;
    };
    if (slot.locked && editPostHasVotes) {
      setPendingConfirm({
        title: "Remove image?",
        message: "Removing this image will reset all current votes on this option.",
        confirmLabel: "Remove",
        destructive: true,
        onConfirm: doClear,
      });
      return;
    }
    doClear();
  }

  function openImageOptions(slotId: string) {
    setImageSheetSlotId(slotId);
  }

  // Whether the post being edited already has at least one vote. Before the
  // first vote, swapping an image is harmless, so no warning is shown.
  const editPostHasVotes = (() => {
    const p = editData?.getPostById;
    if (!p) return false;
    if ((p.upvoteCount ?? 0) + (p.downvoteCount ?? 0) > 0) return true;
    return (p.optionStats ?? []).some((s) => (s.count ?? 0) > 0);
  })();

  /** Crop & reposition the CURRENT image (same as create) — never resets votes. */
  function cropExisting(slot: Slot) {
    const src = slot.localUri || slot.publicUrl;
    if (!src) { openImageOptions(slot.id); return; }
    setCropper({ slotId: slot.id, uri: src });
  }

  /**
   * Replace an option's image with a DIFFERENT photo. For an existing option
   * that already has votes, that wipes the votes — so confirm first.
   */
  function requestReplace(slot: Slot) {
    if (slot.locked && editPostHasVotes) {
      setPendingConfirm({
        title: "Replace image?",
        message:
          "Replacing this with a different photo will remove all current votes. " +
          "Cropping or repositioning the same image keeps the votes.",
        confirmLabel: "Replace anyway",
        destructive: true,
        onConfirm: () => openImageOptions(slot.id),
      });
      return;
    }
    openImageOptions(slot.id);
  }

  // ── Poll helpers ────────────────────────────────────────────────────────────
  /** Quick-fill two text options "Yes" / "No". */
  function fillYesNo() {
    setSlots([
      { ...makeSlot("yes"), label: "Yes" },
      { ...makeSlot("no"), label: "No" },
    ]);
  }

  /** Pick + upload a poll context/body image, appending it to the grid. */
  async function pickAndUploadBody() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Gallery access required."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const id = String(Date.now());
      setBodyImages((prev) => [...prev, { id, localUri: asset.uri, publicUrl: null, uploading: true, error: null }]);
      const mimeType = asset.mimeType ?? "image/jpeg";
      const ext = mimeType.split("/")[1] ?? "jpg";
      const filename = asset.fileName ?? `photo_${Date.now()}.${ext}`;
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
      setBodyImages((prev) => prev.map((b) => (b.id === id ? { ...b, uploading: false, publicUrl } : b)));
    } catch (err: unknown) {
      setBodyImages((prev) =>
        prev.map((b) => (b.uploading ? { ...b, uploading: false, error: err instanceof Error ? err.message : "Upload failed" } : b)),
      );
    }
  }

  function removeBodyImage(id: string) {
    setBodyImages((prev) => prev.filter((b) => b.id !== id));
  }

  const imageSheetSlot = imageSheetSlotId
    ? slots.find((s) => s.id === imageSheetSlotId)
    : null;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(isSchedule: boolean) {
    setSubmitError(null);
    const resolvedCategoryId = categoryId || defaultCategoryId(categories);
    if (!resolvedCategoryId) { setSubmitError("Please select a category."); return; }

    let imageUrls: string[];
    let options: Array<{ label: string; imageUrl?: string; imageFocalX?: number; imageFocalY?: number }>;

    if (isAnnouncement) {
      // Announcement: no options, images from bodyImages list (up to 6).
      options = [];
      imageUrls = bodyImages.map((b) => b.publicUrl).filter((u): u is string => Boolean(u));
    } else if (isPoll) {
      if (slots.some((s) => s.uploading) || bodyImages.some((b) => b.uploading)) {
        setSubmitError("Please wait for uploads to finish."); return;
      }
      const labeled = slots.filter((s) => s.label.trim().length > 0);
      if (labeled.length < 2) { setSubmitError("Add at least two poll options with labels."); return; }
      // Poll options: label required, image optional (text-only rows allowed).
      options = slots
        .filter((s) => s.label.trim().length > 0 || s.publicUrl)
        .map((s, i) => {
          const label = s.label.trim() || `Option ${SLOT_LABELS[i] ?? i + 1}`;
          return s.publicUrl
            ? { label, imageUrl: s.publicUrl, imageFocalX: s.imageFocalX, imageFocalY: s.imageFocalY }
            : { label };
        });
      // Body/context images live in post-level imageUrls (optional for polls).
      imageUrls = bodyImages.map((b) => b.publicUrl).filter((u): u is string => Boolean(u));
    } else {
      const readySlots = slots.filter((s) => s.publicUrl);
      if (readySlots.length < 2) { setSubmitError("Upload or paste at least 2 images."); return; }
      if (slots.some((s) => s.uploading)) { setSubmitError("Please wait for uploads to finish."); return; }
      imageUrls = readySlots.map((s) => s.publicUrl as string);
      options = readySlots.map((s, i) => ({
        label: s.label.trim() || `Option ${SLOT_LABELS[i] ?? i + 1}`,
        imageUrl: s.publicUrl as string,
        imageFocalX: s.imageFocalX,
        imageFocalY: s.imageFocalY,
      }));
    }

    // ── Edit mode: update the existing post instead of creating a new one ──
    if (isEdit && editId) {
      const updateInput: Record<string, unknown> = {
        categoryId: resolvedCategoryId,
        imageUrls,
        options,
        compareLayout: toGqlCompareLayout(compareLayout),
        // Always send caption so clearing it persists; "" clears the campaign too.
        caption: caption.trim() || undefined,
        campaignId,
        // Only replacing a photo with a different one (or removing an option)
        // wipes votes; cropping the same image keeps them.
        resetVotes: votesResetRef.current,
      };
      const wasGlobal = Boolean(editData?.getPostById?.isUserGlobalBroadcast);
      if (!isAdmin && allowUserGlobalPosts && broadcastGlobally !== wasGlobal) {
        updateInput.broadcastGlobally = broadcastGlobally;
      }
      if (deadlineEnabled) {
        updateInput.votingEndsAt = deadlinePreset !== null ? hoursFromNow(deadlinePreset) : deadlineCustom.toISOString();
        updateInput.announceWinnerAfterVotingEnd = announceWinnerAfterVotingEnd;
      }
      try {
        await updatePost({ variables: { postId: editId, input: updateInput } });
        router.back();
      } catch (err: unknown) {
        setSubmitError(getApolloErrorMessage(err));
      }
      return;
    }

    const input: Record<string, unknown> = {
      categoryId: resolvedCategoryId,
      format: format.toUpperCase(),
      imageUrls,
      options,
      compareLayout: !isPoll && !isAnnouncement ? toGqlCompareLayout(compareLayout) : undefined,
    };
    if (caption.trim()) { input.caption = caption.trim(); input.contentText = caption.trim(); }
    if (campaignId) input.campaignId = campaignId;
    // Non-admin global broadcast (admins use createSystemPost instead) — Phase 36
    if (!isAdmin && allowUserGlobalPosts && broadcastGlobally) input.broadcastGlobally = true;

    if (deadlineEnabled) {
      input.votingEndsAt = deadlinePreset !== null ? hoursFromNow(deadlinePreset) : deadlineCustom.toISOString();
      input.announceWinnerAfterVotingEnd = announceWinnerAfterVotingEnd;
    }
    if (isSchedule && scheduleEnabled) {
      const scheduledAt = schedulePreset !== null
        ? new Date(Date.now() + schedulePreset * 3_600_000).toISOString()
        : scheduleCustom.toISOString();
      if (new Date(scheduledAt) > new Date()) input.scheduledAt = scheduledAt;
    }

    try {
      const useSystem = isAdmin && (platformWide || isAnnouncement);
      const mutFn = useSystem ? createSystemPost : createPost;
      await mutFn({ variables: { input }, refetchQueries: useSystem ? [] : [{ query: FEED_POSTS }] });
      // Coins: earn for creating a post (system/admin posts aren't rewarded).
      if (!useSystem) awardCoins(COIN_AMOUNTS.POST);
      resetForm();
      router.replace("/tabs");
    } catch (err: unknown) {
      setSubmitError(getApolloErrorMessage(err));
    }
  }

  // Robust back: fall back to the feed tab when there's no screen to pop (e.g.
  // this tab was reached without a stack entry behind it).
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/tabs" as never);
  }

  function confirmCancel() {
    // In edit mode there's no "draft" to lose — just leave (unsaved edits are
    // simply not applied).
    if (isEdit) { goBack(); return; }
    const dirty =
      slots.some((s) => s.localUri || s.pasteUrl || s.label.trim()) ||
      bodyImages.length > 0 ||
      caption.trim();
    if (!dirty) { goBack(); return; }
    setPendingConfirm({
      title: "Discard post?",
      message: "Your draft will be lost.",
      confirmLabel: "Discard",
      destructive: true,
      onConfirm: () => goBack(),
    });
  }

  const isSubmitting = submitting || submittingSystem || updating;
  const slotW = (SW - 16 * 2 - 12) / 2;
  const isVerticalBinary = !isPoll && !isAnnouncement && compareLayout === "vertical" && slots.length < 3;
  const slotPreviewW = isVerticalBinary ? SW - 16 * 2 : slotW;
  const slotPreviewAspect = compareCellAspectRatio(compareLayout, slots.length);

  return (
    <KeyboardAvoidingView style={[{ flex: 1, backgroundColor: colors.bg }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 100, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={st.topRow}>
          {isEdit ? (
            <Pressable onPress={goBack} hitSlop={10} style={{ width: 60 }}>
              <Text style={[st.backText, { color: colors.muted }]}>← Back</Text>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
          <Text style={[st.screenTitle, { color: colors.text }]}>
            {isEdit ? "Edit Compare" : isAnnouncement ? "New Announcement" : isPoll ? "New Poll" : "New Compare"}
          </Text>
          {isEdit ? (
            <View style={{ width: 60 }} />
          ) : (
            <Pressable
              hitSlop={10}
              style={{ width: 60, alignItems: "flex-end" }}
              onPress={() =>
                setPendingConfirm({
                  title: "Clear all?",
                  message: "This will reset everything you've entered.",
                  confirmLabel: "Clear all",
                  destructive: true,
                  onConfirm: () => resetForm(),
                })
              }
            >
              <Text style={[st.clearAllText, { color: colors.muted }]}>Clear all</Text>
            </Pressable>
          )}
        </View>

        {/* ── Format switcher (create only) ── */}
        {!isEdit && (
          <View style={[st.formatSwitch, { backgroundColor: colors.section, borderColor: colors.border }]}>
            {([
              { f: "compare" as const, label: "Compare", Icon: CompareIcon },
              { f: "poll" as const, label: "Poll", Icon: PollIcon },
              ...(isAdmin ? [{ f: "announcement" as const, label: "Announce", Icon: null }] : []),
            ] as Array<{ f: "compare" | "poll" | "announcement"; label: string; Icon: typeof CompareIcon | null }>).map(({ f, label, Icon }) => {
              const active = format === f;
              const iconColor = active ? "#fff" : colors.subtext;
              return (
                <Pressable
                  key={f}
                  style={[st.formatBtn, active && { backgroundColor: colors.accent }]}
                  onPress={() => setFormat(f)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {Icon ? <Icon size={15} color={iconColor} /> : (
                      <Text style={{ fontSize: 14, color: iconColor }}>📢</Text>
                    )}
                    <Text style={[st.formatBtnText, { color: iconColor }]}>
                      {label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {!isPoll && !isAnnouncement && (
          <View style={{ gap: 6, marginBottom: 10 }}>
            <View style={[st.layoutSwitch, { backgroundColor: colors.section, borderColor: colors.border, marginBottom: 0 }]}>
              {([
                { key: "horizontal" as const, label: "Side by side" },
                { key: "vertical" as const, label: "Stacked" },
              ]).map(({ key, label }) => {
                const active = compareLayout === key;
                return (
                  <Pressable
                    key={key}
                    style={[st.layoutBtn, active && { backgroundColor: colors.card, borderColor: colors.accent + "55" }]}
                    onPress={() => setCompareLayout(key)}
                  >
                    <Text style={[st.layoutBtnText, { color: active ? colors.text : colors.subtext }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[st.layoutHint, { color: colors.muted }]}>
              {compareLayout === "vertical"
                ? "Stacked uses wide landscape strips (16:9) — tap each photo to crop."
                : "Side by side uses portrait frames (4:5) — tap each photo to crop."}
            </Text>
          </View>
        )}

        {/* ── Compare slots (2-col grid) ── */}
        {isAnnouncement ? (
          /* ── Announcement images ── */
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12, gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ImagesIcon size={15} color={colors.muted} />
              <Text style={[st.settingKey, { color: colors.text }]}>Images</Text>
              <Text style={[st.optional, { color: colors.muted }]}>optional · up to 6</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              {bodyImages.map((b) => (
                <View key={b.id} style={[st.bodyCell, { borderColor: colors.border, backgroundColor: colors.section }]}>
                  {b.uploading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : b.publicUrl || b.localUri ? (
                    <Image source={{ uri: (b.publicUrl ?? b.localUri) as string }} style={st.bodyCellImg} contentFit="cover" />
                  ) : null}
                  <Pressable style={st.bodyRemove} onPress={() => removeBodyImage(b.id)} hitSlop={6}>
                    <Text style={st.bodyRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {bodyImages.length < 6 && (
                <Pressable
                  style={[st.bodyAdd, { borderColor: colors.accent + "88" }]}
                  onPress={() => void pickAndUploadBody()}
                >
                  <Text style={[st.pollThumbPlus, { color: colors.accent }]}>＋</Text>
                  <Text style={[st.optional, { color: colors.accent }]}>Add</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : !isPoll ? (
        <View style={{ gap: 12 }}>
          {isEdit && (
            <Text style={[st.lockedNote, { color: colors.muted, backgroundColor: colors.section, borderColor: colors.border }]}>
              Tap a photo to crop & reposition it — labels and crops stay free.
              {editPostHasVotes
                ? " Replacing a photo with a different one resets votes (you'll be asked to confirm)."
                : " You can also replace photos freely until the first vote is cast."}
            </Text>
          )}
          <View style={{ flexDirection: isVerticalBinary ? "column" : "row", flexWrap: "wrap", gap: 12 }}>
            {slots.map((slot, idx) => {
              const imgSrc = slot.localUri ?? (slot.publicUrl && !slot.pasteUrl ? slot.publicUrl : null);
              const hasImage = imgSrc || (slot.pasteUrl && slot.publicUrl);
              const locked = Boolean(slot.locked);
              return (
                <View key={slot.id} style={{ width: slotPreviewW, gap: 6 }}>
                  {/* Image tile — tap crops/repositions the current image */}
                  <Pressable
                    style={[
                      st.slotTile,
                      { aspectRatio: slotPreviewAspect, borderColor: slot.error ? "#ef4444" : hasImage ? colors.accent + "66" : colors.border },
                    ]}
                    onPress={() => (hasImage ? cropExisting(slot) : openImageOptions(slot.id))}
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
                      <Text style={st.slotBadgeText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
                        {SLOT_LABELS[idx] ?? idx + 1}
                      </Text>
                    </View>
                    {slot.uploading && (
                      <View style={st.slotOverlay}>
                        <ActivityIndicator color="#fff" />
                        <Text style={st.slotOverlayText}>Uploading…</Text>
                      </View>
                    )}
                    {slot.publicUrl && !slot.uploading && (
                      <View style={st.slotDone}>
                        <Text style={st.slotDoneText} maxFontSizeMultiplier={1.2} numberOfLines={1}>✓</Text>
                      </View>
                    )}
                    {hasImage && (
                      <View style={st.slotReplaceHint}>
                        <Text style={st.slotReplaceHintText}>Tap to crop</Text>
                      </View>
                    )}
                    {hasImage && !slot.uploading && !locked && (
                      <Pressable
                        style={st.slotClearImage}
                        onPress={() => clearSlotImage(slot)}
                        hitSlop={8}
                        accessibilityLabel="Remove image"
                      >
                        <Ionicons name="close" size={13} color="#fff" />
                      </Pressable>
                    )}
                    {slots.length > 2 && !locked && (
                      <Pressable
                        style={st.slotRemoveOption}
                        onPress={() => removeSlot(slot.id)}
                        hitSlop={6}
                        accessibilityLabel="Remove option"
                      >
                        <Ionicons name="trash-outline" size={12} color="#fff" />
                      </Pressable>
                    )}
                  </Pressable>
                  {slot.error ? <Text style={st.slotError}>{slot.error}</Text> : null}
                  {/* Replace with a different photo (resets votes when the post
                      already has any). Cropping the same image is free (tap tile). */}
                  {hasImage ? (
                    <Pressable
                      style={[st.positionBtn, { backgroundColor: colors.section, borderColor: colors.border }]}
                      onPress={() => requestReplace(slot)}
                    >
                      <Ionicons name="swap-horizontal-outline" size={14} color={colors.subtext} />
                      <Text style={[st.positionBtnText, { color: colors.subtext }]}>Replace photo</Text>
                    </Pressable>
                  ) : null}
                  {/* Paste URL — hidden until user opens it from the sheet */}
                  {!locked && pasteUrlActiveId === slot.id && (
                    <View style={st.pasteUrlRow}>
                      <TextInput
                        style={[st.slotInput, st.pasteUrlInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                        value={slot.pasteUrl}
                        onChangeText={(v) => {
                          patchSlot(slot.id, { pasteUrl: v });
                          if (v.trim().startsWith("http")) void applyPasteUrl(slot.id, v);
                        }}
                        placeholder="Paste image URL…"
                        placeholderTextColor={colors.muted}
                        autoCapitalize="none"
                        keyboardType="url"
                        autoFocus
                      />
                      <Pressable
                        style={st.pasteUrlDismiss}
                        onPress={() => dismissPasteUrl(slot.id)}
                        hitSlop={10}
                        accessibilityLabel="Close paste URL"
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  )}
                  {/* Label — always editable, even for existing options. */}
                  <TextInput
                    style={[st.slotInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                    value={slot.label}
                    onChangeText={(v) => patchSlot(slot.id, { label: v })}
                    placeholder="Label…"
                    placeholderTextColor={colors.muted}
                    maxLength={40}
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
        ) : (
        /* ── Poll option rows + context images ── */
        <View style={{ gap: 12 }}>
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12, gap: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <PollIcon size={15} color={colors.muted} />
                <Text style={[st.settingKey, { color: colors.text }]}>Poll options</Text>
                <View style={st.requiredBadge}><Text style={st.requiredText}>REQUIRED</Text></View>
              </View>
              <Pressable
                style={[st.yesNoBtn, { borderColor: colors.accent + "66", backgroundColor: colors.accent + "14" }]}
                onPress={fillYesNo}
              >
                <Text style={[st.yesNoText, { color: colors.accent }]}>Yes / No</Text>
              </Pressable>
            </View>

            {slots.map((slot, idx) => {
              const imgSrc = slot.localUri ?? slot.publicUrl;
              return (
                <View key={slot.id} style={st.pollRow}>
                  <Pressable
                    style={[st.pollThumb, { borderColor: colors.border, backgroundColor: colors.section }]}
                    onPress={() => openImageOptions(slot.id)}
                  >
                    {slot.uploading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : imgSrc ? (
                      <Image source={{ uri: imgSrc }} style={st.pollThumbImg} contentFit="cover" />
                    ) : (
                      <Text style={[st.pollThumbPlus, { color: colors.muted }]}>＋</Text>
                    )}
                  </Pressable>
                  <TextInput
                    style={[st.pollLabelInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                    value={slot.label}
                    onChangeText={(v) => patchSlot(slot.id, { label: v })}
                    placeholder={`Option ${idx + 1}`}
                    placeholderTextColor={colors.muted}
                    maxLength={200}
                  />
                  {slots.length > 2 && (
                    <Pressable style={st.pollRemove} onPress={() => removeSlot(slot.id)} hitSlop={6}>
                      <Text style={[st.pollRemoveText, { color: colors.muted }]}>✕</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}

            {slots.length < 8 && (
              <Pressable style={[st.addSlotBtn, { borderColor: colors.accent + "88", paddingVertical: 11 }]} onPress={addSlot}>
                <Text style={[st.addSlotText, { color: colors.accent }]}>+ Add option</Text>
              </Pressable>
            )}
          </View>

          {/* Context images (optional) */}
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12, gap: 8 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ImagesIcon size={15} color={colors.muted} />
              <Text style={[st.settingKey, { color: colors.text }]}>Context images</Text>
              <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
            </View>
            <Text style={[st.optional, { color: colors.muted }]}>Shown above your poll options.</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
              {bodyImages.map((b) => (
                <View key={b.id} style={[st.bodyCell, { borderColor: colors.border, backgroundColor: colors.section }]}>
                  {b.uploading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : b.publicUrl || b.localUri ? (
                    <Image source={{ uri: (b.publicUrl ?? b.localUri) as string }} style={st.bodyCellImg} contentFit="cover" />
                  ) : null}
                  <Pressable style={st.bodyRemove} onPress={() => removeBodyImage(b.id)} hitSlop={6}>
                    <Text style={st.bodyRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable
                style={[st.bodyAdd, { borderColor: colors.accent + "88" }]}
                onPress={() => void pickAndUploadBody()}
              >
                <Text style={[st.pollThumbPlus, { color: colors.accent }]}>＋</Text>
                <Text style={[st.optional, { color: colors.accent }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
        )}

        {/* ── Settings card ── */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Admin: post type */}
          {isAdmin && !isEdit && (
            <View style={[st.settingRow, { borderBottomColor: colors.border }]}>
              <Text style={[st.settingKey, { color: colors.text }]}>Post type</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["Friends Only", "Platform-wide"] as const).map((opt) => {
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

          {/* Non-admin: who can see & vote (friends vs everyone) — plain-language
              audience picker instead of a "global" toggle that confused users. */}
          {!isAdmin && allowUserGlobalPosts && (
            <View style={[st.settingCol, { borderBottomColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 14 }}>👀</Text>
                <Text style={[st.settingKey, { color: colors.text }]}>Who can see &amp; vote?</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                {([
                  { val: true, ionIcon: "earth-outline" as const, title: "Everyone", desc: "Anyone on Ke Jitbe" },
                  { val: false, ionIcon: "people-outline" as const, title: "Friends only", desc: "Just your friends" },
                ] as const).map((o) => {
                  const active = broadcastGlobally === o.val;
                  return (
                    <Pressable
                      key={o.title}
                      onPress={() => setBroadcastGlobally(o.val)}
                      style={[
                        st.audCard,
                        {
                          borderColor: active ? colors.accent : colors.border,
                          backgroundColor: active ? colors.accent + "1A" : colors.section,
                        },
                      ]}
                    >
                      <Ionicons name={o.ionIcon} size={22} color={active ? colors.accent : colors.muted} style={st.audIcon} />
                      <Text style={[st.audTitle, { color: active ? colors.accent : colors.text }]}>{o.title}</Text>
                      <Text style={[st.audDesc, { color: colors.muted }]}>{o.desc}</Text>
                      {active && (
                        <View style={[st.audCheck, { backgroundColor: colors.accent }]}>
                          <Text style={st.audCheckText} maxFontSizeMultiplier={1.2} numberOfLines={1}>✓</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[st.audHint, { color: colors.muted }]}>
                {broadcastGlobally
                  ? "Anyone on Ke Jitbe can see and vote — they'll see it's from you."
                  : "Only your friends can see and vote on this."}
              </Text>
            </View>
          )}

          {/* Category */}
          <Pressable style={[st.settingRow, { borderBottomColor: colors.border }]} onPress={() => setCategoryModal(true)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.accent, fontSize: 14 }}>◆</Text>
              <Text style={[st.settingKey, { color: colors.text }]}>Category</Text>
            </View>
            <View style={[st.catPicker, { backgroundColor: colors.section, borderColor: colors.border }]}>
              <Text style={[st.catPickerText, { color: selectedCat ? colors.text : colors.muted }]}>
                {catLoading ? "Loading…" : selectedCat?.name?.trim() || "Pick a category"}
              </Text>
              <Text style={[st.catChevron, { color: colors.muted }]}>▼</Text>
            </View>
          </Pressable>

          {/* Campaign (optional) — collapsed into a pill by default; the picker
              opens in a slide-up modal, and the pill morphs in/out smoothly. */}
          {campaigns.length > 0 && (
            <View style={[st.campaignRow, { borderBottomColor: colors.border }]}>
              {selectedCampaign ? (
                <View style={[st.campaignPill, { backgroundColor: colors.accent + "1A", borderColor: colors.accent }]}>
                  <Pressable
                    onPress={() => setCampaignModal(true)}
                    hitSlop={6}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}
                  >
                    <Text style={{ fontSize: 12 }}>{CAMPAIGN_BADGE_ICON}</Text>
                    <Text style={[st.campaignPillText, { color: colors.accent }]} numberOfLines={1}>
                      {selectedCampaign.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setCampaignId("");
                    }}
                    hitSlop={8}
                    style={st.campaignPillClose}
                  >
                    <Text style={[st.campaignPillX, { color: colors.accent }]}>✕</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setCampaignModal(true)}
                  style={[st.campaignAddPill, { borderColor: colors.accent + "55", backgroundColor: colors.section }]}
                  hitSlop={4}
                >
                  <Text style={[st.campaignAddText, { color: colors.muted }]}>
                    {CAMPAIGN_BADGE_ICON}  Add to a campaign
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Caption */}
          <View style={[st.settingCol, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.accent, fontSize: 14 }}>✎</Text>
              <Text style={[st.settingKey, { color: colors.text }]}>Caption</Text>
              <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
            </View>
            <View style={{ position: "relative" }}>
              <MentionAutocomplete candidates={captionMention.candidates} onSelect={captionMention.select} />
              <TextInput
                style={[st.captionInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                value={caption}
                onChangeText={setCaption}
                onSelectionChange={captionMention.onSelectionChange}
                onBlur={captionMention.handleBlur}
                placeholder={isAnnouncement ? "Write your announcement… (links become clickable)" : isPoll ? "Ask your question… (links become clickable)" : "What are you comparing?"}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
            </View>
          </View>

          {/* Set voting deadline — hidden for announcements */}
          {!isAnnouncement && (
            <>
              <View style={[st.settingRow, !deadlineEnabled ? {} : { borderBottomColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="time-outline" size={15} color={colors.muted} />
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
                  <View style={[st.settingRow, { borderBottomWidth: 0 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="trophy-outline" size={15} color={colors.muted} />
                      <Text style={[st.settingKey, { color: colors.text }]}>Announce a winner after voting ends</Text>
                      <Text style={[st.optional, { color: colors.muted }]}>optional</Text>
                    </View>
                    <Switch
                      value={announceWinnerAfterVotingEnd}
                      onValueChange={setAnnounceWinnerAfterVotingEnd}
                      trackColor={{ false: colors.border, true: colors.accent }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Schedule date picker — only shown when schedule mode is active (not for announcements) */}
        {!isAnnouncement && scheduleEnabled && (
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
                : <Text style={st.launchBtnText}>{isEdit ? "Save changes" : isAnnouncement ? "Post announcement →" : isAdmin && platformWide ? "Launch platform-wide →" : "Launch it →"}</Text>
              }
            </Pressable>
            {!isEdit && !isAnnouncement && (
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
          <Pressable
            onPress={() => setPreviewVisible(true)}
            style={[st.previewBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="eye-outline" size={18} color={colors.muted} />
            <Text style={[st.previewBtnText, { color: colors.muted }]}>Preview</Text>
          </Pressable>
          <Pressable onPress={confirmCancel} hitSlop={10} style={{ alignItems: "center", paddingVertical: 4 }}>
            <Text style={[st.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Feed preview modal */}
      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <View style={st.previewOverlay}>
          <View style={[st.previewModal, { backgroundColor: colors.bg }]}>
            <View style={[st.previewHead, { borderBottomColor: colors.border }]}>
              <Text style={[st.previewHeadTitle, { color: colors.muted }]}>FEED PREVIEW</Text>
              <Pressable onPress={() => setPreviewVisible(false)} hitSlop={12} style={st.previewCloseBtn}>
                <Text style={[st.previewCloseText, { color: colors.muted }]}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
              <View pointerEvents="none">
                <FeedPostCard post={previewPost} variant="feed" />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                    onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCampaignId(camp.id); setCampaignModal(false); }}
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

      {/* Crop + zoom editor (compare images) */}
      <CompareImageCropper
        visible={cropper !== null}
        uri={cropper?.uri ?? null}
        aspect={compareCropAspect(compareLayout, slots.length)}
        onCancel={() => setCropper(null)}
        onDone={(croppedUri) => {
          const target = cropper;
          setCropper(null);
          if (target) void uploadToSlot(target.slotId, croppedUri, "image/jpeg", target.fileName);
        }}
      />

      <AppConfirmDialog
        visible={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.message}
        confirmLabel={pendingConfirm?.confirmLabel ?? "Confirm"}
        destructive={pendingConfirm?.destructive}
        onConfirm={() => pendingConfirm?.onConfirm()}
        onCancel={() => setPendingConfirm(null)}
      />

      <AppActionSheet
        centered
        visible={imageSheetSlotId !== null}
        title={imageSheetSlot?.localUri || imageSheetSlot?.publicUrl ? "Image options" : "Add image"}
        onClose={() => setImageSheetSlotId(null)}
        actions={
          imageSheetSlot?.localUri || imageSheetSlot?.publicUrl
            ? [
                ...(!isPoll && (imageSheetSlot?.localUri || imageSheetSlot?.publicUrl)
                  ? [{
                      label: "Crop & reposition",
                      onPress: () => {
                        const s = imageSheetSlot;
                        const src = s?.localUri ?? s?.publicUrl;
                        if (s && src) setCropper({ slotId: s.id, uri: src });
                      },
                    }]
                  : []),
                {
                  label: "Replace from gallery",
                  onPress: () => void pickAndUpload(imageSheetSlotId!, false),
                },
                {
                  label: "Take new photo",
                  onPress: () => void pickAndUpload(imageSheetSlotId!, true),
                },
                {
                  label: "Remove",
                  destructive: true,
                  onPress: () =>
                    patchSlot(imageSheetSlotId!, {
                      localUri: null,
                      publicUrl: null,
                      pasteUrl: "",
                      error: null,
                    }),
                },
                { label: "Cancel", cancel: true, onPress: () => {} },
              ]
            : [
                {
                  label: "Choose from gallery",
                  onPress: () => void pickAndUpload(imageSheetSlotId!, false),
                },
                {
                  label: "Take a photo",
                  onPress: () => void pickAndUpload(imageSheetSlotId!, true),
                },
                {
                  label: "Paste URL",
                  onPress: () => {
                    setImageSheetSlotId(null);
                    setPasteUrlActiveId(imageSheetSlotId!);
                  },
                },
                { label: "Cancel", cancel: true, onPress: () => {} },
              ]
        }
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  screenTitle: { fontSize: 17, fontWeight: "800" },
  clearAllText: { fontSize: 13, fontWeight: "700" },
  // Slim, low-profile row — campaign sits as a small button on the right.
  campaignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  campaignAddPill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  campaignAddText: { fontSize: 12, fontWeight: "600" },
  campaignPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
  },
  campaignPillText: { fontSize: 12.5, fontWeight: "800", flexShrink: 1 },
  campaignPillClose: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  campaignPillX: { fontSize: 11, fontWeight: "900" },
  audCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 2,
  },
  audIcon: { marginBottom: 2 },
  audTitle: { fontSize: 13.5, fontWeight: "800" },
  audDesc: { fontSize: 11, textAlign: "center" },
  audCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  audCheckText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  audHint: { fontSize: 12, marginTop: 8, lineHeight: 16 },
  backText: { fontSize: 15, fontWeight: "600" },

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
  slotClearImage: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  slotRemoveOption: {
    position: "absolute",
    top: 4,
    left: 28,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(185,28,28,0.82)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  slotRemove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  slotRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  slotReplaceHint: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.45)", paddingVertical: 3, alignItems: "center" },
  slotReplaceHintText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  lockedNote: { fontSize: 12, lineHeight: 17, borderWidth: 1, borderRadius: 10, padding: 10 },
  slotError: { color: "#f87171", fontSize: 10, textAlign: "center" },
  slotInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12 },
  pasteUrlRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pasteUrlInput: { flex: 1 },
  pasteUrlDismiss: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  positionBtn: {
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  positionBtnText: { fontSize: 12, fontWeight: "700" },

  addSlotBtn: { borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  addSlotText: { fontSize: 14, fontWeight: "700" },

  // Format switcher (Compare / Poll)
  formatSwitch: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  layoutSwitch: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 10 },
  layoutBtn: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: 9,
    alignItems: "center",
  },
  layoutBtnText: { fontSize: 13, fontWeight: "700" },
  layoutHint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 2 },
  formatBtn: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: "center" },
  formatBtnText: { fontSize: 14, fontWeight: "800" },

  // Poll option rows
  yesNoBtn: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  yesNoText: { fontSize: 12, fontWeight: "800" },
  pollRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pollThumb: { width: 46, height: 46, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pollThumbImg: { width: "100%", height: "100%" },
  pollThumbPlus: { fontSize: 20, fontWeight: "400" },
  pollLabelInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pollRemove: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  pollRemoveText: { fontSize: 15, fontWeight: "700" },

  // Poll context/body images
  bodyCell: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  bodyCellImg: { width: "100%", height: "100%" },
  bodyRemove: { position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  bodyRemoveText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  bodyAdd: { width: 64, height: 64, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 1 },

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

  // Preset options — stacked full-width rows (was a horizontally-scrolling card row)
  // Preset options — compact chips that all fit on one row (icon + label only)
  presetChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 4, paddingVertical: 9 },
  presetChipText: { fontSize: 11.5, fontWeight: "800" },

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

  previewBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  previewBtnText: { fontSize: 14, fontWeight: "700" },
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 0 },
  previewModal: { flex: 1, marginTop: 48 },
  previewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  previewHeadTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  previewCloseBtn: { padding: 4 },
  previewCloseText: { fontSize: 16, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, maxHeight: "70%" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, paddingHorizontal: 4 },
  modalRowText: { fontSize: 15 },
  modalEmpty: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
});
