import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES, CREATE_POST, FEED_POSTS } from "@ctrend/shared/graphql/feed";
import { CREATE_SYSTEM_POST } from "@ctrend/shared/graphql/admin";
import { GET_IMAGE_UPLOAD_URL } from "@ctrend/shared/graphql/upload";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────
type Category = { id: string; name?: string | null };
type CategoriesData = { categories: Category[] };
type UploadUrlData = { getImageUploadUrl: { uploadUrl: string; publicUrl: string; key: string } };

type Slot = {
  id: string;
  localUri: string | null;
  publicUrl: string | null;
  uploading: boolean;
  error: string | null;
  label: string;
};

const SLOT_LABELS = ["A", "B", "C", "D"];

const VOTING_PRESETS = [
  { label: "1h", hours: 1 },
  { label: "12h", hours: 12 },
  { label: "1d", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
  { label: "None", hours: null },
];

function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString();
}

function makeSlot(id: string): Slot {
  return { id, localUri: null, publicUrl: null, uploading: false, error: null, label: "" };
}

// ─── Main screen ──────────────────────────────────────────
export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, hydrated, user } = useAuth();
  const { colors } = useTheme();
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const [slots, setSlots] = useState<Slot[]>([makeSlot("1"), makeSlot("2")]);
  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [votingPreset, setVotingPreset] = useState<number | null>(24);
  const [platformWide, setPlatformWide] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const { data: catData, loading: catLoading } = useQuery<CategoriesData>(CATEGORIES, {
    fetchPolicy: "cache-first",
    skip: !isAuthenticated,
  });
  const categories = catData?.categories ?? [];
  const selectedCat = categories.find((c) => c.id === categoryId);

  const [getUploadUrl] = useMutation<UploadUrlData>(GET_IMAGE_UPLOAD_URL);
  const [createPost, { loading: submitting }] = useMutation(CREATE_POST);
  const [createSystemPost, { loading: submittingSystem }] = useMutation(CREATE_SYSTEM_POST);

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  // ─── Slot helpers ─────────────────────────────────────
  function patchSlot(id: string, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    if (slots.length >= 4) return;
    setSlots((prev) => [...prev, makeSlot(String(Date.now()))]);
  }

  function removeSlot(id: string) {
    if (slots.length <= 2) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  // ─── Image pick + upload ──────────────────────────────
  async function pickAndUpload(slotId: string, useCamera: boolean) {
    try {
      // Request permission
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Camera access is required to take photos.");
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission needed", "Gallery access is required to pick images.");
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: true });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const mimeType = asset.mimeType ?? "image/jpeg";
      const ext = mimeType.split("/")[1] ?? "jpg";
      const filename = asset.fileName ?? `photo_${Date.now()}.${ext}`;

      patchSlot(slotId, { localUri: uri, uploading: true, error: null, publicUrl: null });

      // Get presigned S3 URL
      const { data } = await getUploadUrl({ variables: { filename, contentType: mimeType } });
      if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL.");
      const { uploadUrl, publicUrl } = data.getImageUploadUrl;

      // On Android, image picker may return a content:// URI which
      // FileSystem.uploadAsync can't read directly — copy to cache first
      let uploadUri = uri;
      if (Platform.OS === "android" && !uri.startsWith("file://")) {
        const ext = mimeType.split("/")[1] ?? "jpg";
        uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: uploadUri });
      }

      const uploadRes = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": mimeType },
      });
      if (uploadRes.status < 200 || uploadRes.status >= 300) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      patchSlot(slotId, { uploading: false, publicUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      patchSlot(slotId, { uploading: false, error: msg });
    }
  }

  function openImageOptions(slotId: string) {
    const slot = slotsRef.current.find((s) => s.id === slotId);
    const isFilledOrUploading = slot?.localUri || slot?.uploading;

    if (isFilledOrUploading) {
      Alert.alert("Image options", undefined, [
        { text: "Replace from gallery", onPress: () => void pickAndUpload(slotId, false) },
        { text: "Take new photo", onPress: () => void pickAndUpload(slotId, true) },
        { text: "Remove", style: "destructive", onPress: () => patchSlot(slotId, { localUri: null, publicUrl: null, error: null }) },
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

  // ─── Submit ───────────────────────────────────────────
  async function handleSubmit() {
    setSubmitError(null);

    if (!categoryId) { setSubmitError("Please select a category."); return; }

    const readySlots = slots.filter((s) => s.publicUrl);
    if (readySlots.length < 2) { setSubmitError("Upload at least 2 images first."); return; }

    const uploading = slots.some((s) => s.uploading);
    if (uploading) { setSubmitError("Please wait for uploads to finish."); return; }

    const imageUrls = readySlots.map((s) => s.publicUrl as string);
    const options = readySlots.map((s, i) => ({
      label: s.label.trim() || `Option ${SLOT_LABELS[i] ?? i + 1}`,
      imageUrl: s.publicUrl as string,
    }));

    const input: Record<string, unknown> = { categoryId, imageUrls, options };
    if (caption.trim()) { input.caption = caption.trim(); input.contentText = caption.trim(); }
    if (votingPreset !== null) input.votingEndsAt = hoursFromNow(votingPreset);

    try {
      const mutFn = isAdmin && platformWide ? createSystemPost : createPost;
      await mutFn({
        variables: { input },
        refetchQueries: isAdmin && platformWide ? [] : [{ query: FEED_POSTS }],
      });
      router.replace("/tabs");
    } catch (err: unknown) {
      setSubmitError(getApolloErrorMessage(err));
    }
  }

  function confirmCancel() {
    const dirty = slots.some((s) => s.localUri) || caption.trim();
    if (!dirty) { router.back(); return; }
    Alert.alert("Discard post?", "Your draft will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  const isSubmitting = submitting || submittingSystem;

  // ─── Render ───────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.topRow}>
          <Pressable onPress={confirmCancel} hitSlop={10}>
            <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.screenTitle, { color: colors.text }]}>New Compare</Text>
          <View style={{ width: 52 }} />
        </View>

        {/* ── Image grid ── */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.subtext }]}>IMAGES  <Text style={{ color: colors.muted, fontWeight: "400" }}>Select 2–4</Text></Text>

          <View style={styles.slotsGrid}>
            {slots.map((slot, idx) => (
              <View key={slot.id} style={styles.slotOuter}>
                <Pressable
                  style={[styles.slotTile, { backgroundColor: colors.section, borderColor: slot.error ? "#ef4444" : colors.border }]}
                  onPress={() => openImageOptions(slot.id)}
                >
                  {slot.localUri ? (
                    <Image source={{ uri: slot.localUri }} style={styles.slotImg} contentFit="cover" />
                  ) : (
                    <View style={styles.slotEmpty}>
                      <Text style={[styles.slotEmptyPlus, { color: colors.muted }]}>+</Text>
                      <Text style={[styles.slotEmptyText, { color: colors.muted }]}>Add photo</Text>
                    </View>
                  )}

                  {/* Badge */}
                  <View style={[styles.slotBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.slotBadgeText}>{SLOT_LABELS[idx] ?? idx + 1}</Text>
                  </View>

                  {/* Uploading overlay */}
                  {slot.uploading && (
                    <View style={styles.slotOverlay}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.slotOverlayText}>Uploading…</Text>
                    </View>
                  )}

                  {/* Done checkmark */}
                  {slot.publicUrl && !slot.uploading && (
                    <View style={styles.slotDone}>
                      <Text style={styles.slotDoneText}>✓</Text>
                    </View>
                  )}

                  {/* Remove button */}
                  {slots.length > 2 && slot.localUri && !slot.uploading && (
                    <Pressable
                      style={styles.slotRemove}
                      onPress={() => removeSlot(slot.id)}
                      hitSlop={6}
                    >
                      <Text style={styles.slotRemoveText}>✕</Text>
                    </Pressable>
                  )}
                </Pressable>

                {slot.error ? (
                  <Text style={styles.slotError} numberOfLines={1}>{slot.error}</Text>
                ) : null}

                {/* Option label */}
                <TextInput
                  style={[styles.labelInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                  value={slot.label}
                  onChangeText={(v) => patchSlot(slot.id, { label: v })}
                  placeholder={`Label ${SLOT_LABELS[idx] ?? idx + 1} (optional)`}
                  placeholderTextColor={colors.muted}
                  maxLength={40}
                />
              </View>
            ))}
          </View>

          {slots.length < 4 && (
            <Pressable style={[styles.addSlotBtn, { borderColor: colors.border }]} onPress={addSlot}>
              <Text style={[styles.addSlotText, { color: colors.accent }]}>+ Add option</Text>
            </Pressable>
          )}
        </View>

        {/* ── Settings ── */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Category */}
          <Pressable style={[styles.settingsRow, { borderBottomColor: colors.border }]} onPress={() => setCategoryModal(true)}>
            <Text style={[styles.settingsKey, { color: colors.text }]}>Category</Text>
            <View style={styles.settingsRight}>
              <Text style={[styles.settingsVal, { color: selectedCat ? colors.text : colors.muted }]}>
                {catLoading ? "Loading…" : selectedCat?.name?.trim() || "Pick one"}
              </Text>
              <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
            </View>
          </Pressable>

          {/* Caption */}
          <View style={[styles.settingsColRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.settingsKey, { color: colors.text }]}>
              Caption  <Text style={[styles.optional, { color: colors.muted }]}>optional</Text>
            </Text>
            <TextInput
              style={[styles.captionInput, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
              value={caption}
              onChangeText={setCaption}
              placeholder="What are you comparing?"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              maxLength={300}
            />
          </View>

          {/* Voting duration */}
          <View style={[styles.settingsColRow, isAdmin ? { borderBottomColor: colors.border } : {}]}>
            <Text style={[styles.settingsKey, { color: colors.text }]}>
              Voting ends  <Text style={[styles.optional, { color: colors.muted }]}>optional</Text>
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
              {VOTING_PRESETS.map((p) => {
                const active = votingPreset === p.hours;
                return (
                  <Pressable
                    key={p.label}
                    style={[styles.chip, { backgroundColor: active ? colors.accent : colors.section, borderColor: active ? colors.accent : colors.border }]}
                    onPress={() => setVotingPreset(p.hours)}
                  >
                    <Text style={[styles.chipText, { color: active ? "#fff" : colors.subtext }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Admin: platform-wide toggle */}
          {isAdmin && (
            <View style={styles.settingsRow}>
              <View style={styles.settingsKeyCol}>
                <Text style={[styles.settingsKey, { color: colors.text }]}>Platform-wide</Text>
                <Text style={[styles.settingsHint, { color: colors.muted }]}>Visible to all users</Text>
              </View>
              <Switch
                value={platformWide}
                onValueChange={setPlatformWide}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>
          )}
        </View>

        {/* ── Error ── */}
        {submitError ? (
          <View style={[styles.errorBanner, { backgroundColor: "#450a0a" }]}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        ) : null}

        {/* ── Submit ── */}
        <Pressable
          style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.btnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={isSubmitting}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.submitText}>
              {isAdmin && platformWide ? "Launch platform-wide →" : "Launch it →"}
            </Text>
          )}
        </Pressable>
      </ScrollView>

      {/* ── Category modal ── */}
      <Modal
        visible={categoryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModal(false)}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.modalTitle, { color: colors.text }]}>Select category</Text>
            <ScrollView>
              {categories.map((cat) => {
                const active = cat.id === categoryId;
                return (
                  <Pressable
                    key={cat.id}
                    style={[styles.modalRow, { borderBottomColor: colors.border }, active && { backgroundColor: colors.section }]}
                    onPress={() => { setCategoryId(cat.id); setCategoryModal(false); }}
                  >
                    <Text style={[styles.modalRowText, { color: colors.text }, active && { color: colors.accent, fontWeight: "700" }]}>
                      {cat.name?.trim() || cat.id}
                    </Text>
                    {active && <Text style={[styles.modalCheck, { color: colors.accent }]}>✓</Text>}
                  </Pressable>
                );
              })}
              {categories.length === 0 && !catLoading && (
                <Text style={[styles.modalEmpty, { color: colors.muted }]}>No categories available.</Text>
              )}
              {catLoading && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.accent} />}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────
const SLOT_SIZE = 160;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  cancelText: { fontSize: 15, fontWeight: "600", width: 52 },
  screenTitle: { fontSize: 17, fontWeight: "800" },

  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  slotOuter: {
    width: SLOT_SIZE,
    gap: 6,
  },
  slotTile: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  slotImg: { width: "100%", height: "100%" },
  slotEmpty: { alignItems: "center", gap: 4 },
  slotEmptyPlus: { fontSize: 32, fontWeight: "300" },
  slotEmptyText: { fontSize: 12 },
  slotBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  slotBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  slotOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  slotOverlayText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  slotDone: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
  },
  slotDoneText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  slotRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  slotRemoveText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  slotError: { color: "#f87171", fontSize: 10, textAlign: "center" },
  labelInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 12,
    width: SLOT_SIZE,
  },

  addSlotBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  addSlotText: { fontSize: 14, fontWeight: "700" },

  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  settingsColRow: {
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  settingsKeyCol: { flex: 1 },
  settingsKey: { fontSize: 14, fontWeight: "600" },
  settingsHint: { fontSize: 11, marginTop: 2 },
  settingsRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  settingsVal: { fontSize: 14 },
  chevron: { fontSize: 20 },
  optional: { fontSize: 12, fontWeight: "400" },
  captionInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  presetsScroll: { marginTop: 2 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "600" },

  errorBanner: { borderRadius: 10, padding: 12 },
  errorText: { color: "#fca5a5", fontSize: 14 },

  submitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  btnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: "70%",
  },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  modalRowText: { fontSize: 15 },
  modalCheck: { fontSize: 16, fontWeight: "700" },
  modalEmpty: { fontSize: 14, textAlign: "center", paddingVertical: 20 },
});
