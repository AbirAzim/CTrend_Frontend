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
};

export function MonthlyPodiumBadge({ stats }: Props) {
  const total =
    stats.firstPlaceCount + stats.secondPlaceCount + stats.thirdPlaceCount;

  return (
    <View
      style={[st.row, total <= 0 && st.rowEmpty]}
      accessibilityLabel="Monthly podium finishes"
    >
      {TIERS.map(({ key, medal, label, activeBg, border }) => {
        const count = stats[key];
        const active = count > 0;
        return (
          <View
            key={key}
            style={[
              st.chip,
              active
                ? { backgroundColor: activeBg, borderColor: border }
                : st.chipZero,
            ]}
            accessibilityLabel={`${label} place ${count} times`}
          >
            <Text style={[st.medal, !active && st.muted]}>{medal}</Text>
            <Text style={[st.count, !active && st.muted]}>×{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
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
