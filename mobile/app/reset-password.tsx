import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

/** Handles https://kejitbe.app/reset-password?token=… universal / app links. */
export default function ResetPasswordLinkHandler() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const raw = params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  useEffect(() => {
    if (token?.trim()) {
      router.replace(`/auth/reset-password/${encodeURIComponent(token.trim())}`);
      return;
    }
    router.replace("/auth/forgot-password");
  }, [token]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}
