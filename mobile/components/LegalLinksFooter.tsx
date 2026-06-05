import { LEGAL_PAGE_URLS } from "@ctrend/shared/lib/teamCredits";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

function openUrl(url: string) {
  void Linking.openURL(url);
}

export function LegalLinksFooter() {
  const { colors } = useTheme();

  return (
    <View style={st.wrap}>
      <Text style={[st.text, { color: colors.muted }]}>
        By using Ke Jitbe you agree to our{" "}
        <Text style={[st.link, { color: colors.accent }]} onPress={() => openUrl(LEGAL_PAGE_URLS.terms)}>
          Terms
        </Text>{" "}
        and{" "}
        <Text style={[st.link, { color: colors.accent }]} onPress={() => openUrl(LEGAL_PAGE_URLS.privacy)}>
          Privacy Policy
        </Text>
        .
      </Text>
      <Pressable onPress={() => openUrl(LEGAL_PAGE_URLS.credits)}>
        <Text style={[st.creditsLink, { color: colors.subtext }]}>Credits & team →</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 16, alignItems: "center", gap: 8, paddingHorizontal: 8 },
  text: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  link: { fontWeight: "700" },
  creditsLink: { fontSize: 12, fontWeight: "600" },
});
