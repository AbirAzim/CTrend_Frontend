import { useMutation, useQuery } from "@apollo/client/react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SIGNUP } from "@ctrend/shared/graphql/auth";
import { INVITATION_SIGNUP_INFO } from "@ctrend/shared/graphql/referrals";
import { AuthFormCard, AuthScreenLayout } from "../../components/AuthScreenLayout";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { AuthDivider, GoogleSignInButton } from "../../components/GoogleSignInButton";
import { LegalLinksFooter } from "../../components/LegalLinksFooter";
import { PasswordInput } from "../../components/PasswordInput";
import { useTheme } from "../../context/ThemeContext";

type SignupData = { signup: boolean };

export default function SignupScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string; referralCode?: string; token?: string }>();
  const inviteToken = typeof params.token === "string" ? params.token : undefined;
  const [email, setEmail] = useState(() => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""));
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(() =>
    typeof params.referralCode === "string" ? params.referralCode.trim().toUpperCase() : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState(() => Boolean(params.email));

  const { data: inviteInfo, loading: loadingInvite, error: inviteError } = useQuery<{
    invitationSignupInfo: { email: string; referralCode: string; role: string };
  }>(INVITATION_SIGNUP_INFO, {
    variables: { token: inviteToken! },
    skip: !inviteToken || Boolean(params.email),
  });

  const [signupMut, { loading }] = useMutation<SignupData>(SIGNUP);

  useEffect(() => {
    const info = inviteInfo?.invitationSignupInfo;
    if (!info) return;
    if (info.role === "admin") {
      router.replace(`/auth/accept-invitation/${inviteToken}`);
      return;
    }
    setEmail(info.email);
    setReferralCode(info.referralCode.toUpperCase());
    setInvited(true);
  }, [inviteInfo, inviteToken]);

  useEffect(() => {
    if (inviteError) setError("This invitation link has expired or is no longer valid.");
  }, [inviteError]);

  async function handleSignup() {
    setError(null);
    const e = email.trim().toLowerCase();
    const n = displayName.trim();
    if (!e || !password) { setError("Email and password are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    try {
      await signupMut({ variables: { email: e, password, displayName: n || undefined } });
      router.push({
        pathname: "/auth/verify-email",
        params: { email: e, referralCode: referralCode.trim().toUpperCase() || "" },
      });
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <AuthScreenLayout>
      <AuthFormCard>
        <Text style={[styles.formTitle, { color: colors.text }]}>Create account</Text>
        {invited ? (
          <Text style={[styles.inviteNote, { color: colors.subtext }]}>
            You&apos;ve been invited — your email and referral code are ready below.
          </Text>
        ) : null}
        {loadingInvite ? <ActivityIndicator color={colors.accent} style={{ marginBottom: 4 }} /> : null}
        <View style={styles.formSubRow}>
          <Text style={[styles.formSubText, { color: colors.subtext }]}>Already have one? </Text>
          <Link href="/auth/login" replace style={[styles.formSubLink, { color: colors.accent }]}>
            Log in
          </Link>
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
        <PasswordInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          placeholderTextColor={colors.muted}
          returnKeyType="next"
          onSubmitEditing={() => void handleSignup()}
        />

        <Text style={[styles.label, { color: colors.subtext }]}>Referral code (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
          value={referralCode}
          onChangeText={(t) => setReferralCode(t.toUpperCase())}
          placeholder="From your invite email"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
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
        <LegalLinksFooter />
      </AuthFormCard>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  formTitle: { fontSize: 26, fontWeight: "800", marginBottom: 2 },
  inviteNote: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
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
