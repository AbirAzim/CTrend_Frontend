import { useQuery } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { useTheme } from "../context/ThemeContext";
import {
  type WcFixture,
  countdownToKickoff,
  formatTime,
  groupByDay,
  involvesTeam,
  liveFixtures,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";
import trophyAsset from "../assets/worldcup-trophy.png";

type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };
type FixturesData = { worldCupFixtures: WcFixture[] };
type CampaignsData = { activeCampaigns: Campaign[] };

/**
 * Fixed World Cup trophy tab pinned to the right edge (half-peeking). Tap to
 * slide out the live/upcoming card; the tab hides while the card is open.
 */
export function WorldCupFloating() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const { height: H } = useWindowDimensions();

  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Draggable, semi-transparent edge tab ──────────────────────────────────
  // The tab can be dragged up/down so it never permanently blocks content, and
  // it sits at reduced opacity while idle (full opacity while touched). The drop
  // position is remembered across sessions.
  const TAB_H = 56;
  const IDLE_OPACITY = 0.55;
  const baseTop = Math.round(H * 0.46);
  const minRel = insets.top + 8 - baseTop;
  const maxRel = H - insets.bottom - TAB_H - 92 - baseTop;
  const minRelRef = useRef(minRel);
  const maxRelRef = useRef(maxRel);
  minRelRef.current = minRel;
  maxRelRef.current = maxRel;
  const dragY = useRef(new Animated.Value(0)).current;
  const tabOpacity = useRef(new Animated.Value(IDLE_OPACITY)).current;
  const lastOffset = useRef(0);
  // Tracks whether the tab is currently pinned to a clamp edge, so the edge
  // "bump" haptic fires once on arrival rather than every move frame.
  const atEdge = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem("ctrend_wc_tab_y").then((v) => {
      if (v == null) return;
      const rel = Number(v);
      if (Number.isNaN(rel)) return;
      const clamped = Math.max(minRelRef.current, Math.min(maxRelRef.current, rel));
      lastOffset.current = clamped;
      dragY.setValue(clamped);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fadeTab = (to: number) =>
    Animated.timing(tabOpacity, { toValue: to, duration: 160, useNativeDriver: false }).start();

  const pan = useRef(
    PanResponder.create({
      // Tap falls through to the inner Pressable; only a real vertical drag grabs it.
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        dragY.setOffset(lastOffset.current);
        dragY.setValue(0);
        atEdge.current = false;
        fadeTab(1);
        Vibration.vibrate(10); // light "pick up" tick
      },
      onPanResponderMove: Animated.event([null, { dy: dragY }], {
        useNativeDriver: false,
        // Edge-bump haptic: buzz once when the drag reaches the top/bottom limit.
        listener: (_e, g: { dy: number }) => {
          const raw = lastOffset.current + g.dy;
          const beyond = raw <= minRelRef.current || raw >= maxRelRef.current;
          if (beyond && !atEdge.current) {
            atEdge.current = true;
            Vibration.vibrate(20);
          } else if (!beyond && atEdge.current) {
            atEdge.current = false;
          }
        },
      }),
      onPanResponderRelease: (_, g) => {
        dragY.flattenOffset();
        const next = Math.max(
          minRelRef.current,
          Math.min(maxRelRef.current, lastOffset.current + g.dy),
        );
        lastOffset.current = next;
        Animated.spring(dragY, {
          toValue: next,
          useNativeDriver: false,
          tension: 90,
          friction: 11,
        }).start();
        void AsyncStorage.setItem("ctrend_wc_tab_y", String(next));
        fadeTab(IDLE_OPACITY);
        Vibration.vibrate(8); // soft "drop" tick
      },
      onPanResponderTerminate: () => fadeTab(IDLE_OPACITY),
    }),
  ).current;

  const { data: campData } = useQuery<CampaignsData>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
  });
  const wcCampaign = (campData?.activeCampaigns ?? []).find((c) => c.fixturesEnabled);

  const { data } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
    pollInterval: 60_000,
    skip: !wcCampaign,
  });

  const fixtures = data?.worldCupFixtures ?? [];
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const nextDays = groupByDay(nextUpcoming(filtered, 3));

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0) return null;

  const st = makeStyles(colors);

  function openMatch(f: WcFixture) {
    setOpen(false);
    router.push((f.campaignPostId ? `/post/${f.campaignPostId}` : "/world-cup") as `/${string}`);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? (
        <>
          <View style={[st.card, { right: 12, bottom: insets.bottom + 88 }]}>
            <View style={st.head}>
              <Pressable
                style={st.title}
                onPress={() => {
                  setOpen(false);
                  router.push("/world-cup" as `/${string}`);
                }}
              >
                <Image source={trophyAsset} style={st.headTrophy} contentFit="contain" />
                <Text style={st.titleText} numberOfLines={1}>
                  {wcCampaign?.name || "World Cup"}
                  {followed ? ` · ${followed}` : ""}
                </Text>
              </Pressable>
              <Pressable style={st.iconBtn} onPress={() => setOpen(false)} hitSlop={6}>
                <Text style={st.iconBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={st.body} keyboardShouldPersistTaps="handled">
              {live.map((f) => (
                <Pressable key={f.id} style={[st.row, st.rowLive]} onPress={() => openMatch(f)}>
                  <View style={st.liveBadge}>
                    <Text style={st.liveBadgeText}>{f.minute != null ? `LIVE ${f.minute}'` : "LIVE"}</Text>
                  </View>
                  <Text style={st.teams} numberOfLines={1}>
                    {f.homeTeam.shortName} {f.score.home ?? 0}–{f.score.away ?? 0} {f.awayTeam.shortName}
                  </Text>
                </Pressable>
              ))}
              {nextDays.map((g) => (
                <View key={g.key}>
                  <Text style={st.dayLabel}>{g.label}</Text>
                  {g.fixtures.map((f) => (
                    <Pressable key={f.id} style={st.row} onPress={() => openMatch(f)}>
                      <Text style={st.teams} numberOfLines={1}>
                        {f.homeTeam.shortName} <Text style={st.v}>v</Text> {f.awayTeam.shortName}
                      </Text>
                      <View style={st.timeCol}>
                        <Text style={st.time}>{formatTime(f.kickoff)}</Text>
                        <Text style={st.countdown}>{countdownToKickoff(f.kickoff)}</Text>
                      </View>
                      {f.campaignPostId ? (
                        <View style={st.voteChip}>
                          <Text style={st.voteChipText}>Vote</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </>
      ) : (
        // Half-peeking tab pinned to the right edge — drag up/down to reposition.
        <Animated.View
          style={[
            st.tab,
            { top: baseTop, opacity: tabOpacity, transform: [{ translateY: dragY }] },
          ]}
          {...pan.panHandlers}
        >
          <Pressable
            style={st.tabPressable}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open World Cup matches. Drag up or down to move."
          >
            <Image source={trophyAsset} style={st.tabImg} contentFit="contain" />
            {live.length > 0 ? <View style={st.tabLiveDot} /> : null}
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

function makeStyles(c: {
  card: string;
  border: string;
  text: string;
  subtext: string;
  muted: string;
  accent: string;
  section: string;
}) {
  return StyleSheet.create({
    tab: {
      position: "absolute",
      right: -16,
      width: 60,
      height: 56,
      borderTopLeftRadius: 28,
      borderBottomLeftRadius: 28,
      backgroundColor: c.card,
      borderWidth: 1,
      borderRightWidth: 0,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      paddingRight: 14,
      zIndex: 1000,
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 8,
      shadowOffset: { width: -2, height: 2 },
      elevation: 8,
    },
    tabPressable: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
    tabImg: { width: 38, height: 38 },
    tabLiveDot: {
      position: "absolute",
      top: 6,
      left: 8,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: "#ef4444",
      borderWidth: 2,
      borderColor: c.card,
    },
    card: {
      position: "absolute",
      width: 252,
      maxWidth: "80%",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      zIndex: 1001,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 12,
    },
    head: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 7,
      paddingLeft: 10,
      paddingRight: 6,
      backgroundColor: c.accent,
    },
    title: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
    headTrophy: { width: 22, height: 22 },
    titleText: { color: "#fff", fontWeight: "800", fontSize: 13, flexShrink: 1 },
    iconBtn: {
      width: 24,
      height: 24,
      borderRadius: 6,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    body: { maxHeight: 280, padding: 6 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 8,
      backgroundColor: c.section,
      borderRadius: 9,
      marginBottom: 3,
    },
    rowLive: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)" },
    liveBadge: { backgroundColor: "#ef4444", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
    liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    teams: { flex: 1, minWidth: 0, fontWeight: "700", fontSize: 12.5, color: c.text },
    v: { color: c.muted, fontWeight: "600" },
    timeCol: { alignItems: "flex-end" },
    time: { fontSize: 12, fontWeight: "700", color: c.text },
    countdown: { fontSize: 10, fontWeight: "600", color: c.muted },
    dayLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.accent,
      marginTop: 4,
      marginBottom: 3,
      marginLeft: 4,
    },
    voteChip: { backgroundColor: c.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    voteChipText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  });
}
