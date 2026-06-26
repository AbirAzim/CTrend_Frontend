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
import { INVITE_USER } from "@ctrend/shared/graphql/admin";
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
  const keyboardOpen = kbHeight > 0;
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [invite, { loading }] = useMutation<{ inviteUser: boolean }>(INVITE_USER);

  function reset() {
    setEmail("");
    setMsg(null);
  }

  function handleClose() {
    Keyboard.dismiss();
    reset();
    onClose();
  }

  async function handleSend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || loading) return;
    setMsg(null);
    try {
      await invite({ variables: { email: trimmed } });
      setMsg(`Invitation sent to ${trimmed} with a referral code.`);
      setEmail("");
      Keyboard.dismiss();
    } catch (err) {
      setMsg(getApolloErrorMessage(err));
    }
  }

  const sheetBottom = keyboardOpen ? kbHeight + 12 : Math.max(insets.bottom, 16);
  const canSend = Boolean(email.trim()) && !loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={st.root}>
        <Pressable style={st.backdrop} onPress={handleClose} accessibilityLabel="Close invite panel" />
        <View style={[st.sheetWrap, { paddingBottom: sheetBottom }]} pointerEvents="box-none">
          <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[st.title, { color: colors.text }]}>Invite a friend</Text>
            {!keyboardOpen ? (
              <Text style={[st.sub, { color: colors.subtext }]}>
                We&apos;ll email a referral code. You earn 10 coins when they join; they get 5.
              </Text>
            ) : null}
            <Text style={[st.label, { color: colors.subtext }]}>Friend&apos;s email</Text>
            <TextInput
              style={[st.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="friend@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => void handleSend()}
            />
            {msg ? <Text style={[st.msg, { color: colors.text }]}>{msg}</Text> : null}
            <View style={st.actions}>
              <Pressable style={[st.btnGhost, { borderColor: colors.border }]} onPress={handleClose}>
                <Text style={{ color: colors.subtext, fontWeight: "700" }}>Close</Text>
              </Pressable>
              <Pressable
                style={[st.btnPrimary, { backgroundColor: colors.accent }, !canSend && { opacity: 0.5 }]}
                onPressIn={() => void handleSend()}
                disabled={!canSend}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={st.btnPrimaryText}>Send invite</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  title: { fontSize: 18, fontWeight: "800" },
  sub: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  msg: { fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
