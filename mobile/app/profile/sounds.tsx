import { router, Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useSounds } from "../../context/SoundContext";
import {
  SOUND_CATEGORIES,
  SOUND_CATEGORY_META,
  SOUND_PRESETS_BY_CATEGORY,
  type SoundCategory,
  type VoteSoundId,
  type NotificationSoundId,
  type MessageSoundId,
} from "../../lib/soundPresets";

export default function SoundPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    preferences,
    setSoundPreference,
    savingPreference,
    previewSound,
    setVibrationEnabled,
  } = useSounds();

  const [activeCategory, setActiveCategory] = useState<SoundCategory>("vote");
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const presets = SOUND_PRESETS_BY_CATEGORY[activeCategory];
  const categoryMeta = SOUND_CATEGORY_META[activeCategory];

  const selectedId =
    activeCategory === "vote" ? preferences.voteSoundId :
    activeCategory === "notification" ? preferences.notificationSoundId :
    preferences.messageSoundId;

  function handlePreview(id: string) {
    setPreviewingId(id);
    previewSound(id);
    setTimeout(() => setPreviewingId(null), 600);
  }

  async function handleSelect(id: string) {
    if (activeCategory === "vote" && id === selectedId) return;
    if (activeCategory === "notification" && id === selectedId) return;
    if (activeCategory === "message" && id === selectedId) return;

    handlePreview(id);

    if (activeCategory === "vote") {
      await setSoundPreference("vote", id as VoteSoundId);
    } else if (activeCategory === "notification") {
      await setSoundPreference("notification", id as NotificationSoundId);
    } else {
      await setSoundPreference("message", id as MessageSoundId);
    }

    const label = presets.find((p) => p.id === id)?.label ?? id;
    setSavedHint(`${categoryMeta.title} sound set to "${label}".`);
    setTimeout(() => setSavedHint(null), 2600);
  }

  return (
    <View style={[st.root, { backgroundColor: colors.section }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={st.backBtn}>
          <Text style={[st.backText, { color: colors.accent }]}>← Back</Text>
        </Pressable>
        <View style={st.headerTitleWrap}>
          <Text style={[st.headerTitle, { color: colors.text }]}>🔊  App sounds</Text>
        </View>
        {savingPreference ? (
          <ActivityIndicator size="small" color={colors.accent} style={st.savingIndicator} />
        ) : (
          <View style={st.savingIndicator} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Lead text */}
        <Text style={[st.lead, { color: colors.muted }]}>
          Choose sounds for votes, notifications, and messages. Saved on this device.
        </Text>

        {/* Vibration toggle */}
        <View style={[st.vibrationRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.vibrationTitle, { color: colors.text }]}>📳  Vibration</Text>
            <Text style={[st.vibrationHint, { color: colors.muted }]}>
              {activeCategory === "vote"
                ? "Vibrate when you vote (default with Silent). Also applies to notifications & messages."
                : "Vibrate when you vote, and on notifications & messages."}
            </Text>
          </View>
          <Switch
            value={preferences.vibrationEnabled}
            onValueChange={(v) => void setVibrationEnabled(v)}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>

        {/* Category tabs */}
        <View style={[st.tabRow, { borderBottomColor: colors.border }]}>
          {SOUND_CATEGORIES.map((cat) => {
            const m = SOUND_CATEGORY_META[cat];
            const active = activeCategory === cat;
            return (
              <Pressable
                key={cat}
                style={[st.tabBtn, active && [st.tabBtnActive, { borderBottomColor: colors.accent }]]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[st.tabText, { color: active ? colors.accent : colors.muted }]}>
                  {m.emoji} {m.title}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hint text */}
        <Text style={[st.hint, { color: colors.muted }]}>{categoryMeta.hint}</Text>

        {/* Saved toast */}
        {savedHint ? (
          <View style={[st.toast, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={[st.toastText, { color: "#22c55e" }]}>✓ {savedHint}</Text>
          </View>
        ) : null}

        {/* Preset cards */}
        <View style={st.grid}>
          {presets.map((preset) => {
            const isActive = selectedId === preset.id;
            const isPreviewing = previewingId === preset.id;
            return (
              <Pressable
                key={preset.id}
                style={[
                  st.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isActive ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => void handleSelect(preset.id)}
              >
                <View style={st.cardLeft}>
                  <Text style={st.cardEmoji}>{preset.emoji}</Text>
                  <View style={st.cardCopy}>
                    <View style={st.cardHeadRow}>
                      <Text style={[st.cardName, { color: colors.text }]}>{preset.label}</Text>
                      {isActive ? (
                        <View style={[st.activeBadge, { backgroundColor: colors.accent }]}>
                          <Text style={st.activeBadgeText}>Active</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[st.cardDesc, { color: colors.muted }]}>{preset.description}</Text>
                    <Text style={[st.cardDuration, { color: colors.muted }]}>{preset.duration}</Text>
                  </View>
                </View>
                {preset.id !== "silent" ? (
                  <Pressable
                    style={[st.previewBtn, { borderColor: colors.accent, opacity: isPreviewing ? 0.5 : 1 }]}
                    onPress={(e) => { e.stopPropagation?.(); handlePreview(preset.id); }}
                    hitSlop={6}
                  >
                    <Text style={[st.previewBtnText, { color: colors.accent }]}>
                      {isPreviewing ? "▶" : "▶ Preview"}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { paddingRight: 12 },
  backText: { fontSize: 15, fontWeight: "600" },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  savingIndicator: { width: 20 },
  lead: { fontSize: 13, marginHorizontal: 16, marginTop: 14, marginBottom: 8, lineHeight: 18 },
  vibrationRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  vibrationTitle: { fontSize: 14, fontWeight: "700" },
  vibrationHint: { fontSize: 12, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: "600" },
  hint: { fontSize: 12, marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  toast: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  toastText: { fontSize: 13, fontWeight: "600" },
  grid: { paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  cardEmoji: { fontSize: 22, marginRight: 10 },
  cardCopy: { flex: 1 },
  cardHeadRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardName: { fontSize: 14, fontWeight: "700" },
  activeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  activeBadgeText: { fontSize: 10, color: "#fff", fontWeight: "700" },
  cardDesc: { fontSize: 12, marginTop: 2 },
  cardDuration: { fontSize: 11, marginTop: 1 },
  previewBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  previewBtnText: { fontSize: 12, fontWeight: "600" },
});
