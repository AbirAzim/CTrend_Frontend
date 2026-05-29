import { useMutation } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
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
import { RESET_PASSWORD } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../../../lib/apolloErrorMessage";
import { useTheme } from "../../../context/ThemeContext";

type ResetData = { resetPassword: boolean };

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [resetMut, { loading }] = useMutation<ResetData>(RESET_PASSWORD);

  async function handleSubmit() {
    setError(null);
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("Invalid or expired reset link.");
      return;
    }
    try {
      await resetMut({ variables: { token, newPassword: password } });
      setDone(true);
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  if (done) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <Image source={require("../../../assets/logo.png")} style={styles.logo} contentFit="contain" />
        <Text style={[styles.doneTitle, { color: colors.text }]}>Password updated!</Text>
        <Text style={[styles.doneSub, { color: colors.subtext }]}>
          Your password has been reset. You can now log in with your new password.
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: colors.accent }]}
          onPress={() => router.replace("/auth/login")}
        >
          <Text style={styles.btnText}>Go to login</Text>
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
          <Image source={require("../../../assets/logo.png")} style={styles.logo} contentFit="contain" />
          <Text style={[styles.title, { color: colors.text }]}>Set new password</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>Choose a strong password for your account.</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.subtext }]}>New password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.subtext }]}>Confirm password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => void handleSubmit()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }, loading && styles.btnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update password</Text>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace("/auth/login")} style={styles.backBtn} hitSlop={8}>
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
  sub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  doneTitle: { fontSize: 24, fontWeight: "800", textAlign: "center" },
  doneSub: { fontSize: 14, textAlign: "center", lineHeight: 22 },
  form: { borderRadius: 20, padding: 20, gap: 8, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, marginBottom: 4 },
  error: { color: "#f87171", fontSize: 13, textAlign: "center" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", marginTop: 8 },
  backText: { fontSize: 13 },
});
