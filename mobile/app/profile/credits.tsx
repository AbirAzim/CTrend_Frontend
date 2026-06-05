import { router, Stack } from "expo-router";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  APP_NAME,
  COMPANY_NAME,
  KEJITBE_DEVELOPERS,
  KEJITBE_PRODUCERS,
  LEGAL_PAGE_URLS,
  PRIMARY_CONTACT_EMAIL,
} from "@ctrend/shared/lib/teamCredits";
import { useTheme } from "../../context/ThemeContext";

function openUrl(url: string) {
  void Linking.openURL(url);
}

function openEmail(email: string) {
  void Linking.openURL(`mailto:${email}`);
}

function MemberCard({
  name,
  role,
  email,
  colors,
}: {
  name: string;
  role: string;
  email: string;
  colors: { card: string; border: string; text: string; subtext: string; accent: string };
}) {
  return (
    <View style={[st.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.name, { color: colors.text }]}>{name}</Text>
      <Text style={[st.role, { color: colors.subtext }]}>{role}</Text>
      <Pressable onPress={() => openEmail(email)}>
        <Text style={[st.email, { color: colors.accent }]}>{email}</Text>
      </Pressable>
    </View>
  );
}

export default function CreditsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[st.root, { backgroundColor: colors.section }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          st.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={st.backBtn}>
          <Text style={[st.backText, { color: colors.accent }]}>← Back</Text>
        </Pressable>
        <Text style={[st.headerTitle, { color: colors.text }]}>Credits & legal</Text>
        <View style={st.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[st.lead, { color: colors.muted }]}>
          {COMPANY_NAME} · Privacy, terms, and support for {APP_NAME}.
        </Text>

        <Text style={[st.sectionLabel, { color: colors.muted }]}>LEGAL</Text>
        <View style={[st.legalBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable style={st.legalRow} onPress={() => openUrl(LEGAL_PAGE_URLS.privacy)}>
            <View style={st.legalRowText}>
              <Text style={[st.legalTitle, { color: colors.text }]}>Privacy Policy</Text>
              <Text style={[st.legalHint, { color: colors.muted }]}>How we handle your data</Text>
            </View>
            <Text style={[st.legalArrow, { color: colors.accent }]}>↗</Text>
          </Pressable>
          <View style={[st.legalDivider, { backgroundColor: colors.border }]} />
          <Pressable style={st.legalRow} onPress={() => openUrl(LEGAL_PAGE_URLS.terms)}>
            <View style={st.legalRowText}>
              <Text style={[st.legalTitle, { color: colors.text }]}>Terms of Service</Text>
              <Text style={[st.legalHint, { color: colors.muted }]}>Rules for using the app</Text>
            </View>
            <Text style={[st.legalArrow, { color: colors.accent }]}>↗</Text>
          </Pressable>
        </View>

        <Text style={[st.sectionLabel, { color: colors.muted }]}>SUPPORT</Text>
        <View style={[st.supportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[st.supportText, { color: colors.subtext }]}>
            Questions, account help, or data requests?
          </Text>
          <Pressable onPress={() => openEmail(PRIMARY_CONTACT_EMAIL)}>
            <Text style={[st.supportEmail, { color: colors.accent }]}>{PRIMARY_CONTACT_EMAIL}</Text>
          </Pressable>
        </View>

        <View style={st.teamFooter}>
          <View style={[st.teamDivider, { backgroundColor: colors.border }]} />
          <Text style={[st.teamHeading, { color: colors.text }]}>Credits</Text>
          <Text style={[st.teamIntro, { color: colors.muted }]}>
            Thank you to everyone who helped build and produce {APP_NAME}.
          </Text>

          <Text style={[st.teamSubLabel, { color: colors.muted }]}>PRODUCERS</Text>
          {KEJITBE_PRODUCERS.map((member) => (
            <MemberCard
              key={member.id}
              name={member.name}
              role="Producer"
              email={member.email}
              colors={colors}
            />
          ))}

          <Text style={[st.teamSubLabel, { color: colors.muted, marginTop: 8 }]}>DEVELOPERS</Text>
          {KEJITBE_DEVELOPERS.map((member) => (
            <MemberCard
              key={member.id}
              name={member.name}
              role="Developer"
              email={member.email}
              colors={colors}
            />
          ))}
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
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { minWidth: 64 },
  backText: { fontSize: 15, fontWeight: "700" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "800" },
  headerSpacer: { minWidth: 64 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  legalBlock: { borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 22 },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  legalRowText: { flex: 1, gap: 2 },
  legalTitle: { fontSize: 15, fontWeight: "700" },
  legalHint: { fontSize: 12, lineHeight: 16 },
  legalArrow: { fontSize: 18, fontWeight: "700" },
  legalDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  supportCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    marginBottom: 8,
  },
  supportText: { fontSize: 14, lineHeight: 20 },
  supportEmail: { fontSize: 14, fontWeight: "700" },
  teamFooter: { marginTop: 28, paddingTop: 4 },
  teamDivider: { height: StyleSheet.hairlineWidth, marginBottom: 20, opacity: 0.7 },
  teamHeading: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  teamIntro: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  teamSubLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 2,
    opacity: 0.95,
  },
  name: { fontSize: 15, fontWeight: "800" },
  role: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  email: { fontSize: 13, fontWeight: "600", marginTop: 2 },
});
