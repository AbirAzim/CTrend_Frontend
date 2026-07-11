import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

/** Top-nav search trigger — icon-only (matches the other nav action buttons)
 * so it can't crowd out the notification/logout icons on narrow phones.
 * Tapping opens the full search screen. */
export function FeedNavSearch() {
  const { colors, isDark } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={() => router.push("/search" as `/${string}`)}
      hitSlop={6}
      accessibilityRole="search"
      accessibilityLabel="Search people and posts"
    >
      <Ionicons name="search-outline" size={22} color={isDark ? colors.text : colors.subtext} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
});
