import { router } from "expo-router";
import { Text, View } from "react-native";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function MessagesScreen() {
  const { isAuthenticated, hydrated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <View style={[{
      flex: 1, backgroundColor: colors.bg,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
      paddingTop: insets.top + 24, paddingBottom: insets.bottom,
    }]}>
      <View style={{
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: colors.card, borderWidth: 1,
        borderColor: colors.border, justifyContent: "center",
        alignItems: "center", marginBottom: 20,
      }}>
        <Text style={{ fontSize: 36 }}>💬</Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, marginBottom: 8 }}>Messages</Text>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accent, marginBottom: 10 }}>Direct messaging coming soon</Text>
      <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
        Chat with friends, share comparisons, and more.
      </Text>
    </View>
  );
}
