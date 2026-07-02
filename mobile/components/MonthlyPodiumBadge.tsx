import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export type MonthlyPodiumStats = {
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
};

const TIERS = [
  { key: "firstPlaceCount" as const, medal: "🥇", label: "1st", activeBg: "rgba(245,197,24,0.22)", border: "rgba(245,197,24,0.45)" },
  { key: "secondPlaceCount" as const, medal: "🥈", label: "2nd", activeBg: "rgba(192,200,212,0.2)", border: "rgba(192,200,212,0.45)" },
  { key: "thirdPlaceCount" as const, medal: "🥉", label: "3rd", activeBg: "rgba(205,127,50,0.18)", border: "rgba(205,127,50,0.42)" },
];

type Props = {
  stats: MonthlyPodiumStats;
  layout?: "grid" | "inline";
};

export function MonthlyPodiumBadge({ stats, layout = "inline" }: Props) {
  const { colors, isDark } = useTheme();
  const inactiveCell = isDark
    ? { backgroundColor: "rgba(0,0,0,0.38)", borderColor: "rgba(255,255,255,0.16)" }
    : { backgroundColor: "rgba(0,0,0,0.06)", borderColor: "rgba(0,0,0,0.1)" };

  if (layout === "grid") {
    return (
      <View style={grid.row} accessibilityLabel="Monthly podium finishes">
        {TIERS.map(({ key, medal, label, activeBg, border }) => {
          const count = stats[key];
          const active = count > 0;
          return (
            <View
              key={key}
              style={[
                grid.cell,
                active ? { backgroundColor: activeBg, borderColor: border } : inactiveCell,
              ]}
              accessibilityLabel={`${label} place ${count} times`}
            >
              <Text style={grid.medal}>{medal}</Text>
              <Text style={[grid.count, { color: colors.text }, !active && grid.muted]}>{count}</Text>
              <Text style={[grid.label, { color: colors.subtext }]}>{label}</Text>
            </View>
          );
        })}
      </View>
    );
  }

  const total = stats.firstPlaceCount + stats.secondPlaceCount + stats.thirdPlaceCount;

  return (
    <View style={[inline.row, total <= 0 && inline.rowEmpty]} accessibilityLabel="Monthly podium finishes">
      {TIERS.map(({ key, medal, label, activeBg, border }) => {
        const count = stats[key];
        const active = count > 0;
        return (
          <View
            key={key}
            style={[inline.chip, active ? { backgroundColor: activeBg, borderColor: border } : inline.chipZero]}
            accessibilityLabel={`${label} place ${count} times`}
          >
            <Text style={[inline.medal, !active && inline.muted]}>{medal}</Text>
            <Text style={[inline.count, { color: colors.text }, !active && inline.muted]}>×{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const grid = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 2,
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 3,
    paddingHorizontal: 1,
    borderRadius: 6,
    borderWidth: 1,
    minHeight: 34,
  },
  medal: { fontSize: 10, lineHeight: 12 },
  count: {
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    lineHeight: 12,
    marginTop: 1,
  },
  label: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    lineHeight: 9,
    marginTop: 1,
  },
  muted: { opacity: 0.7 },
});

const inline = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  rowEmpty: { opacity: 0.5 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipZero: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.08)",
  },
  medal: { fontSize: 11, lineHeight: 13 },
  count: { fontSize: 9, fontWeight: "800", fontVariant: ["tabular-nums"] },
  muted: { opacity: 0.45 },
});
