import { useQuery } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { useTheme } from "../context/ThemeContext";
import {
  type WcFixture,
  finishedFixtures,
  formatTime,
  involvesTeam,
  isFinished,
  isLive,
  liveBadgeLabel,
  liveFixtures,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";
import trophyAsset from "../assets/worldcup-trophy.png";

const DISMISSED_KEY = "ctrend_wc_banner_dismissed";

type Campaign = { id: string; name: string; fixturesEnabled?: boolean };
type FixturesData = { worldCupFixtures: WcFixture[] };
type CampaignsData = { activeCampaigns: Campaign[] };

export function WorldCupBanner() {
  const { isDark } = useTheme();
  const followed = useFollowedTeam();
  const [dismissed, setDismissed] = useState(false);
  const dotAnim = useRef(new Animated.Value(1)).current;

  // Load dismiss state
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((v) => { if (v) setDismissed(true); });
  }, []);

  const { data: campData } = useQuery<CampaignsData>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network", errorPolicy: "all",
  });
  const wcCampaign = (campData?.activeCampaigns ?? []).find((c) => c.fixturesEnabled);

  const { data } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network", errorPolicy: "all",
    pollInterval: 30_000, skip: !wcCampaign,
  });

  const fixtures = data?.worldCupFixtures ?? [];
  const pool = fixtures.filter((f) => involvesTeam(f, followed));
  const src = pool.length ? pool : fixtures;
  const live = liveFixtures(src);
  const next = nextUpcoming(src, 1)[0] ?? null;
  const recent = finishedFixtures(src)[0] ?? null;

  // Re-show when a match goes live
  useEffect(() => {
    if (live.length > 0 && dismissed) {
      AsyncStorage.removeItem(DISMISSED_KEY);
      setDismissed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.length]);

  // Blink the live dot
  useEffect(() => {
    if (!live.length) { dotAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 0.25, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.length]);

  if (!wcCampaign || dismissed || fixtures.length === 0) return null;

  const liveMatch = live[0] ?? null;
  const feature = liveMatch ?? next ?? recent;
  if (!feature) return null;

  const isLiveMatch = !!liveMatch;
  const isResult = !liveMatch && !next && !!recent;

  function handlePress() {
    if (isLiveMatch || isResult) {
      if (isLive(feature) || isFinished(feature)) {
        router.push(`/world-cup/match/${feature.id}` as `/${string}`);
      } else {
        router.push("/tabs/world-cup?tab=results" as `/${string}`);
      }
    } else {
      router.push("/tabs/world-cup" as `/${string}`);
    }
  }

  function handleDismiss() {
    AsyncStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  const labelColor = isLiveMatch ? "#ef4444" : "#22c55e";
  const ctaText = isLiveMatch ? "Watch Live →" : isResult ? "See Result →" : "View →";
  const cardBg = isLiveMatch
    ? (isDark ? "#2a1010" : "#fff1f2")
    : (isDark ? "#0f1f10" : "#f0fdf4");
  const borderColor = isLiveMatch
    ? (isDark ? "rgba(239,68,68,0.45)" : "rgba(239,68,68,0.35)")
    : (isDark ? "rgba(34,197,94,0.30)" : "rgba(34,197,94,0.35)");
  const teamColor = isDark ? "#f1f5f9" : "#0f172a";
  const vsColor = isDark ? "#4b5563" : "#94a3b8";
  const timeColor = isDark ? "#94a3b8" : "#64748b";

  return (
    <Pressable
      style={[st.card, { backgroundColor: cardBg, borderColor }]}
      onPress={handlePress}
    >
      {/* Left: trophy + info */}
      <View style={st.left}>
        <Image source={trophyAsset} style={st.trophy} contentFit="contain" />
        <View style={st.info}>
          {/* Label row */}
          <View style={st.labelRow}>
            {isLiveMatch && <Animated.View style={[st.dot, { opacity: dotAnim }]} />}
            <Text style={[st.label, { color: labelColor }]}>
              {isLiveMatch ? liveBadgeLabel(liveMatch) : isResult ? "Recent Result" : "Next Match"}
            </Text>
          </View>
          {/* Match row */}
          <View style={st.matchRow}>
            {feature.homeTeam.crest
              ? <Image source={{ uri: feature.homeTeam.crest }} style={st.flag} contentFit="contain" />
              : null}
            <Text style={[st.team, { color: teamColor }]} numberOfLines={1}>
              {feature.homeTeam.shortName}
            </Text>
            {isLiveMatch || isResult
              ? <View style={[st.scorePill, { backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)" }]}>
                  <Text style={[st.score, { color: teamColor }]}>
                    {feature.score?.home ?? 0}–{feature.score?.away ?? 0}
                  </Text>
                </View>
              : <Text style={[st.vs, { color: vsColor }]}>vs</Text>}
            <Text style={[st.team, { color: teamColor }]} numberOfLines={1}>
              {feature.awayTeam.shortName}
            </Text>
            {feature.awayTeam.crest
              ? <Image source={{ uri: feature.awayTeam.crest }} style={st.flag} contentFit="contain" />
              : null}
          </View>
          {/* Kickoff time for upcoming */}
          {!isLiveMatch && !isResult && next && (
            <Text style={[st.time, { color: timeColor }]}>{formatTime(next.kickoff)}</Text>
          )}
        </View>
      </View>

      {/* Right: CTA + dismiss */}
      <View style={st.right}>
        <Text style={[st.cta, { color: labelColor }]}>{ctaText}</Text>
        <Pressable style={st.closeBtn} onPress={handleDismiss} hitSlop={8}>
          <Text style={[st.closeTxt, { color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)" }]}>✕</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  trophy: { width: 30, height: 30, flexShrink: 0 },
  info: { flex: 1, minWidth: 0, gap: 4 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#ef4444" },
  label: { fontSize: 9.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  matchRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "nowrap" },
  flag: { width: 17, height: 17, borderRadius: 2, flexShrink: 0 },
  team: { fontSize: 13, fontWeight: "800", flexShrink: 1, maxWidth: 72 },
  vs: { fontSize: 11, fontWeight: "700" },
  scorePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  score: { fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  time: { fontSize: 11, fontWeight: "600" },
  right: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  cta: { fontSize: 12, fontWeight: "700" },
  closeBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(128,128,128,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  closeTxt: { fontSize: 10, fontWeight: "700", lineHeight: 12 },
});
