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
import { LOGIN } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import type { StoredUser } from "../../lib/authStorage";
import { AuthDivider, GoogleSignInButton } from "../../components/GoogleSignInButton";

type LoginData = { login: { accessToken: string; user: StoredUser } };

export default function LoginScreen() {
  const { setSession } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginMut, { loading }] = useMutation<LoginData>(LOGIN);

  async function handleLogin() {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!e || !password) { setError("Email and password are required."); return; }
    try {
      const { data } = await loginMut({ variables: { email: e, password } });
      if (!data?.login) throw new Error("No response from server.");
      await setSession(data.login.accessToken, data.login.user);
      router.replace("/");
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={logoAsset} style={styles.logoImg} contentFit="contain" />
          <Text style={[styles.tagline, { color: colors.subtext }]}>Compare · vote · vibe</Text>
        </View>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Log in</Text>
          <View style={styles.formSubRow}>
            <Text style={[styles.formSubText, { color: colors.subtext }]}>New here? </Text>
            <Link href="/auth/signup" style={[styles.formSubLink, { color: colors.accent }]}>Create an account</Link>
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
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.subtext }]}>Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => void handleLogin()}
          />

          <View style={styles.forgotRow}>
            <Link href="/auth/forgot-password" style={[styles.forgotLink, { color: colors.accent }]}>Forgot password?</Link>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, { backgroundColor: colors.accent }, loading && styles.btnDisabled]}
            onPress={() => void handleLogin()}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
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
  header: { alignItems: "center", marginBottom: 36 },
  logoImg: { width: 160, height: 138, marginBottom: 6 },
  tagline: { fontSize: 14, marginTop: 2 },
  form: { borderRadius: 20, padding: 24, gap: 8, borderWidth: 1 },
  formTitle: { fontSize: 26, fontWeight: "800", marginBottom: 2 },
  formSubRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  formSubText: { fontSize: 14 },
  formSubLink: { fontSize: 14, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, marginBottom: 4 },
  forgotRow: { alignItems: "flex-end", marginBottom: 4 },
  forgotLink: { fontSize: 13, fontWeight: "600" },
  error: { color: "#f87171", fontSize: 13, marginBottom: 8, textAlign: "center" },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
});
