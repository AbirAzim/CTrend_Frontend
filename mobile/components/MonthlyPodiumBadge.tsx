import { StyleSheet, Text, View } from "react-native";

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
  if (layout === "grid") {
    return (
      <View style={grid.row} accessibilityLabel="Monthly podium finishes">
        {TIERS.map(({ key, medal, label, activeBg, border }) => {
          const count = stats[key];
          const active = count > 0;
          return (
            <View
              key={key}
              style={[grid.cell, active ? { backgroundColor: activeBg, borderColor: border } : grid.cellZero]}
              accessibilityLabel={`${label} place ${count} times`}
            >
              <Text style={grid.medal}>{medal}</Text>
              <Text style={[grid.count, !active && grid.muted]}>{count}</Text>
              <Text style={[grid.label, !active && grid.muted]}>{label}</Text>
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
            <Text style={[inline.count, !active && inline.muted]}>×{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const grid = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 3,
    width: "100%",
    minWidth: 0,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  cellZero: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  medal: { fontSize: 11, lineHeight: 13 },
  count: { fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"], lineHeight: 12 },
  label: { fontSize: 7, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase", lineHeight: 9 },
  muted: { opacity: 0.55 },
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
