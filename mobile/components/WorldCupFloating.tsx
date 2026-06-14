import { useQuery } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
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
import { useTheme } from "../context/ThemeContext";
import {
  type WcFixture,
  canVoteOnFixture,
  countdownToKickoff,
  finishedFixtures,
  formatTime,
  groupByDay,
  involvesTeam,
  liveBadgeLabel,
  liveFixtures,
  needsSecondTick,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";
import trophyAsset from "../assets/worldcup-trophy.png";

type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };
type FixturesData = { worldCupFixtures: WcFixture[] };
type CampaignsData = { activeCampaigns: Campaign[] };

const TAB_W = 90;
const TAB_H = 66;
const IDLE_OPACITY = 0.88;
// How much of the tab is visible — the rest is clipped by the screen edge.
const TAB_VISIBLE_FRAC = 0.68;

export function WorldCupFloating() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const { width: W, height: H } = useWindowDimensions();

  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);

  // Adaptive tick
  const allFixturesRef = useRef<WcFixture[]>([]);
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    function schedule() {
      const fast = needsSecondTick(allFixturesRef.current);
      id = setTimeout(() => { setTick((n) => n + 1); schedule(); }, fast ? 1000 : 30_000);
    }
    schedule();
    return () => clearTimeout(id);
  }, []);

  // ── Vertical-only draggable tab (fixed on right edge) ───────────────────────
  const tabX = W - Math.round(TAB_W * TAB_VISIBLE_FRAC); // partially off right edge
  const minY = insets.top + 56;            // padding so it can't stick to status bar
  const maxY = H - insets.bottom - TAB_H - 96; // padding above bottom nav

  const defaultY = Math.round(H * 0.46);

  const dragY = useRef(new Animated.Value(defaultY)).current;
  const tabOpacity = useRef(new Animated.Value(IDLE_OPACITY)).current;
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const lastOffsetY = useRef(defaultY);
  const atEdge = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem("ctrend_wc_tab_pos_y").then((v) => {
      let cy = defaultY;
      if (v) {
        const parsed = parseFloat(v);
        if (!Number.isNaN(parsed)) cy = Math.max(minY, Math.min(maxY, parsed));
      }
      lastOffsetY.current = cy;
      dragY.setValue(cy);
    });
    AsyncStorage.getItem("ctrend_wc_hint_seen").then((v) => {
      if (!v) {
        setHintVisible(true);
        setTimeout(() => {
          setHintVisible(false);
          void AsyncStorage.setItem("ctrend_wc_hint_seen", "1");
        }, 3000);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fadeTab = (to: number) =>
    Animated.timing(tabOpacity, { toValue: to, duration: 160, useNativeDriver: false }).start();

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        atEdge.current = false;
        fadeTab(1);
        Vibration.vibrate(10);
      },
      onPanResponderMove: (_, g) => {
        const ry = lastOffsetY.current + g.dy;
        dragY.setValue(ry);
        const beyond = ry <= minY || ry >= maxY;
        if (beyond && !atEdge.current) { atEdge.current = true; Vibration.vibrate(20); }
        else if (!beyond && atEdge.current) { atEdge.current = false; }
      },
      onPanResponderRelease: (_, g) => {
        const ny = Math.max(minY, Math.min(maxY, lastOffsetY.current + g.dy));
        lastOffsetY.current = ny;
        Animated.spring(dragY, {
          toValue: ny,
          useNativeDriver: false,
          tension: 90,
          friction: 11,
        }).start();
        void AsyncStorage.setItem("ctrend_wc_tab_pos_y", String(ny));
        fadeTab(IDLE_OPACITY);
        Vibration.vibrate(8);
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
  allFixturesRef.current = fixtures;
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const nextDays = groupByDay(nextUpcoming(filtered, 3));
  const recent = finishedFixtures(filtered).slice(0, 2);

  // Flags are only shown when a match is live; trophy otherwise.
  const liveFixture = live[0] ?? null;

  // Blink the flags whenever a live match is ongoing — must be before early returns.
  useEffect(() => {
    if (!liveFixture) {
      blinkAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [liveFixture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0 && recent.length === 0) return null;

  const st = makeStyles(colors);

  function openMatch(f: WcFixture) {
    setOpen(false);
    router.push((f.campaignPostId ? `/post/${f.campaignPostId}` : "/world-cup") as `/${string}`);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open ? (
        <View style={[st.card, { right: 12, bottom: insets.bottom + 88 }]}>
          <View style={st.head}>
            <Pressable
              style={st.title}
              onPress={() => { setOpen(false); router.push("/world-cup" as `/${string}`); }}
            >
              <Image source={trophyAsset} style={st.headTrophy} contentFit="contain" />
              <Text style={st.titleText} numberOfLines={1}>
                {wcCampaign?.name || "World Cup"}
                {followed ? ` · ${followed}` : ""}
              </Text>
            </Pressable>
            <Pressable style={st.iconBtn} onPress={() => setOpen(false)} hitSlop={6}>
              <Text style={st.iconBtnText}>─</Text>
            </Pressable>
          </View>

          <ScrollView style={st.body} keyboardShouldPersistTaps="handled">
            {/* Live */}
            {live.map((f) => (
              <Pressable key={f.id} style={[st.row, st.rowLive]} onPress={() => openMatch(f)}>
                <View style={st.liveBadge}>
                  <Text style={st.liveBadgeText}>{liveBadgeLabel(f)}</Text>
                </View>
                <View style={st.rowTeams}>
                  {f.homeTeam.crest ? <Image source={{ uri: f.homeTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                  <Text style={st.teams} numberOfLines={1}>
                    {f.homeTeam.shortName} {f.score.home ?? 0}–{f.score.away ?? 0} {f.awayTeam.shortName}
                  </Text>
                  {f.awayTeam.crest ? <Image source={{ uri: f.awayTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                </View>
              </Pressable>
            ))}

            {/* Upcoming */}
            {nextDays.map((g) => (
              <View key={g.key}>
                <Text style={st.dayLabel}>{g.label}</Text>
                {g.fixtures.map((f) => (
                  <Pressable key={f.id} style={st.row} onPress={() => openMatch(f)}>
                    <View style={st.rowTeams}>
                      {f.homeTeam.crest ? <Image source={{ uri: f.homeTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                      <Text style={st.teams} numberOfLines={1}>
                        {f.homeTeam.shortName} <Text style={st.v}>v</Text> {f.awayTeam.shortName}
                      </Text>
                      {f.awayTeam.crest ? <Image source={{ uri: f.awayTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                    </View>
                    <View style={st.timeCol}>
                      <Text style={st.time}>{formatTime(f.kickoff)}</Text>
                      <Text style={st.countdown}>{countdownToKickoff(f.kickoff)}</Text>
                    </View>
                    {canVoteOnFixture(f) ? (
                      <View style={st.voteChip}><Text style={st.voteChipText}>Vote</Text></View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}

            {/* Results */}
            {recent.length > 0 && (
              <View>
                <Text style={[st.dayLabel, st.dayLabelResults]}>Results</Text>
                {recent.map((f) => (
                  <Pressable key={f.id} style={[st.row, st.rowResult]} onPress={() => openMatch(f)}>
                    <View style={st.rowTeams}>
                      {f.homeTeam.crest ? <Image source={{ uri: f.homeTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                      <Text style={[st.teams, f.score.winner === "HOME_TEAM" && st.winner]} numberOfLines={1}>
                        {f.homeTeam.shortName}
                      </Text>
                      <Text style={st.resultScore}>{f.score.home ?? "–"}–{f.score.away ?? "–"}</Text>
                      <Text style={[st.teams, f.score.winner === "AWAY_TEAM" && st.winner]} numberOfLines={1}>
                        {f.awayTeam.shortName}
                      </Text>
                      {f.awayTeam.crest ? <Image source={{ uri: f.awayTeam.crest }} style={st.crest} contentFit="contain" /> : null}
                    </View>
                    <View style={st.ftBadge}><Text style={st.ftText}>FT</Text></View>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        // 2D draggable tab
        <Animated.View
          style={[
            st.tab,
            {
              opacity: tabOpacity,
              transform: [{ translateY: dragY }],
              left: tabX,
              top: 0,
            },
          ]}
          {...pan.panHandlers}
        >
          <Pressable
            style={st.tabPressable}
            onPress={() => setOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open World Cup fixtures. Drag to move."
          >
            {liveFixture ? (
              <Animated.View style={[st.tabFlags, { opacity: blinkAnim }]}>
                {liveFixture.homeTeam.crest
                  ? <Image source={{ uri: liveFixture.homeTeam.crest }} style={st.tabFlag} contentFit="contain" />
                  : <View style={st.tabFlagPh}><Text style={st.tabFlagPhText}>{(liveFixture.homeTeam.shortName ?? "?").slice(0, 2)}</Text></View>}
                <Text style={st.tabFlagSep}>·</Text>
                {liveFixture.awayTeam.crest
                  ? <Image source={{ uri: liveFixture.awayTeam.crest }} style={st.tabFlag} contentFit="contain" />
                  : <View style={st.tabFlagPh}><Text style={st.tabFlagPhText}>{(liveFixture.awayTeam.shortName ?? "?").slice(0, 2)}</Text></View>}
              </Animated.View>
            ) : (
              <Image source={trophyAsset} style={st.tabImg} contentFit="contain" />
            )}
            {live.length > 0 ? <View style={st.tabLiveDot} /> : null}
          </Pressable>
          {hintVisible && (
            <View style={st.hint} pointerEvents="none">
              <Text style={st.hintText}>Tap for fixtures</Text>
            </View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function makeStyles(c: {
  card: string; border: string; text: string; subtext: string;
  muted: string; accent: string; section: string;
}) {
  return StyleSheet.create({
    tab: {
      position: "absolute",
      width: TAB_W,
      height: TAB_H,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: -2, height: 2 },
      elevation: 8,
    },
    tabPressable: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
    tabImg: { width: 38, height: 38 },
    tabFlags: { flexDirection: "column", alignItems: "center", gap: 2 },
    tabFlag: { width: 26, height: 26, borderRadius: 13 },
    tabFlagPh: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: c.section, alignItems: "center", justifyContent: "center",
    },
    tabFlagPhText: { fontSize: 9, fontWeight: "700", color: c.muted },
    tabFlagSep: { fontSize: 7, fontWeight: "700", color: c.muted, lineHeight: 8 },
    tabLiveDot: {
      position: "absolute", top: 7, right: 10,
      width: 10, height: 10, borderRadius: 5,
      backgroundColor: "#ef4444", borderWidth: 2, borderColor: c.card,
    },
    hint: {
      position: "absolute",
      right: Math.round(TAB_W * TAB_VISIBLE_FRAC) + 6,
      top: (TAB_H - 28) / 2,
      backgroundColor: "rgba(0,0,0,0.75)",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    hintText: { color: "#fff", fontSize: 11, fontWeight: "600", whiteSpace: "nowrap" } as object,
    card: {
      position: "absolute",
      width: 268,
      maxWidth: "85%",
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
      flexDirection: "row", alignItems: "center",
      paddingVertical: 7, paddingLeft: 10, paddingRight: 6,
      backgroundColor: c.accent,
    },
    title: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
    headTrophy: { width: 22, height: 22 },
    titleText: { color: "#fff", fontWeight: "800", fontSize: 13, flexShrink: 1 },
    iconBtn: {
      width: 28, height: 28, borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center", justifyContent: "center",
    },
    iconBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    body: { maxHeight: 300, padding: 6 },
    row: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingVertical: 7, paddingHorizontal: 8,
      backgroundColor: c.section, borderRadius: 9, marginBottom: 3,
    },
    rowLive: { backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)" },
    rowResult: { backgroundColor: "rgba(100,100,100,0.07)" },
    rowTeams: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
    crest: { width: 16, height: 16, borderRadius: 8 },
    liveBadge: { backgroundColor: "#ef4444", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
    liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
    teams: { flex: 1, minWidth: 0, fontWeight: "700", fontSize: 12, color: c.text },
    winner: { color: c.accent },
    v: { color: c.muted, fontWeight: "600" },
    timeCol: { alignItems: "flex-end" },
    time: { fontSize: 12, fontWeight: "700", color: c.text },
    countdown: { fontSize: 10, fontWeight: "600", color: c.muted },
    resultScore: {
      fontSize: 13, fontWeight: "800", color: c.text,
      paddingHorizontal: 6, textAlign: "center",
    },
    ftBadge: {
      backgroundColor: c.section, borderRadius: 4,
      paddingHorizontal: 5, paddingVertical: 2,
    },
    ftText: { fontSize: 9, fontWeight: "800", color: c.muted },
    dayLabel: {
      fontSize: 10, fontWeight: "800", letterSpacing: 0.4,
      textTransform: "uppercase", color: c.accent,
      marginTop: 4, marginBottom: 3, marginLeft: 4,
    },
    dayLabelResults: { color: c.subtext },
    voteChip: { backgroundColor: c.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    voteChipText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  });
}
