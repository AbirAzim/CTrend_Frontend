import { StyleSheet, Text, View } from "react-native";
import { leaderboardRankTier } from "@ctrend/shared/lib/leaderboardRank";
import { useTheme } from "../context/ThemeContext";

type Props = {
  rank: number;
  size?: "sm" | "md";
};

const PODIUM = {
  gold: { bg: "#f5c518", border: "#ffe88a", text: "#5c3a00" },
  silver: { bg: "#c0c8d4", border: "#e8edf2", text: "#3d4654" },
  bronze: { bg: "#cd7f32", border: "#e8a86a", text: "#4a2c0a" },
} as const;

export function LeaderboardRankBadge({ rank, size = "md" }: Props) {
  const { colors, isDark } = useTheme();
  const tier = leaderboardRankTier(rank);
  const dim = size === "sm" ? 22 : 32;
  const isPodium = tier !== "default";
  const palette = isPodium ? PODIUM[tier] : null;

  return (
    <View
      style={[
        st.badge,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: palette?.bg ?? (isDark ? colors.section : "#f0f0f0"),
          borderColor: palette?.border ?? colors.border,
          borderWidth: isPodium ? 2 : 1,
        },
      ]}
      accessibilityLabel={`Rank ${rank}`}
    >
      <Text
        style={[
          st.num,
          {
            color: palette?.text ?? colors.muted,
            fontSize: size === "sm" ? 11 : 14,
          },
        ]}
      >
        {rank}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  num: {
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    lineHeight: 14,
  },
});
