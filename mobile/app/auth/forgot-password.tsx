import { useMutation } from "@apollo/client/react";
import { Image } from "expo-image";
import logoAsset from "../../assets/logo.png";
import { Link, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REQUEST_PASSWORD_RESET } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { useTheme } from "../../context/ThemeContext";

type ResetData = { requestPasswordReset: boolean };

export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [resetMut, { loading }] = useMutation<ResetData>(REQUEST_PASSWORD_RESET);

  const trimmedEmail = email.trim().toLowerCase();
  const verifyHref = trimmedEmail
    ? `/auth/verify-email?email=${encodeURIComponent(trimmedEmail)}`
    : "/auth/verify-email";

  async function handleSubmit() {
    setError(null);
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    try {
      await resetMut({ variables: { email: trimmedEmail } });
      setSent(true);
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  if (sent) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <Image source={logoAsset} style={styles.logo} contentFit="contain" />
        <Text style={[styles.title, { color: colors.text }]}>Check your email</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>
          If an account exists for{" "}
          <Text style={{ color: colors.accent, fontWeight: "700" }}>{trimmedEmail}</Text>
          , we sent a reset link. Tap it to choose a new password.
        </Text>
        <View style={[styles.callout, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.calloutText, { color: colors.subtext }]}>
            If you never verified your email, completing the reset also confirms your account.
          </Text>
        </View>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent }]}
          onPress={() => router.replace("/auth/login")}
        >
          <Text style={styles.btnText}>Back to login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image source={logoAsset} style={styles.logo} contentFit="contain" />
          <Text style={[styles.title, { color: colors.text }]}>Forgot password?</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            Enter your account email and we&apos;ll send a secure reset link.
          </Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.callout, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[styles.calloutText, { color: colors.subtext }]}>
              Email sign-in only. Google accounts should use Continue with Google on the login screen.
            </Text>
          </View>

          <Text style={[styles.label, { color: colors.subtext }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }, loading && styles.btnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send reset link</Text>}
          </Pressable>
        </View>

        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.backText, { color: colors.muted }]}>← Back to login</Text>
        </Pressable>
        <Link href={verifyHref} style={styles.verifyLink}>
          <Text style={[styles.verifyText, { color: colors.accent }]}>Have a verification code instead?</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 16 },
  container: { paddingHorizontal: 24, gap: 16 },
  header: { alignItems: "center", marginBottom: 8, gap: 8 },
  logo: { width: 90, height: 78 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  form: { borderRadius: 20, padding: 20, gap: 10, borderWidth: 1 },
  callout: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calloutText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  error: { color: "#f87171", fontSize: 13, textAlign: "center" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", marginTop: 8 },
  backText: { fontSize: 13 },
  verifyLink: { alignItems: "center", marginTop: 4 },
  verifyText: { fontSize: 13, fontWeight: "600" },
});
