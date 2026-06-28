import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function Index() {
  const { hydrated } = useAuth();
  const { colors } = useTheme();

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accentLight} />
      </View>
    );
  }

  // Always go to tabs — feed is public, individual screens guard their own auth
  return <Redirect href="/tabs" />;
}
