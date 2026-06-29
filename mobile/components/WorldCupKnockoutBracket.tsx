import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  BRACKET_BOARD_GAP,
  BRACKET_CARD_H,
  BRACKET_CENTER_CARD_H,
  BRACKET_CENTER_W,
  BRACKET_COL_W,
  BRACKET_CONN_W,
  BRACKET_STAGE_META,
  type BracketFixture,
  type BracketSlot,
  type BracketTeam,
  bracketBoardHeight,
  bracketBoardWidth,
  bracketChampionshipWidth,
  bracketFinalCenterY,
  bracketSemiCenterY,
  bracketSlotCenterY,
  bracketSlotTop,
  bracketTeamLabel,
  bracketThirdCenterY,
  bracketTreeHeight,
  bracketWinnerSide,
  buildKnockoutBracket,
  isBracketFinished,
  isBracketLive,
  isBracketSynthetic,
  isBracketTeamKnown,
} from "@ctrend/shared/lib/knockoutBracket";
import { useTheme } from "../context/ThemeContext";
import type { WcFixture } from "../lib/worldCupFixtures";

const TREE_H = bracketTreeHeight();
const BOARD_W = bracketBoardWidth();
const BOARD_H = bracketBoardHeight();
const SIDE_STAGES = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS"] as const;

type Palette = ReturnType<typeof useTheme>["colors"];

function stageFootnote(stage: string): string | null {
  if (stage === "SEMI_FINALS") return "Win → Final · Lose → 3rd";
  if (stage === "FINAL") return "Semi winners only";
  if (stage === "THIRD_PLACE") return "Semi losers only";
  return null;
}

function BracketCrest({ team, st }: { team: BracketTeam; st: ReturnType<typeof makeStyles> }) {
  const label = bracketTeamLabel(team);
  if (!isBracketTeamKnown(team) || !team.crest) {
    return (
      <View style={st.crestPh}>
        <Text style={st.crestPhText}>{label === "TBD" ? "?" : label.slice(0, 2).toUpperCase()}</Text>
      </View>
    );
  }
  return <Image source={{ uri: team.crest }} style={st.crest} contentFit="contain" />;
}

function BracketTeamsBody({
  home,
  away,
  homeWin,
  awayWin,
  hasScore,
  homeScore,
  awayScore,
  st,
}: {
  home: BracketTeam;
  away: BracketTeam;
  homeWin: boolean;
  awayWin: boolean;
  hasScore: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
  st: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={st.cardBody}>
      <View style={[st.teamCell, homeWin && st.teamCellWin]}>
        <BracketCrest team={home} st={st} />
        <Text style={[st.teamName, homeWin && st.teamNameWin]} numberOfLines={2}>
          {bracketTeamLabel(home)}
        </Text>
        {hasScore ? (
          <Text style={[st.cellScore, homeWin && st.cellScoreWin]}>{homeScore ?? "–"}</Text>
        ) : null}
      </View>
      <View style={st.vsCol}>
        {hasScore ? <Text style={st.scoreDot}>:</Text> : <Text style={st.vs}>VS</Text>}
      </View>
      <View style={[st.teamCell, awayWin && st.teamCellWin]}>
        <BracketCrest team={away} st={st} />
        <Text style={[st.teamName, awayWin && st.teamNameWin]} numberOfLines={2}>
          {bracketTeamLabel(away)}
        </Text>
        {hasScore ? (
          <Text style={[st.cellScore, awayWin && st.cellScoreWin]}>{awayScore ?? "–"}</Text>
        ) : null}
      </View>
    </View>
  );
}

function BracketFixtureCard({
  fixture,
  label,
  stage,
  stageColor,
  onOpen,
  st,
}: {
  fixture: BracketFixture;
  label: string;
  stage: string;
  stageColor: string;
  onOpen: (id: string) => void;
  st: ReturnType<typeof makeStyles>;
}) {
  const live = isBracketLive(fixture);
  const finished = isBracketFinished(fixture);
  const winner = bracketWinnerSide(fixture);
  const hasScore = live || finished;
  const footnote = stageFootnote(stage);
  const clickable = (live || finished) && !isBracketSynthetic(fixture);

  const card = (
    <View
      style={[
        st.card,
        live && st.cardLive,
        stage === "FINAL" && st.cardFinal,
        stage === "THIRD_PLACE" && st.cardThird,
      ]}
    >
      <View style={[st.cardHead, { borderTopColor: stageColor }]}>
        <View style={st.cardHeadText}>
          <Text style={[st.cardLabel, { color: stageColor }]}>{label}</Text>
          {footnote ? <Text style={st.cardFootnote}>{footnote}</Text> : null}
        </View>
        {live ? (
          <View style={st.livePill}>
            <Text style={st.livePillText}>LIVE</Text>
          </View>
        ) : null}
        {finished && !live ? (
          <View style={st.ftPill}>
            <Text style={st.ftPillText}>FT</Text>
          </View>
        ) : null}
      </View>
      <BracketTeamsBody
        home={fixture.homeTeam}
        away={fixture.awayTeam}
        homeWin={winner === "home"}
        awayWin={winner === "away"}
        hasScore={hasScore}
        homeScore={fixture.score?.home}
        awayScore={fixture.score?.away}
        st={st}
      />
    </View>
  );

  if (!clickable) return card;
  return (
    <Pressable onPress={() => onOpen(fixture.id)} style={st.cardPress}>
      {card}
    </Pressable>
  );
}

