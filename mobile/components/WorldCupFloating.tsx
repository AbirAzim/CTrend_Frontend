import { useQuery } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
  isFinished,
  isLive,
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

const CARD_W = 285;
const CARD_APPROX_H = 400;
const STORAGE_KEY = "ctrend_wc_card_y";
const STORAGE_KEY_OPEN = "ctrend_wc_open";

// ─── Mini helpers ─────────────────────────────────────────────────────────────

function MiniCrest({ uri }: { uri?: string | null }) {
  if (!uri) return null;
  return <Image source={{ uri }} style={cr.img} contentFit="contain" />;
}
const cr = StyleSheet.create({ img: { width: 17, height: 17, borderRadius: 9 } });

function DaySep({ label, muted }: { label: string; muted?: boolean }) {
  const { isDark } = useTheme();
  const barC = muted
    ? (isDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.35)")
    : "#3b82f6";
  const txtC = muted
    ? (isDark ? "#94a3b8" : "#64748b")
    : (isDark ? "#60a5fa" : "#2563eb");
  return (
    <View style={ds.row}>
      <View style={[ds.bar, { backgroundColor: barC }]} />
      <Text style={[ds.txt, { color: txtC }]}>{label.toUpperCase()}</Text>
    </View>
  );
}
const ds = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 5 },
  bar: { width: 3, height: 13, borderRadius: 2 },
  txt: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.5 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function WorldCupFloating() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const { height: H } = useWindowDimensions();

  const [visible, setVisible] = useState(false);
  const [, setTick] = useState(0);

  const defaultY = insets.top + 80;
  const cardMinY = insets.top + 6;
  const cardMaxY = Math.max(cardMinY + 60, H - insets.bottom - CARD_APPROX_H - 60);
  // Mini tab has a tighter vertical range
  const miniMinY = insets.top + 50;
  const miniMaxY = H - insets.bottom - 90;

  // ── Shared vertical position (non-native — layout `top`) ─────────────────
  const dragY = useRef(new Animated.Value(defaultY)).current;
  const lastY = useRef(defaultY);

  const cardPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => { Vibration.vibrate(6); },
      onPanResponderMove: (_, g) => {
        dragY.setValue(Math.max(cardMinY, Math.min(cardMaxY, lastY.current + g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const ny = Math.max(cardMinY, Math.min(cardMaxY, lastY.current + g.dy));
        lastY.current = ny;
        Animated.spring(dragY, { toValue: ny, useNativeDriver: false, tension: 90, friction: 11 }).start();
        void AsyncStorage.setItem(STORAGE_KEY, String(ny));
        Vibration.vibrate(6);
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: lastY.current, useNativeDriver: false, tension: 90, friction: 11 }).start();
      },
    }),
  ).current;

  // ── Mini-tab drag (shares dragY / lastY with card) ────────────────────────
  const miniAtEdge = useRef(false);
  const miniPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => { Vibration.vibrate(6); },
      onPanResponderMove: (_, g) => {
        const ry = lastY.current + g.dy;
        dragY.setValue(Math.max(miniMinY, Math.min(miniMaxY, ry)));
        const beyond = ry <= miniMinY || ry >= miniMaxY;
        if (beyond && !miniAtEdge.current) { miniAtEdge.current = true; Vibration.vibrate(12); }
        else if (!beyond && miniAtEdge.current) { miniAtEdge.current = false; }
      },
      onPanResponderRelease: (_, g) => {
        const ny = Math.max(miniMinY, Math.min(miniMaxY, lastY.current + g.dy));
        lastY.current = ny;
        Animated.spring(dragY, { toValue: ny, useNativeDriver: false, tension: 80, friction: 12 }).start();
        void AsyncStorage.setItem(STORAGE_KEY, String(ny));
        Vibration.vibrate(6);
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: lastY.current, useNativeDriver: false, tension: 80, friction: 12 }).start();
      },
    }),
  ).current;

  // ── Slide-in animation (native — transform + opacity) ────────────────────
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Title button glow animation (non-native — color interpolation) ────────
  const glowAnim = useRef(new Animated.Value(0)).current;

  // ── Chevron bounce animation (mini tab hint) ──────────────────────────────
  const chevronBounce = useRef(new Animated.Value(0)).current;

  function animateOpen() {
    void AsyncStorage.setItem(STORAGE_KEY_OPEN, "1");
    setVisible(true);
    slideAnim.setValue(0);
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 72,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }

  function animateClose() {
    void AsyncStorage.setItem(STORAGE_KEY_OPEN, "0");
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }

  const slideX = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [340, 0] });
  const slideOpacity = slideAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1] });
  const slideScale = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

  // ── Blink for live flags ──────────────────────────────────────────────────
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // ── Adaptive countdown tick ───────────────────────────────────────────────
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

  // ── Data ──────────────────────────────────────────────────────────────────
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
  const liveFixture = live[0] ?? null;

  // Auto-open once data loads (default open behaviour)
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (hasAutoOpened.current) return;
    const hasData = live.length > 0 || nextDays.length > 0 || recent.length > 0;
    if (!wcCampaign || !hasData) return;
    hasAutoOpened.current = true;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(STORAGE_KEY_OPEN),
    ]).then(([posVal, openVal]) => {
      if (posVal) {
        const parsed = parseFloat(posVal);
        if (!Number.isNaN(parsed)) {
          const clamped = Math.max(cardMinY, Math.min(cardMaxY, parsed));
          lastY.current = clamped;
          dragY.setValue(clamped);
        }
      }
      // Respect saved preference — only skip auto-open if user explicitly closed it
      if (openVal !== "0") animateOpen();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wcCampaign?.id, live.length, nextDays.length, recent.length]);

  // Blink when live
  useEffect(() => {
    if (!liveFixture) { blinkAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFixture?.id]);

  // Chevron bounce while mini tab is visible — hints "tap to open"
  useEffect(() => {
    chevronBounce.setValue(0);
    if (visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(chevronBounce, { toValue: -6, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(chevronBounce, { toValue: 0, duration: 280, easing: Easing.out(Easing.bounce), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Glow the "open full schedule" button while card is visible
  useEffect(() => {
    glowAnim.setValue(0);
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1100, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0 && recent.length === 0) return null;

  const st = makeStyles(isDark);

  const glowBorderC = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(96,165,250,0.38)", "rgba(147,197,253,0.95)"],
  });
  const glowBgC = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(59,130,246,0.08)", "rgba(59,130,246,0.22)"],
  });

  function openMatch(f: WcFixture) {
    animateClose();
    setTimeout(() => {
      const dest =
        isLive(f) || isFinished(f)
          ? `/world-cup/match/${f.id}`
          : f.campaignPostId
            ? `/post/${f.campaignPostId}`
            : "/world-cup";
      router.push(dest as `/${string}`);
    }, 160);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {visible && (
        // Outer Animated.View: vertical drag (non-native, layout property)
        <Animated.View style={{ position: "absolute", right: 12, top: dragY }}>
          {/* Inner Animated.View: slide + fade (native driver) */}
          <Animated.View
            style={[
              st.card,
              {
                opacity: slideOpacity,
                transform: [{ translateX: slideX }, { scale: slideScale }],
              },
            ]}
          >
            {/* Drag handle strip */}
            <View style={st.handleStrip} {...cardPan.panHandlers}>
              <View style={st.handleBar} />
            </View>

            {/* Header */}
            <View style={st.head}>
              {/* Glowing "open schedule" button */}
              <Animated.View style={[st.titleBtn, { borderColor: glowBorderC, backgroundColor: glowBgC }]}>
                <Pressable
                  style={({ pressed }) => [st.titleBtnInner, pressed && { opacity: 0.82 }]}
                  onPress={() => { animateClose(); setTimeout(() => router.push("/world-cup" as `/${string}`), 160); }}
                >
                  <Image source={trophyAsset} style={st.headTrophy} contentFit="contain" />
                  <View style={st.headTextCol}>
                    <Text style={st.headTitle} numberOfLines={1}>
                      {wcCampaign?.name || "World Cup 2026"}
                    </Text>
                    <Text style={st.headSub}>Tap to open full schedule →</Text>
                  </View>
                </Pressable>
              </Animated.View>
              <Pressable style={st.closeBtn} onPress={animateClose} hitSlop={10}>
                <Text style={st.closeBtnTxt}>✕</Text>
              </Pressable>
            </View>

            {/* Scrollable body */}
            <ScrollView
              style={st.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Live */}
              {live.map((f) => (
                <Pressable key={f.id} style={[st.row, st.rowLive]} onPress={() => openMatch(f)}>
                  <Animated.View style={[st.rowTeams, { opacity: blinkAnim }]}>
                    <MiniCrest uri={f.homeTeam.crest} />
                    <Text style={[st.teamTxt, st.teamBold]}>{f.homeTeam.shortName}</Text>
                  </Animated.View>
                  <View style={st.liveCenter}>
                    <View style={st.livePill}>
                      <View style={st.liveDot} />
                      <Text style={st.livePillTxt}>{liveBadgeLabel(f)}</Text>
                    </View>
                    <Text style={st.liveScore}>{f.score.home ?? 0}–{f.score.away ?? 0}</Text>
                  </View>
                  <Animated.View style={[st.rowTeams, st.rowTeamsRight, { opacity: blinkAnim }]}>
                    <Text style={[st.teamTxt, st.teamBold]}>{f.awayTeam.shortName}</Text>
                    <MiniCrest uri={f.awayTeam.crest} />
                  </Animated.View>
                </Pressable>
              ))}

              {/* Upcoming by day */}
              {nextDays.map((g) => (
                <View key={g.key}>
                  <DaySep label={g.label} />
                  {g.fixtures.map((f) => (
                    <Pressable key={f.id} style={st.row} onPress={() => openMatch(f)}>
                      <View style={st.rowTeams}>
                        <MiniCrest uri={f.homeTeam.crest} />
                        <Text style={st.teamTxt} numberOfLines={1}>{f.homeTeam.shortName}</Text>
                        <Text style={st.vs}>v</Text>
                        <Text style={st.teamTxt} numberOfLines={1}>{f.awayTeam.shortName}</Text>
                        <MiniCrest uri={f.awayTeam.crest} />
                      </View>
                      <View style={st.timeCol}>
                        <Text style={st.time}>{formatTime(f.kickoff)}</Text>
                        <Text style={st.countdown}>{countdownToKickoff(f.kickoff)}</Text>
                      </View>
                      {canVoteOnFixture(f) ? (
                        <View style={st.voteChip}><Text style={st.voteChipTxt}>Vote</Text></View>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ))}

              {/* Results */}
              {recent.length > 0 && (
                <View>
                  <DaySep label="Results" muted />
                  {recent.map((f) => (
                    <Pressable key={f.id} style={[st.row, st.rowResult]} onPress={() => openMatch(f)}>
                      <View style={st.rrHome}>
                        <MiniCrest uri={f.homeTeam.crest} />
                        <Text
                          style={[st.teamTxt, f.score.winner === "home" && st.teamWin]}
                          numberOfLines={1}
                        >
                          {f.homeTeam.shortName}
                        </Text>
                      </View>
                      <View style={st.rrCenter}>
                        <Text style={st.rrScore}>
                          {f.score.home ?? "–"} – {f.score.away ?? "–"}
                        </Text>
                        <Text style={st.rrFT}>FT</Text>
                      </View>
                      <View style={st.rrAway}>
                        <Text
                          style={[st.teamTxt, f.score.winner === "away" && st.teamWin, { textAlign: "right" }]}
                          numberOfLines={1}
                        >
                          {f.awayTeam.shortName}
                        </Text>
                        <MiniCrest uri={f.awayTeam.crest} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={{ height: 10 }} />
            </ScrollView>
          </Animated.View>
        </Animated.View>
      )}

      {/* Draggable trophy tab (shown when card is closed) */}
      {!visible && (
        <Animated.View
          style={[st.miniTabOuter, { top: dragY, right: 0 }]}
          {...miniPan.panHandlers}
        >
          <Pressable style={st.miniTab} onPress={animateOpen} hitSlop={10}>
            <Animated.View style={[st.miniChevronWrap, { transform: [{ translateX: chevronBounce }] }]}>
              <Text style={st.miniChevron}>‹</Text>
            </Animated.View>
            <Image source={trophyAsset} style={st.miniTrophyImg} contentFit="contain" />
            {live.length > 0 && <View style={st.miniDot} />}
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Theme-aware styles ───────────────────────────────────────────────────────

function makeStyles(isDark: boolean) {
  // Card palette
  const cardBg      = isDark ? "#1a2336" : "#ffffff";
  const headBg      = isDark ? "#0f1929" : "#eff6ff";
  const borderC     = isDark ? "rgba(59,130,246,0.24)" : "rgba(59,130,246,0.18)";
  const rowBgC      = isDark ? "rgba(255,255,255,0.05)" : "#f4f8ff";
  const teamTxtC    = isDark ? "#e2e8f0" : "#1e293b";
  const timeTxtC    = isDark ? "#f1f5f9" : "#0f172a";
  const countdownC  = isDark ? "#94a3b8" : "#64748b";
  const vsC         = isDark ? "#4b5563" : "#94a3b8";
  const headTitleC  = isDark ? "#ffffff" : "#1e3a5f";
  const headSubC    = isDark ? "#93c5fd" : "#3b82f6";
  const closeBg     = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)";
  const closeTxtC   = isDark ? "rgba(255,255,255,0.80)" : "#374151";
  const handleBarC  = isDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.28)";
  const rrScoreC    = isDark ? "#f1f5f9" : "#0f172a";
  const rrFTC       = isDark ? "#64748b" : "#94a3b8";

  return StyleSheet.create({
    card: {
      width: CARD_W,
      backgroundColor: cardBg,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: borderC,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.65 : 0.15,
      shadowRadius: 22,
      shadowOffset: { width: -2, height: 6 },
      elevation: 16,
    },
    handleStrip: {
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: headBg,
      borderBottomWidth: 1,
      borderBottomColor: borderC,
    },
    handleBar: { width: 28, height: 3, borderRadius: 2, backgroundColor: handleBarC },
    head: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 8,
      backgroundColor: headBg,
      borderBottomWidth: 1,
      borderBottomColor: borderC,
    },
    titleBtn: {
      flex: 1,
      borderWidth: 1.5,
      borderColor: "rgba(96,165,250,0.40)", // overridden by animated glowBorderC
      borderRadius: 10,
      overflow: "hidden",
      minWidth: 0,
    },
    titleBtnInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    headTrophy: { width: 22, height: 22, flexShrink: 0 },
    headTextCol: { flex: 1, minWidth: 0, gap: 2 },
    headTitle: { color: headTitleC, fontWeight: "800", fontSize: 13, lineHeight: 16 },
    headSub: { color: headSubC, fontSize: 10, fontWeight: "600" },
    closeBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: closeBg,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    closeBtnTxt: { color: closeTxtC, fontSize: 12, fontWeight: "700", lineHeight: 14 },
    body: { maxHeight: 360 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 10,
      backgroundColor: rowBgC,
      marginBottom: 2,
      marginHorizontal: 6,
      borderRadius: 9,
    },
    rowLive: {
      backgroundColor: "rgba(239,68,68,0.09)",
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.28)",
    },
    rowResult: { backgroundColor: "transparent" },
    rowTeams: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
    rowTeamsRight: { justifyContent: "flex-end" },
    teamTxt: { fontSize: 12, fontWeight: "600", color: teamTxtC, flexShrink: 1 },
    teamBold: { fontWeight: "700" },
    teamWin: { color: "#60a5fa", fontWeight: "700" },
    vs: { fontSize: 9.5, fontWeight: "700", color: vsC },
    liveCenter: { alignItems: "center", gap: 2, paddingHorizontal: 6 },
    livePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "rgba(239,68,68,0.15)",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#ef4444" },
    livePillTxt: { fontSize: 9.5, fontWeight: "800", color: "#ef4444" },
    liveScore: { fontSize: 14, fontWeight: "900", color: timeTxtC },
    timeCol: { alignItems: "flex-end", gap: 1, flexShrink: 0 },
    time: { fontSize: 12, fontWeight: "700", color: timeTxtC },
    countdown: { fontSize: 10, fontWeight: "600", color: countdownC },
    voteChip: { backgroundColor: "#3b82f6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 2 },
    voteChipTxt: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
    rrHome: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
    rrCenter: { alignItems: "center", paddingHorizontal: 8, gap: 1, flexShrink: 0 },
    rrAway: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, minWidth: 0 },
    rrScore: { fontSize: 15, fontWeight: "900", color: rrScoreC, letterSpacing: -0.3 },
    rrFT: { fontSize: 9, fontWeight: "700", color: rrFTC },
    // Mini tab (closed state)
    miniTabOuter: {
      position: "absolute",
      width: 70,
      height: 46,
      zIndex: 1001,
    },
    miniTab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 0,
    },
    miniChevronWrap: {
      width: 16,
      height: 46,
      alignItems: "flex-end",
      justifyContent: "flex-start",
      paddingTop: 6,
    },
    miniChevron: {
      fontSize: 22,
      fontWeight: "900",
      color: isDark ? "#93c5fd" : "#3b82f6",
      includeFontPadding: false,
      lineHeight: 22,
    },
    miniTrophyImg: { width: 46, height: 46 },
    miniDot: {
      position: "absolute",
      top: 4,
      right: 2,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: "#ef4444",
    },
  });
}
