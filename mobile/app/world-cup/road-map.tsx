import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@apollo/client/react";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { worldCupRoadMapPollMs, type BracketFixture } from "@ctrend/shared/lib/knockoutBracket";
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
  const [viewRotated, setViewRotated] = useState(false);

  const [pollInterval, setPollInterval] = useState(30_000);

  const { data, loading, error, refetch } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    pollInterval,
    notifyOnNetworkStatusChange: true,
  });
  const fixtures = data?.worldCupFixtures ?? [];
  const pollMs = useMemo(() => worldCupRoadMapPollMs(fixtures as BracketFixture[]), [fixtures]);

  useEffect(() => {
    setPollInterval(pollMs);
  }, [pollMs]);

  useFocusEffect(
    useCallback(() => {
      translateY.setValue(0);
      void refetch();
      return () => setViewRotated(false);
    }, [translateY, refetch]),
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
        <Pressable
          onPress={() => setViewRotated((v) => !v)}
          hitSlop={10}
          style={styles.rotateBtn}
          accessibilityRole="button"
          accessibilityLabel={viewRotated ? "Show portrait view" : "Rotate bracket view"}
        >
          <Text style={[styles.rotateText, { color: colors.accent }]}>
            {viewRotated ? "Portrait" : "Rotate"}
          </Text>
        </Pressable>
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
          <View style={styles.bracketHost}>
            <WorldCupKnockoutBracket
              fixtures={fixtures}
              onOpenMatch={onOpenMatch}
              viewportSize={viewportSize}
              zoomable
              viewRotated={viewRotated}
            />
          </View>
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
  rotateBtn: { width: 72, alignItems: "flex-end" },
  rotateText: { fontSize: 13, fontWeight: "800" },
  body: { flex: 1, overflow: "hidden" },
  bracketHost: { flex: 1 },
  status: { textAlign: "center", paddingVertical: 24, fontSize: 13 },
});
