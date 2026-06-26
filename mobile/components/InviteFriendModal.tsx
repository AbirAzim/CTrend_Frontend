import { useMutation } from "@apollo/client/react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { INVITE_USER, PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { useQuery } from "@apollo/client/react";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import {
  INVITE_MODAL_SUBTITLE,
  INVITE_MODAL_SUBTITLE_NO_POINTS,
  INVITE_MODAL_TIPS,
  INVITE_MODAL_TIPS_NO_POINTS,
  inviteModalDescription,
  inviteModalDescriptionNoPoints,
} from "@ctrend/shared/lib/referralInvite";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useTheme } from "../context/ThemeContext";

function useKeyboardHeight(active: boolean) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!active) {
      setHeight(0);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [active]);
  return height;
}

export function InviteFriendModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight(visible);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [invite, { loading }] = useMutation<{ inviteUser: boolean }>(INVITE_USER);
  const { data: settingsData } = useQuery<{ platformSettings: { referralSystemEnabled: boolean } }>(
    PLATFORM_SETTINGS,
    { fetchPolicy: "cache-first", skip: !visible },
  );
  const pointsEnabled = Boolean(settingsData?.platformSettings?.referralSystemEnabled);

  useEffect(() => {
    if (!visible) {
      setSent(false);
      setMsg(null);
      setEmail("");
    }
  }, [visible]);

  function handleClose() {
    Keyboard.dismiss();
    setEmail("");
    setMsg(null);
    setSent(false);
    onClose();
  }

  async function handleSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || loading) return;
    setMsg(null);
    try {
      await invite({ variables: { email: trimmed } });
      setSent(true);
      setMsg(`Invitation sent to ${trimmed}`);
      setEmail("");
      Keyboard.dismiss();
    } catch (err) {
      setSent(false);
      setMsg(getApolloErrorMessage(err));
    }
  }

  const sheetBottom = kbHeight > 0 ? kbHeight + 8 : Math.max(insets.bottom, 12);
  const canSend = Boolean(email.trim()) && !loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Parent Pressable = dim overlay; tap empty area above the sheet to close */}
      <Pressable style={st.root} onPress={handleClose} accessibilityLabel="Close invite panel">
        <Pressable
          style={[st.sheet, { paddingBottom: sheetBottom, backgroundColor: colors.card }]}
          onPress={() => {}}
        >
          <View style={[st.handle, { backgroundColor: colors.border }]} />
          <View style={st.headerRow}>
            <View style={st.headerTextCol}>
              <Text style={[st.title, { color: colors.text }]}>Invite a friend</Text>
              <Text style={[st.sub, { color: colors.subtext }]}>
                {pointsEnabled ? INVITE_MODAL_SUBTITLE : INVITE_MODAL_SUBTITLE_NO_POINTS}
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={[st.closeBtn, { backgroundColor: colors.section }]}
              accessibilityLabel="Close"
            >
              <Text style={[st.closeBtnText, { color: colors.subtext }]}>✕</Text>
            </Pressable>
          </View>

          {pointsEnabled ? (
            <View style={st.rewardRow}>
              <View style={[st.rewardPill, { backgroundColor: colors.accent + "18", borderColor: colors.accent + "40" }]}>
                <Text style={[st.rewardPillText, { color: colors.accent }]}>
                  You +{COIN_AMOUNTS.INVITE} points
                </Text>
              </View>
              <View style={[st.rewardPill, { backgroundColor: "#22c55e18", borderColor: "#22c55e40" }]}>
                <Text style={[st.rewardPillText, { color: "#22c55e" }]}>
                  Friend +{COIN_AMOUNTS.REFERRAL_INVITEE} points
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[st.infoBox, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={[st.infoText, { color: colors.subtext }]}>
              {pointsEnabled ? inviteModalDescription() : inviteModalDescriptionNoPoints()}
            </Text>
            <View style={st.tipList}>
              {(pointsEnabled ? INVITE_MODAL_TIPS : INVITE_MODAL_TIPS_NO_POINTS).map((tip) => (
                <View key={tip} style={st.tipRow}>
                  <Text style={[st.tipDot, { color: colors.accent }]}>•</Text>
                  <Text style={[st.tipText, { color: colors.text }]}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={[st.label, { color: colors.subtext }]}>Friend&apos;s email</Text>
          <TextInput
            style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={email}
            onChangeText={(v) => {
              setSent(false);
              setEmail(v);
            }}
            placeholder="friend@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void handleSend()}
          />

          {msg ? (
            <View style={[st.msgBox, sent ? st.msgBoxOk : st.msgBoxErr]}>
              <Text style={[st.msg, { color: sent ? "#166534" : "#b91c1c" }]}>{msg}</Text>
            </View>
          ) : null}

          <Pressable
            style={[st.btnPrimary, { backgroundColor: colors.accent }, !canSend && { opacity: 0.45 }]}
            onPressIn={() => void handleSend()}
            disabled={!canSend}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={st.btnPrimaryText}>{sent ? "Send another" : "Send invite"}</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTextCol: { flex: 1, gap: 2 },
  title: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 13, lineHeight: 18 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontSize: 16, fontWeight: "600" },
  rewardRow: { flexDirection: "row", gap: 8 },
  rewardPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  rewardPillText: { fontSize: 12, fontWeight: "700" },
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  infoText: { fontSize: 13, lineHeight: 19 },
  tipList: { gap: 6 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipDot: { fontSize: 14, fontWeight: "800", lineHeight: 18 },
  tipText: { flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  msgBox: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  msgBoxOk: { backgroundColor: "rgba(34,197,94,0.12)" },
  msgBoxErr: { backgroundColor: "rgba(239,68,68,0.1)" },
  msg: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  btnPrimary: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 2,
    marginBottom: 4,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