function BracketMatchCard({
  slot,
  onOpen,
  st,
}: {
  slot: BracketSlot;
  onOpen: (id: string) => void;
  st: ReturnType<typeof makeStyles>;
}) {
  const fixture = slot.fixture;
  const stageMeta = BRACKET_STAGE_META[slot.stage as keyof typeof BRACKET_STAGE_META];
  const tbd: BracketTeam = { name: null, shortName: null, crest: null };
  const stageColor = stageMeta?.color ?? "#6366f1";

  if (!fixture) {
    return (
      <View style={[st.card, st.cardEmpty]}>
        <View style={[st.cardHead, { borderTopColor: stageColor }]}>
          <View style={st.cardHeadText}>
            <Text style={[st.cardLabel, { color: stageColor }]}>{slot.label}</Text>
            {stageFootnote(slot.stage) ? (
              <Text style={st.cardFootnote}>{stageFootnote(slot.stage)}</Text>
            ) : null}
          </View>
        </View>
        <BracketTeamsBody
          home={tbd}
          away={tbd}
          homeWin={false}
          awayWin={false}
          hasScore={false}
          st={st}
        />
      </View>
    );
  }

  return (
    <BracketFixtureCard
      fixture={fixture}
      label={slot.label}
      stage={slot.stage}
      stageColor={stageColor}
      onOpen={onOpen}
      st={st}
    />
  );
}

function BracketColumn({
  stage,
  slots,
  onOpen,
  st,
}: {
  stage: string;
  slots: BracketSlot[];
  onOpen: (id: string) => void;
  st: ReturnType<typeof makeStyles>;
}) {
  const meta = BRACKET_STAGE_META[stage as keyof typeof BRACKET_STAGE_META];
  const count = slots.length;
  const accent = meta?.color ?? "#6366f1";

  return (
    <View style={st.col}>
      <View style={[st.colTitle, { borderBottomColor: accent, backgroundColor: `${accent}22` }]}>
        <Text style={[st.colTitleText, { color: accent }]}>{meta?.label ?? stage}</Text>
      </View>
      <View style={{ height: TREE_H }}>
        {slots.map((slot) => (
          <View
            key={`${stage}-${slot.index}`}
            style={{
              position: "absolute",
              top: bracketSlotTop(slot.index, count),
              left: 0,
              right: 0,
              height: BRACKET_CARD_H,
            }}
          >
            <BracketMatchCard slot={slot} onOpen={onOpen} st={st} />
          </View>
        ))}
      </View>
    </View>
  );
}

