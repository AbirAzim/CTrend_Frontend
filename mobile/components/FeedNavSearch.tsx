import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../context/ThemeContext";

/** Top-nav search pill — matches web `GlobalSearch` bar; opens full search on tap. */
export function FeedNavSearch({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        compact && styles.pillCompact,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
      onPress={() => router.push("/search" as `/${string}`)}
      accessibilityRole="search"
      accessibilityLabel="Search people and posts"
    >
      <Ionicons name="search-outline" size={17} color={colors.muted} />
      <Text style={[styles.placeholder, { color: colors.muted }]} numberOfLines={1}>
        Search…
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  pillCompact: {
    height: 32,
    paddingHorizontal: 10,
  },
  placeholder: {
    flex: 1,
    fontSize: 13,
  },
});
