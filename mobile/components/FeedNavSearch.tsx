import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../context/ThemeContext";

/** Top-nav search pill — matches web `GlobalSearch` bar; opens full search on tap. */
export function FeedNavSearch({
  expandProgress,
}: {
  expandProgress?: Animated.Value;
}) {
  const { colors } = useTheme();

  const pillHeight =
    expandProgress?.interpolate({
      inputRange: [0, 1],
      outputRange: [32, 38],
    }) ?? 38;
  const pillPaddingH =
    expandProgress?.interpolate({
      inputRange: [0, 1],
      outputRange: [10, 12],
    }) ?? 12;

  return (
    <Pressable
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed ? 0.88 : 1,
      })}
      onPress={() => router.push("/search" as `/${string}`)}
      accessibilityRole="search"
      accessibilityLabel="Search people and posts"
    >
      <Animated.View
        style={[
          styles.pill,
          {
            height: pillHeight,
            paddingHorizontal: pillPaddingH,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Ionicons name="search-outline" size={17} color={colors.muted} />
        <Text style={[styles.placeholder, { color: colors.muted }]} numberOfLines={1}>
          Search…
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  placeholder: {
    flex: 1,
    fontSize: 13,
  },
});
