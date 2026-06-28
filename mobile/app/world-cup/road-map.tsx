import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@apollo/client/react";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { WorldCupKnockoutBracket } from "../../components/WorldCupKnockoutBracket";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
import type { WcFixture } from "../../lib/worldCupFixtures";

type FixturesData = { worldCupFixtures: WcFixture[] };

export default function WorldCupRoadMapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const { data, loading, error } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    pollInterval: 60_000,
  });
  const fixtures = data?.worldCupFixtures ?? [];

  useFocusEffect(
    useCallback(() => {
      translateY.setValue(0);
    }, [translateY]),
  );

  const onOpenMatch = (id: string) => {
    router.push(`/world-cup/match/${id}` as `/${string}`);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Math.max(insets.top, 4),
            borderBottomColor: colors.border,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={[styles.backText, { color: colors.accent }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          Knockout Road Map
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View
        style={[styles.body, { paddingBottom: insets.bottom }]}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (w > 0 && h > 0) setViewportSize({ width: w, height: h });
        }}
      >
        {loading && fixtures.length === 0 ? (
          <Text style={[styles.status, { color: colors.muted }]}>Loading road map…</Text>
        ) : null}
        {error && fixtures.length === 0 ? (
          <Text style={[styles.status, { color: colors.muted }]}>
            Couldn&apos;t load fixtures. {error.message}
          </Text>
        ) : null}

        {fixtures.length > 0 ? (
          <WorldCupKnockoutBracket
            fixtures={fixtures}
            onOpenMatch={onOpenMatch}
            viewportSize={viewportSize}
            zoomable
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 72 },
  backText: { fontSize: 14, fontWeight: "700" },
  title: { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "800" },
  body: { flex: 1 },
  status: { textAlign: "center", paddingVertical: 24, fontSize: 13 },
});
