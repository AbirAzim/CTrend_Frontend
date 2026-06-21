import { useMutation, useQuery } from "@apollo/client/react";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CAMPAIGNS_ADMIN,
  CREATE_CAMPAIGN,
  TOGGLE_CAMPAIGN,
  UPDATE_CAMPAIGN,
} from "@ctrend/shared/graphql/campaigns";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

type Campaign = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  bannerText?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isActive: boolean;
  isDefault?: boolean | null;
  isPublic?: boolean | null;
  prizePerWinner?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
};

type CampaignsData = { campaigns: Campaign[] };

const EMPTY_FORM = {
  name: "",
  slug: "",
  description: "",
  bannerText: "",
  ctaLabel: "",
  ctaUrl: "",
  prizePerWinner: "",
};

export default function CampaignsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isDefaultForm, setIsDefaultForm] = useState(false);
  const [isPublicForm, setIsPublicForm] = useState(false);

  const { data, loading, refetch } = useQuery<CampaignsData>(CAMPAIGNS_ADMIN, {
    fetchPolicy: "cache-and-network",
  });

  const [toggleMut] = useMutation(TOGGLE_CAMPAIGN);
  const [createMut, { loading: creating }] = useMutation(CREATE_CAMPAIGN);
  const [updateMut, { loading: updating }] = useMutation(UPDATE_CAMPAIGN);

  const campaigns = data?.campaigns ?? [];

  async function handleToggle(c: Campaign) {
    try {
      await toggleMut({ variables: { id: c.id, isActive: !c.isActive } });
      void refetch();
    } catch { showToast("Failed to toggle campaign", "error"); }
  }

  // Toggle whether normal users can attach this campaign to their posts.
  async function handleTogglePublic(c: Campaign) {
    try {
      await updateMut({ variables: { id: c.id, input: { isPublic: !c.isPublic } } });
      showToast(!c.isPublic ? "Enabled for users" : "Now admin-only", "success");
      void refetch();
    } catch { showToast("Failed to update", "error"); }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setIsDefaultForm(false);
    setIsPublicForm(false);
    setEditTarget(null);
    setCreateModal(true);
  }

  function openEdit(c: Campaign) {
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      bannerText: c.bannerText ?? "",
      ctaLabel: c.ctaLabel ?? "",
      ctaUrl: c.ctaUrl ?? "",
      prizePerWinner: c.prizePerWinner != null ? String(c.prizePerWinner) : "",
    });
    setIsDefaultForm(!!c.isDefault);
    setIsPublicForm(!!c.isPublic);
    setEditTarget(c);
    setCreateModal(true);
  }

  async function handleSubmit() {
    if (!form.name.trim() || !form.slug.trim()) {
      showToast("Name and slug are required", "error");
      return;
    }
    const input = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim() || undefined,
      bannerText: form.bannerText.trim() || undefined,
      ctaLabel: form.ctaLabel.trim() || undefined,
      ctaUrl: form.ctaUrl.trim() || undefined,
      prizePerWinner: form.prizePerWinner ? Number(form.prizePerWinner) : undefined,
      isDefault: isDefaultForm,
      isPublic: isPublicForm,
    };
    try {
      if (editTarget) {
        await updateMut({ variables: { id: editTarget.id, input } });
        showToast("Campaign updated", "success");
      } else {
        await createMut({ variables: { input } });
        showToast("Campaign created", "success");
      }
      setCreateModal(false);
      void refetch();
    } catch { showToast(editTarget ? "Failed to update" : "Failed to create", "error"); }
  }

  const st = makeStyles(colors);
  const saving = creating || updating;

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Header action */}
      <View style={[st.toolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable style={[st.createBtn, { backgroundColor: colors.accent }]} onPress={openCreate}>
          <Text style={st.createBtnText}>+ New Campaign</Text>
        </Pressable>
      </View>

      {loading && campaigns.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(c) => c.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={
            <Text style={[st.empty, { color: colors.muted }]}>No campaigns yet</Text>
          }
          renderItem={({ item: c }) => (
            <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={st.cardHeader}>
                <View style={st.cardTitles}>
                  <Text style={[st.cardName, { color: colors.text }]}>{c.name}</Text>
                  <Text style={[st.cardSlug, { color: colors.muted }]}>/{c.slug}</Text>
                </View>
                <Switch
                  value={c.isActive}
                  onValueChange={() => void handleToggle(c)}
                  trackColor={{ false: colors.border, true: colors.accent + "88" }}
                  thumbColor={c.isActive ? colors.accent : colors.muted}
                />
              </View>

              {c.bannerText ? (
                <Text style={[st.bannerText, { color: colors.subtext }]} numberOfLines={2}>{c.bannerText}</Text>
              ) : null}

              <View style={st.cardMeta}>
                {c.prizePerWinner != null && (
                  <View style={[st.pill, { backgroundColor: "rgba(34,197,94,0.1)" }]}>
                    <Text style={[st.pillText, { color: "#22c55e" }]}>৳{c.prizePerWinner}/winner</Text>
                  </View>
                )}
                <View style={[st.pill, { backgroundColor: c.isActive ? "rgba(99,102,241,0.1)" : colors.section }]}>
                  <Text style={[st.pillText, { color: c.isActive ? colors.accent : colors.muted }]}>
                    {c.isActive ? "ACTIVE" : "INACTIVE"}
                  </Text>
                </View>
                {c.isDefault && (
                  <View style={[st.pill, { backgroundColor: "rgba(245,158,11,0.14)" }]}>
                    <Text style={[st.pillText, { color: "#d97706" }]}>DEFAULT</Text>
                  </View>
                )}
                <View style={[st.pill, { backgroundColor: c.isPublic ? "rgba(99,102,241,0.12)" : colors.section }]}>
                  <Text style={[st.pillText, { color: c.isPublic ? colors.accent : colors.muted }]}>
                    {c.isPublic ? "USER-ENABLED" : "ADMIN-ONLY"}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[st.editBtn, { borderColor: colors.border, flex: 1 }]} onPress={() => openEdit(c)}>
                  <Text style={[st.editBtnText, { color: colors.accent }]}>Edit</Text>
                </Pressable>
                <Pressable style={[st.editBtn, { borderColor: colors.border, flex: 1 }]} onPress={() => void handleTogglePublic(c)}>
                  <Text style={[st.editBtnText, { color: c.isPublic ? "#ef4444" : "#22c55e" }]}>
                    {c.isPublic ? "Make admin-only" : "Enable for users"}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* Create / Edit modal */}
      <Modal visible={createModal} transparent animationType="slide" onRequestClose={() => setCreateModal(false)}>
        <Pressable style={st.overlay} onPress={() => setCreateModal(false)}>
          <View
            style={[st.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={st.handle} />
            <Text style={[st.sheetTitle, { color: colors.text }]}>
              {editTarget ? "Edit Campaign" : "New Campaign"}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {[
                { key: "name", label: "Name *" },
                { key: "slug", label: "Slug *" },
                { key: "description", label: "Description" },
                { key: "bannerText", label: "Banner text" },
                { key: "ctaLabel", label: "CTA label" },
                { key: "ctaUrl", label: "CTA URL" },
                { key: "prizePerWinner", label: "Prize per winner (number)" },
              ].map(({ key, label }) => (
                <View key={key} style={{ marginBottom: 10 }}>
                  <Text style={[st.fieldLabel, { color: colors.subtext }]}>{label}</Text>
                  <TextInput
                    style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                    placeholder={label}
                    placeholderTextColor={colors.muted}
                    value={form[key as keyof typeof form]}
                    onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
                    autoCapitalize="none"
                    keyboardType={key === "prizePerWinner" ? "numeric" : "default"}
                  />
                </View>
              ))}
              <View style={st.defaultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fieldLabel, { color: colors.text, marginBottom: 2 }]}>Default campaign</Text>
                  <Text style={[st.defaultHint, { color: colors.muted }]}>Shown first on the feed filter. Only one campaign can be default.</Text>
                </View>
                <Switch
                  value={isDefaultForm}
                  onValueChange={setIsDefaultForm}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={isDefaultForm ? colors.accent : colors.muted}
                />
              </View>
              <View style={st.defaultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fieldLabel, { color: colors.text, marginBottom: 2 }]}>Available to users</Text>
                  <Text style={[st.defaultHint, { color: colors.muted }]}>Let normal users attach this campaign to their posts. Off = admin-only. (Public campaigns can’t award monetary prizes.)</Text>
                </View>
                <Switch
                  value={isPublicForm}
                  onValueChange={setIsPublicForm}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={isPublicForm ? colors.accent : colors.muted}
                />
              </View>
            </ScrollView>
            <Pressable
              style={[st.submitBtn, { backgroundColor: colors.accent }, saving && { opacity: 0.6 }]}
              onPress={() => void handleSubmit()}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.submitBtnText}>{editTarget ? "Save Changes" : "Create Campaign"}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    toolbar: { padding: 12, borderBottomWidth: 1 },
    createBtn: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-end" },
    createBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    list: { padding: 12, gap: 10 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
    cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    cardTitles: { flex: 1, gap: 2 },
    cardName: { fontSize: 15, fontWeight: "700" },
    cardSlug: { fontSize: 12 },
    bannerText: { fontSize: 13, lineHeight: 18 },
    cardMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    pillText: { fontSize: 10, fontWeight: "700" },
    editBtn: { alignSelf: "flex-end", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6, marginTop: 4 },
    editBtnText: { fontSize: 13, fontWeight: "700" },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, gap: 10,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 4 },
    sheetTitle: { fontSize: 16, fontWeight: "800", textAlign: "center", marginBottom: 4 },
    fieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
    defaultRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 6 },
    defaultHint: { fontSize: 11, lineHeight: 15 },
    modalInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 4 },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
