import { useMutation } from "@apollo/client/react";
import { Image } from "expo-image";
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
import { SIGNUP } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { AuthDivider, GoogleSignInButton } from "../../components/GoogleSignInButton";
import { useTheme } from "../../context/ThemeContext";

type SignupData = { signup: boolean };

export default function SignupScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [signupMut, { loading }] = useMutation<SignupData>(SIGNUP);

  async function handleSignup() {
    setError(null);
    const e = email.trim().toLowerCase();
    const n = displayName.trim();
    if (!e || !password) { setError("Email and password are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    try {
      await signupMut({ variables: { email: e, password, displayName: n || undefined } });
      router.push({ pathname: "/auth/verify-email", params: { email: e } });
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image source={require("../../assets/logo.png")} style={styles.logoImg} contentFit="contain" />
          <Text style={[styles.tagline, { color: colors.subtext }]}>Compare · vote · vibe</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Create account</Text>
          <View style={styles.formSubRow}>
            <Text style={[styles.formSubText, { color: colors.subtext }]}>Already have one? </Text>
            <Link href="/auth/login" style={[styles.formSubLink, { color: colors.accent }]}>Log in</Link>
          </View>

          <Text style={[styles.label, { color: colors.subtext }]}>Display name (optional)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
          />

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
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.subtext }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => void handleSignup()}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }, loading && styles.btnDisabled]}
            onPress={() => void handleSignup()}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </Pressable>

          <AuthDivider />
          <GoogleSignInButton onError={setError} disabled={loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 40 },
  header: { alignItems: "center", marginBottom: 32 },
  logoImg: { width: 120, height: 104, marginBottom: 6 },
  tagline: { fontSize: 14, marginTop: 2 },
  form: { borderRadius: 20, padding: 24, gap: 8, borderWidth: 1 },
  formTitle: { fontSize: 26, fontWeight: "800", marginBottom: 2 },
  formSubRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  formSubText: { fontSize: 14 },
  formSubLink: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, marginBottom: 4 },
  error: { color: "#f87171", fontSize: 13, marginBottom: 8, textAlign: "center" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