function BracketConnector({
  fromCount,
  toCount,
  side,
  isDark,
}: {
  fromCount: number;
  toCount: number;
  side: "left" | "right";
  isDark: boolean;
}) {
  const paths: string[] = [];
  for (let i = 0; i < toCount; i++) {
    const yParent = bracketSlotCenterY(i, toCount);
    const yA = bracketSlotCenterY(i * 2, fromCount);
    const yB = bracketSlotCenterY(i * 2 + 1, fromCount);
    if (side === "left") {
      paths.push(`M 0 ${yA} H 9 V ${yParent} H 18`);
      paths.push(`M 0 ${yB} H 9 V ${yParent}`);
    } else {
      paths.push(`M 18 ${yA} H 9 V ${yParent} H 0`);
      paths.push(`M 18 ${yB} H 9 V ${yParent}`);
    }
  }

  return (
    <View style={{ width: BRACKET_CONN_W }}>
      <View style={{ height: 36 }} />
      <Svg width={BRACKET_CONN_W} height={TREE_H} viewBox={`0 0 18 ${TREE_H}`} preserveAspectRatio="none">
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke={isDark ? "rgba(148,163,184,0.55)" : "#94a3b8"} strokeWidth={1.5} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

function BracketSide({
  columns,
  onOpen,
  side,
  st,
  isDark,
}: {
  columns: BracketSlot[][];
  onOpen: (id: string) => void;
  side: "left" | "right";
  st: ReturnType<typeof makeStyles>;
  isDark: boolean;
}) {
  const counts = [8, 4, 2, 1];
  const stages = side === "left" ? [...SIDE_STAGES] : [...SIDE_STAGES].reverse();

  return (
    <View style={st.side}>
      {stages.map((stage, idx) => {
        const stageIdx = SIDE_STAGES.indexOf(stage);
        let connector: ReactNode = null;
        if (idx > 0) {
          const prevIdx = SIDE_STAGES.indexOf(stages[idx - 1]!);
          const fromCount = side === "left" ? counts[prevIdx]! : counts[stageIdx]!;
          const toCount = side === "left" ? counts[stageIdx]! : counts[prevIdx]!;
          connector = (
            <BracketConnector
              key={`conn-${stage}`}
              fromCount={fromCount}
              toCount={toCount}
              side={side}
              isDark={isDark}
            />
          );
        }
        return (
          <Fragment key={stage}>
            {connector}
            <BracketColumn stage={stage} slots={columns[stageIdx] ?? []} onOpen={onOpen} st={st} />
          </Fragment>
        );
      })}
    </View>
  );
}

function BracketChampionshipZone({
  slots,
  onOpen,
  st,
}: {
  slots: BracketSlot[];
  onOpen: (id: string) => void;
  st: ReturnType<typeof makeStyles>;
}) {
  const finalSlot = slots.find((s) => s.stage === "FINAL");
  const thirdSlot = slots.find((s) => s.stage === "THIRD_PLACE");
  const sfY = bracketSemiCenterY();
  const finalY = bracketFinalCenterY();
  const thirdY = bracketThirdCenterY();
  const hubW = bracketChampionshipWidth();
  const midX = hubW / 2;
  const cardLeft = (hubW - BRACKET_CENTER_W) / 2;
  const cardRight = cardLeft + BRACKET_CENTER_W;

  const winnerPaths = [
    `M 0 ${sfY} H ${cardLeft - 6} V ${finalY} H ${midX}`,
    `M ${hubW} ${sfY} H ${cardRight + 6} V ${finalY} H ${midX}`,
  ];
  const loserPaths = [
    `M 0 ${sfY} H ${cardLeft - 10} V ${thirdY} H ${midX}`,
    `M ${hubW} ${sfY} H ${cardRight + 10} V ${thirdY} H ${midX}`,
  ];

  return (
    <View style={{ width: hubW }}>
      <View style={st.champHead}>
        <Text style={st.champTitle}>Road to the Trophy</Text>
        <Text style={st.champSub}>Winners → Final · Losers → Bronze</Text>
      </View>
      <View style={{ height: TREE_H, justifyContent: "center" }}>
        <Svg
          width={hubW}
          height={TREE_H}
          viewBox={`0 0 ${hubW} ${TREE_H}`}
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          {winnerPaths.map((d, i) => (
            <Path key={`w-${i}`} d={d} stroke="#d97706" strokeWidth={2.5} fill="none" opacity={0.88} />
          ))}
          {loserPaths.map((d, i) => (
            <Path
              key={`l-${i}`}
              d={d}
              stroke="#78716c"
              strokeWidth={2}
              fill="none"
              opacity={0.72}
              strokeDasharray="5 4"
            />
          ))}
        </Svg>
        <View style={[st.champStack, { width: BRACKET_CENTER_W, alignSelf: "center" }]}>
          {finalSlot ? (
            <View style={{ minHeight: BRACKET_CENTER_CARD_H }}>
              <BracketMatchCard slot={finalSlot} onOpen={onOpen} st={st} />
            </View>
          ) : null}
          <View style={st.centerBridge}>
            <View style={[st.bridgeLine, st.bridgeLineWin]} />
            <Text style={st.bridgeLabel}>Semi losers ↓</Text>
            <View style={[st.bridgeLine, st.bridgeLineLose]} />
          </View>
          {thirdSlot ? (
            <View style={{ minHeight: BRACKET_CENTER_CARD_H }}>
              <BracketMatchCard slot={thirdSlot} onOpen={onOpen} st={st} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function clampPan(
  tx: number,
  ty: number,
  scale: number,
  viewportW: number,
  viewportH: number,
) {
  "worklet";
  const contentW = BOARD_W * scale;
  const contentH = BOARD_H * scale;
  const maxX = Math.max(0, (contentW - viewportW) / 2);
  const maxY = Math.max(0, (contentH - viewportH) / 2);
  return {
    x: Math.min(Math.max(tx, -maxX), maxX),
    y: Math.min(Math.max(ty, -maxY), maxY),
  };
}

function BracketZoomViewport({
  viewportW,
  viewportH,
  children,
}: {
  viewportW: number;
  viewportH: number;
  children: ReactNode;
}) {
  const baseScale = viewportW > 0 && viewportH > 0 ? Math.min(viewportW / BOARD_W, viewportH / BOARD_H) : 1;
  const minScale = baseScale * 0.92;
  const maxScale = Math.max(baseScale * 3.5, 2);

  const scale = useSharedValue(baseScale);
  const savedScale = useSharedValue(baseScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    scale.value = baseScale;
    savedScale.value = baseScale;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [baseScale, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, minScale), maxScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < baseScale) {
        scale.value = withTiming(baseScale);
        savedScale.value = baseScale;
      }
      const clamped = clampPan(translateX.value, translateY.value, scale.value, viewportW, viewportH);
      translateX.value = withTiming(clamped.x);
      translateY.value = withTiming(clamped.y);
      savedTranslateX.value = clamped.x;
      savedTranslateY.value = clamped.y;
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      const clamped = clampPan(
        savedTranslateX.value + e.translationX,
        savedTranslateY.value + e.translationY,
        scale.value,
        viewportW,
        viewportH,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomedIn = scale.value > baseScale * 1.08;
      const next = zoomedIn ? baseScale : Math.min(baseScale * 2, maxScale);
      scale.value = withTiming(next);
      savedScale.value = next;
      if (zoomedIn) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(doubleTapGesture, panGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width: viewportW, height: viewportH, overflow: "hidden" }}>
      <GestureDetector gesture={composedGesture}>
        <View style={zoomStyles.stage}>
          <Animated.View style={[{ width: BOARD_W, height: BOARD_H }, animatedStyle]}>{children}</Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const zoomStyles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export function WorldCupKnockoutBracket({
  fixtures,
  onOpenMatch,
  viewportSize,
  zoomable = false,
}: {
  fixtures: WcFixture[];
  onOpenMatch: (id: string) => void;
  viewportSize?: { width: number; height: number };
  zoomable?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const bracket = useMemo(() => buildKnockoutBracket(fixtures as BracketFixture[]), [fixtures]);
  const hasKnockout = fixtures.some((f) => f.stage !== "GROUP_STAGE");
  const viewportW = viewportSize?.width ?? width;
  const viewportH = viewportSize?.height ?? height;
  const useZoom = zoomable && viewportW > 0 && viewportH > 0;

  if (!hasKnockout) {
    return (
      <Text style={st.statusMsg}>
        Knockout fixtures are not available yet. They will appear once the group stage ends.
      </Text>
    );
  }

  const board = (
    <View style={st.board}>
      <BracketSide columns={bracket.left} onOpen={onOpenMatch} side="left" st={st} isDark={isDark} />
      <BracketChampionshipZone slots={bracket.center} onOpen={onOpenMatch} st={st} />
      <BracketSide columns={bracket.right} onOpen={onOpenMatch} side="right" st={st} isDark={isDark} />
    </View>
  );

  if (useZoom) {
    return (
      <View style={st.zoomWrap}>
        <BracketZoomViewport viewportW={viewportW} viewportH={viewportH}>
          {board}
        </BracketZoomViewport>
        <Text style={st.zoomHint}>
          {isLandscape
            ? "Pinch to zoom · drag to pan · double-tap to reset"
            : "Pinch to zoom · rotate for wider view"}
        </Text>
      </View>
    );
  }

  return board;
}

function makeStyles(c: Palette, isDark: boolean) {
  return StyleSheet.create({
    statusMsg: { color: c.muted, fontSize: 13, textAlign: "center", paddingVertical: 24 },
    zoomWrap: { flex: 1 },
    zoomHint: {
      position: "absolute",
      bottom: 8,
      alignSelf: "center",
      fontSize: 10,
      fontWeight: "700",
      color: c.muted,
      opacity: 0.85,
      backgroundColor: isDark ? "rgba(15,23,42,0.72)" : "rgba(255,255,255,0.82)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      overflow: "hidden",
    },
    board: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "center",
      gap: BRACKET_BOARD_GAP,
      width: BOARD_W,
      height: BOARD_H,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: isDark ? "rgba(15,23,42,0.72)" : "#f2f1f4",
      borderWidth: 1,
      borderColor: c.border,
    },
    side: { flexDirection: "row", alignItems: "flex-start" },
    connector: { width: BRACKET_CONN_W },
    col: { width: BRACKET_COL_W },
    colTitle: {
      height: 38,
      justifyContent: "center",
      alignItems: "center",
      borderBottomWidth: 3,
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
    },
    colTitleText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
    cardPress: { flex: 1 },
    card: {
      flex: 1,
      backgroundColor: "#fff",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(15,23,42,0.1)",
      overflow: "hidden",
    },
    cardEmpty: { borderStyle: "dashed", borderColor: "rgba(100,116,139,0.45)", backgroundColor: "#f8fafc" },
    cardLive: { borderWidth: 2, borderColor: "rgba(239,68,68,0.85)" },
    cardFinal: { borderWidth: 2, borderColor: "rgba(217,119,6,0.45)" },
    cardThird: {},
    cardHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingVertical: 6,
      backgroundColor: "#f8fafc",
      borderTopWidth: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#e2e8f0",
    },
    cardHeadText: { flex: 1, gap: 2 },
    cardLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
    cardFootnote: { fontSize: 9, fontWeight: "700", color: "#475569" },
    livePill: { backgroundColor: "#ef4444", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
    livePillText: { color: "#fff", fontSize: 8, fontWeight: "800" },
    ftPill: { backgroundColor: "#e2e8f0", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
    ftPillText: { color: "#334155", fontSize: 8, fontWeight: "800" },
    cardBody: { flex: 1, flexDirection: "row", alignItems: "stretch", gap: 4, padding: 5 },
    teamCell: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      padding: 4,
      borderRadius: 6,
      backgroundColor: "#f8fafc",
      borderWidth: 1,
      borderColor: "#e2e8f0",
    },
    teamCellWin: { backgroundColor: "#eef2ff", borderColor: "#a5b4fc" },
    teamName: { fontSize: 11, fontWeight: "800", color: "#0f172a", textAlign: "center" },
    teamNameWin: { color: "#312e81" },
    crest: { width: 26, height: 18 },
    crestPh: {
      width: 26,
      height: 18,
      borderRadius: 3,
      backgroundColor: "#cbd5e1",
      borderWidth: 1,
      borderColor: "#94a3b8",
      alignItems: "center",
      justifyContent: "center",
    },
    crestPhText: { fontSize: 8, fontWeight: "800", color: "#334155" },
    vsCol: { width: 26, alignItems: "center", justifyContent: "center" },
    vs: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "#e2e8f0",
      borderWidth: 1,
      borderColor: "#94a3b8",
      textAlign: "center",
      lineHeight: 24,
      fontSize: 8,
      fontWeight: "800",
      color: "#334155",
      overflow: "hidden",
    },
    scoreDot: { fontSize: 14, fontWeight: "900", color: "#64748b" },
    cellScore: { fontSize: 13, fontWeight: "800", color: "#334155" },
    cellScoreWin: { color: "#4338ca" },
    champHead: {
      alignItems: "center",
      paddingBottom: 8,
      borderBottomWidth: 3,
      borderBottomColor: "#d97706",
      backgroundColor: "rgba(251,191,36,0.18)",
      borderTopLeftRadius: 8,
      borderTopRightRadius: 8,
      paddingTop: 6,
    },
    champTitle: { fontSize: 11, fontWeight: "800", color: isDark ? "#fbbf24" : "#92400e", letterSpacing: 0.5 },
    champSub: { fontSize: 9, fontWeight: "700", color: isDark ? "rgba(248,250,252,0.72)" : "#57534e", marginTop: 2 },
    champStack: { gap: 0 },
    centerBridge: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
    bridgeLine: { flex: 1, height: 0, borderTopWidth: 2 },
    bridgeLineWin: { borderTopColor: "rgba(217,119,6,0.75)" },
    bridgeLineLose: { borderTopColor: "rgba(120,113,108,0.65)", borderStyle: "dashed" },
    bridgeLabel: {
      fontSize: 9,
      fontWeight: "800",
      color: isDark ? "#e7e5e4" : "#44403c",
      backgroundColor: "rgba(168,162,158,0.22)",
      borderWidth: 1,
      borderColor: "rgba(120,113,108,0.45)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
      overflow: "hidden",
    },
  });
}
