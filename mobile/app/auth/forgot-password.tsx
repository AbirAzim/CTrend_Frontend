import { useMutation } from "@apollo/client/react";
import { Image } from "expo-image";
import logoAsset from "../../assets/logo.png";
import { router } from "expo-router";
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

  async function handleSubmit() {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e) { setError("Email is required."); return; }
    try {
      await resetMut({ variables: { email: e } });
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
          <Text style={{ color: colors.accent, fontWeight: "700" }}>{email}</Text>
          , we've sent reset instructions.{"\n\n"}
          Tap the link in the email to set a new password.
        </Text>
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
          <Text style={[styles.title, { color: colors.text }]}>Reset password</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            Enter your email and we'll send a reset link.
          </Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
  form: { borderRadius: 20, padding: 20, gap: 8, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  error: { color: "#f87171", fontSize: 13, textAlign: "center" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", marginTop: 8 },
  backText: { fontSize: 13 },
});
