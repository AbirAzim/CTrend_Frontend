import { useQuery } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { Image } from "expo-image";
import { useTheme } from "../context/ThemeContext";
import {
  type WcFixture,
  countdownToKickoff,
  formatTime,
  groupByDay,
  involvesTeam,
  liveFixtures,
  liveMinute,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";

const POS_KEY = "ctrend_wc_float_pos";
const BUBBLE = 54;
const HALF = BUBBLE / 2;

type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };
type FixturesData = { worldCupFixtures: WcFixture[] };
type CampaignsData = { activeCampaigns: Campaign[] };
type Pos = { x: number; y: number };

/**
 * App-wide draggable World Cup bubble (chat-head style). Drag it anywhere, park
 * it half-off any edge to tuck it away, tap to open the live/upcoming card.
 */
export function WorldCupFloating() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const { width: W, height: H } = useWindowDimensions();

  const [pos, setPos] = useState<Pos>({ x: W - BUBBLE - 14, y: H - BUBBLE - 150 });
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);
  // Refs so the PanResponder (created once) always sees the latest position.
  const posRef = useRef(pos);
  posRef.current = pos;
  const boundsRef = useRef({ W, H });
  boundsRef.current = { W, H };
  // Scale animation to signal "grabbed".
  const scale = useRef(new Animated.Value(1)).current;
  function animateScale(to: number) {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 140 }).start();
  }

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Hydrate saved position.
  useEffect(() => {
    void AsyncStorage.getItem(POS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw) as Pos;
        setPos(clampTuck(p, boundsRef.current.W, boundsRef.current.H));
      } catch {
        /* ignore */
      }
    });
  }, []);

  const panRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.hypot(g.dx, g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        const base = baseRef.current;
        const { W: bw, H: bh } = boundsRef.current;
        setPos(clampTuck({ x: base.x + g.dx, y: base.y + g.dy }, bw, bh));
      },
      onPanResponderGrant: () => {
        baseRef.current = posRef.current;
        // Haptic + grow so it's clear the bubble is grabbed.
        Vibration.vibrate(12);
        animateScale(1.22);
      },
      onPanResponderRelease: (_e, g) => {
        animateScale(1);
        if (Math.hypot(g.dx, g.dy) <= 4) {
          // Tap → toggle card; pull on-screen when opening.
          const { W: bw, H: bh } = boundsRef.current;
          if (!expandedRef.current) setPos((p) => clampVisible(p, bw, bh, insetsRef.current));
          setExpanded((v) => !v);
        } else {
          Vibration.vibrate(8);
          void AsyncStorage.setItem(POS_KEY, JSON.stringify(posRef.current)).catch(() => {});
        }
      },
      onPanResponderTerminate: () => animateScale(1),
    }),
  );
  const baseRef = useRef<Pos>(pos);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

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
  const centerX = pos.x + HALF;
  const centerY = pos.y + HALF;
  const sideRight = centerX > W / 2;
  const sideBottom = centerY > H / 2;

  function openMatch(f: WcFixture) {
    setExpanded(false);
    router.push((f.campaignPostId ? `/post/${f.campaignPostId}` : "/world-cup") as `/${string}`);
  }

  const cardAnchor: { left?: number; right?: number; top?: number; bottom?: number } = {};
  if (sideRight) cardAnchor.right = 12;
  else cardAnchor.left = 12;
  if (sideBottom) cardAnchor.bottom = insets.bottom + 84;
  else cardAnchor.top = insets.top + 56;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {expanded ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpanded(false)} />
      ) : null}

      {expanded ? (
        <View style={[st.card, cardAnchor]}>
          <View style={st.head}>
            <Pressable
              style={st.title}
              onPress={() => {
                setExpanded(false);
                router.push("/world-cup" as `/${string}`);
              }}
            >
              <Text style={st.trophy}>🏆</Text>
              <Text style={st.titleText} numberOfLines={1}>
                {wcCampaign?.name || "World Cup"}
                {followed ? ` · ${followed}` : ""}
              </Text>
            </Pressable>
            <Pressable style={st.iconBtn} onPress={() => setExpanded(false)} hitSlop={6}>
              <Text style={st.iconBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={st.body} keyboardShouldPersistTaps="handled">
            {live.map((f) => (
              <Pressable key={f.id} style={[st.row, st.rowLive]} onPress={() => openMatch(f)}>
                <View style={st.liveBadge}>
                  <Text style={st.liveBadgeText}>LIVE {liveMinute(f.kickoff)}&apos;</Text>
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
      ) : null}

      <Animated.View
        {...panRef.current.panHandlers}
        style={[st.bubble, { left: pos.x, top: pos.y, transform: [{ scale }] }]}
      >
        <Image
          source={require("../assets/worldcup-trophy.png")}
          style={st.bubbleImg}
          contentFit="contain"
        />
        {live.length > 0 ? <View style={st.bubbleLiveDot} /> : null}
      </Animated.View>
    </View>
  );
}

function clampTuck(p: Pos, W: number, H: number): Pos {
  return {
    x: Math.max(-HALF, Math.min(p.x, W - HALF)),
    y: Math.max(-HALF, Math.min(p.y, H - HALF)),
  };
}

function clampVisible(p: Pos, W: number, H: number, insets: { top: number; bottom: number }): Pos {
  return {
    x: Math.max(8, Math.min(p.x, W - BUBBLE - 8)),
    y: Math.max(insets.top + 8, Math.min(p.y, H - BUBBLE - insets.bottom - 8)),
  };
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
    bubble: {
      position: "absolute",
      width: BUBBLE,
      height: BUBBLE,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    bubbleImg: { width: BUBBLE, height: BUBBLE },
    bubbleLiveDot: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: "#ef4444",
      borderWidth: 2,
      borderColor: "#fff",
    },
    card: {
      position: "absolute",
      width: 250,
      maxWidth: "78%",
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
    trophy: { fontSize: 14 },
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
