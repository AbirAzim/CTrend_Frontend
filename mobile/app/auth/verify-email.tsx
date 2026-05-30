import { useMutation } from "@apollo/client/react";
import { Image } from "expo-image";
import logoAsset from "../../assets/logo.png";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VERIFY_EMAIL, RESEND_VERIFICATION_EMAIL } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import type { StoredUser } from "../../lib/authStorage";

type VerifyData = { verifyEmail: { accessToken: string; user: StoredUser } };
type ResendData = { resendVerificationEmail: boolean };

const CODE_LENGTH = 6;

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { setSession } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  const [verifyMut, { loading }] = useMutation<VerifyData>(VERIFY_EMAIL);
  const [resendMut, { loading: resendLoading }] = useMutation<ResendData>(RESEND_VERIFICATION_EMAIL);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function handleDigitChange(index: number, value: string) {
    // Handle paste: if user pastes 6 digits into any field
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
      if (cleaned.length === CODE_LENGTH) {
        const next = cleaned.split("");
        setDigits(next);
        inputRefs.current[CODE_LENGTH - 1]?.focus();
        void submitCode(next.join(""));
        return;
      }
    }

    const cleaned = value.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);

    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d.length === 1)) {
      void submitCode(next.join(""));
    }
  }

  function handleKeyPress(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const text = await Clipboard.getString();
      const cleaned = text.replace(/\D/g, "").slice(0, CODE_LENGTH);
      if (cleaned.length === CODE_LENGTH) {
        const next = cleaned.split("");
        setDigits(next);
        inputRefs.current[CODE_LENGTH - 1]?.focus();
        void submitCode(cleaned);
      }
    } catch { /* ignore */ }
  }

  async function submitCode(code: string) {
    if (!email || code.length !== CODE_LENGTH) return;
    setError(null);
    try {
      const { data } = await verifyMut({ variables: { email, code } });
      if (!data?.verifyEmail) throw new Error("Verification failed.");
      await setSession(data.verifyEmail.accessToken, data.verifyEmail.user);
      router.replace("/");
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0 || resendLoading) return;
    try {
      await resendMut({ variables: { email } });
      setCooldown(60);
      setError(null);
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  const code = digits.join("");

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Image source={logoAsset} style={styles.logo} contentFit="contain" />

        <Text style={[styles.title, { color: colors.text }]}>Verify your email</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>
          We sent a 6-digit code to{"\n"}
          <Text style={{ color: colors.accent, fontWeight: "700" }}>{email ?? "your email"}</Text>
        </Text>

        {/* Digit inputs */}
        <View style={styles.digitRow}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(r) => { inputRefs.current[i] = r; }}
              style={[
                styles.digitInput,
                {
                  backgroundColor: colors.card,
                  borderColor: d ? colors.accent : colors.border,
                  color: colors.text,
                },
              ]}
              value={d}
              onChangeText={(v) => handleDigitChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              selectTextOnFocus
              autoFocus={i === 0}
            />
          ))}
        </View>

        {/* Paste from clipboard */}
        <Pressable onPress={() => void handlePasteFromClipboard()} style={styles.pasteBtn} hitSlop={8}>
          <Text style={[styles.pasteBtnText, { color: colors.accent }]}>Paste code from clipboard</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Verify button */}
        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent }, (loading || code.length < CODE_LENGTH) && styles.btnDisabled]}
          onPress={() => void submitCode(code)}
          disabled={loading || code.length < CODE_LENGTH}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify →</Text>}
        </Pressable>

        {/* Resend */}
        <View style={styles.resendRow}>
          <Text style={[styles.resendLabel, { color: colors.subtext }]}>Didn't receive it? </Text>
          <Pressable
            onPress={() => void handleResend()}
            disabled={cooldown > 0 || resendLoading}
            hitSlop={8}
          >
            <Text style={[styles.resendLink, { color: cooldown > 0 ? colors.muted : colors.accent }]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace("/auth/signup")} style={styles.backBtn} hitSlop={8}>
          <Text style={[styles.backText, { color: colors.muted }]}>← Back to signup</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 16,
  },
  logo: { width: 100, height: 86, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  digitRow: { flexDirection: "row", gap: 10, marginVertical: 8 },
  digitInput: {
    width: 44,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    fontSize: 24,
    fontWeight: "700",
  },
  pasteBtn: { marginTop: -4 },
  pasteBtnText: { fontSize: 13, fontWeight: "600" },
  error: { color: "#f87171", fontSize: 13, textAlign: "center" },
  btn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  resendRow: { flexDirection: "row", alignItems: "center" },
  resendLabel: { fontSize: 14 },
  resendLink: { fontSize: 14, fontWeight: "700" },
  backBtn: { marginTop: 4 },
  backText: { fontSize: 13 },
});
