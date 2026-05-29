import { useMutation } from "@apollo/client/react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { GOOGLE_LOGIN } from "@ctrend/shared/graphql/auth";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import {
  googleSignInErrorMessage,
  isGoogleSignInConfigured,
  signInWithGoogleIdToken,
} from "../lib/googleAuth";
import { useAuth } from "../context/AuthContext";
import type { StoredUser } from "../lib/authStorage";

type GoogleLoginData = {
  googleLogin: {
    accessToken: string;
    user: StoredUser;
  };
};

type Props = {
  onError: (message: string) => void;
  disabled?: boolean;
};

export function GoogleSignInButton({ onError, disabled }: Props) {
  const { setSession } = useAuth();
  const [googleLogin, { loading }] = useMutation<GoogleLoginData>(GOOGLE_LOGIN);

  if (!isGoogleSignInConfigured()) {
    return null;
  }

  async function handlePress() {
    onError("");
    try {
      const idToken = await signInWithGoogleIdToken();
      const { data } = await googleLogin({ variables: { idToken } });
      if (!data?.googleLogin) throw new Error("No response from server.");
      await setSession(data.googleLogin.accessToken, data.googleLogin.user);
      router.replace("/");
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.includes("Google")
          ? googleSignInErrorMessage(err)
          : getApolloErrorMessage(err);
      onError(msg || googleSignInErrorMessage(err));
    }
  }

  return (
    <Pressable
      style={[styles.btn, (loading || disabled) && styles.btnDisabled]}
      onPress={() => void handlePress()}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color="#312e81" />
      ) : (
        <Text style={styles.btnText}>Continue with Google</Text>
      )}
    </Pressable>
  );
}

export function AuthDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#312e81", fontSize: 16, fontWeight: "700" },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  dividerText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
});
