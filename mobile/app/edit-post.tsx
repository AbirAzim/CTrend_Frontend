import { useMutation, useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GET_POST_BY_ID, UPDATE_POST, CATEGORIES } from "@ctrend/shared/graphql/feed";
import { mapGqlPostToFeedView } from "@ctrend/shared/lib/mapGqlPostToFeedView";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useTheme } from "../context/ThemeContext";

type Category = { id: string; name?: string | null };
type CategoriesData = { categories: Category[] };
type PostData = { getPostById: unknown };

export default function EditPostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: postData, loading: postLoading } = useQuery<PostData>(GET_POST_BY_ID, {
    variables: { id: postId },
    skip: !postId,
    fetchPolicy: "network-only",
  });

  const { data: catData } = useQuery<CategoriesData>(CATEGORIES, { fetchPolicy: "cache-first" });
  const categories = catData?.categories ?? [];

  const [caption, setCaption] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [options, setOptions] = useState<Array<{ label: string; imageUrl: string }>>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-fill form when post loads
  useEffect(() => {
    if (!postData?.getPostById || initialized) return;
    const post = mapGqlPostToFeedView(postData.getPostById as Parameters<typeof mapGqlPostToFeedView>[0]);
    setCaption(post.caption ?? "");
    setOptions(
      post.imageUrls.map((url, i) => ({
        imageUrl: url,
        label: post.postOptions?.[i]?.label ?? "",
      })),
    );
    // Try to match category by checking the raw data
    const raw = postData.getPostById as Record<string, unknown>;
    const cat = raw.category as { id: string } | null | undefined;
    if (cat?.id) setCategoryId(cat.id);
    setInitialized(true);
  }, [postData, initialized]);

  const [updatePost, { loading: saving }] = useMutation(UPDATE_POST);

  async function handleSave() {
    setSubmitError(null);
    if (!categoryId) { setSubmitError("Please select a category."); return; }
    try {
      await updatePost({
        variables: {
          postId,
          input: {
            caption: caption.trim() || undefined,
            categoryId,
            options: options.map((o) => ({ label: o.label, imageUrl: o.imageUrl })),
            imageUrls: options.map((o) => o.imageUrl),
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
          <Text style={[st.screenTitle, { color: colors.text }]}>Edit Post</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Options (images + labels) */}
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.cardLabel, { color: colors.subtext }]}>COMPARE OPTIONS</Text>
          {options.map((opt, i) => (
            <View key={i} style={[st.optionRow, { borderTopColor: colors.border }]}>
              <View style={[st.optionThumb, { backgroundColor: colors.section, overflow: "hidden" }]}>
                {opt.imageUrl ? (
                  <Image source={{ uri: opt.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <Text style={{ fontSize: 20, color: colors.muted }}>🖼</Text>
                )}
              </View>
              <TextInput
                style={[st.optionLabel, { backgroundColor: colors.section, borderColor: colors.border, color: colors.text }]}
                value={opt.label}
                onChangeText={(v) => setOptions((prev) => prev.map((o, j) => j === i ? { ...o, label: v } : o))}
                placeholder={`Label ${String.fromCharCode(65 + i)}`}
                placeholderTextColor={colors.muted}
                maxLength={60}
              />
            </View>
          ))}
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
              placeholder="What are you comparing?"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              maxLength={300}
            />
          </View>
        </View>

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
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  optionThumb: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionLabel: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  rowKey: { fontSize: 14, fontWeight: "600" },
  rowVal: { fontSize: 14 },
  captionInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 60, textAlignVertical: "top" },
  errorBanner: { borderRadius: 10, padding: 12 },
  saveBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 16, maxHeight: "70%" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, paddingHorizontal: 4 },
  modalRowText: { fontSize: 15 },
});
