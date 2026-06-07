import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PLAY_STORE_CLOSED_TESTING_URL,
  PLAY_STORE_URL,
} from "@ctrend/shared/lib/appUpdate";
import { useTheme } from "../context/ThemeContext";

function openUrl(url: string) {
  void Linking.openURL(url);
}

type Props = {
  visible: boolean;
  installedVersionCode: number;
  minRequiredVersionCode: number;
};

export function ForceUpdateModal({
  visible,
  installedVersionCode,
  minRequiredVersionCode,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => {}}>
      <View
        style={[
          st.root,
          {
            backgroundColor: colors.bg,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={st.emoji} accessibilityLabel="Update required">
            ⬆️
          </Text>
          <Text style={[st.title, { color: colors.text }]}>Update required</Text>
          <Text style={[st.body, { color: colors.subtext }]}>
            A newer version of Ke Jitbe is available. Please update to continue using the app.
          </Text>
          <Text style={[st.meta, { color: colors.muted }]}>
            Your version: {installedVersionCode} · Required: {minRequiredVersionCode}+
          </Text>

          <Pressable
            style={[st.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={() => openUrl(PLAY_STORE_URL)}
          >
            <Text style={st.primaryBtnText}>Update on Google Play</Text>
          </Pressable>

          <Pressable
            style={[st.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => openUrl(PLAY_STORE_CLOSED_TESTING_URL)}
          >
            <Text style={[st.secondaryBtnText, { color: colors.text }]}>
              Closed testing link
            </Text>
            <Text style={[st.secondaryHint, { color: colors.muted }]}>
              For testers on the closed track
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: "stretch",
    gap: 10,
  },
  emoji: {
    fontSize: 40,
    textAlign: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 8,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryHint: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
});
