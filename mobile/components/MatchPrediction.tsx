import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useQuery, useMutation, useSubscription } from "@apollo/client/react";
import {
  DELETE_MATCH_PREDICTION,
  MATCH_PREDICTION_STATE,
  MATCH_PREDICTION_UPDATED,
  MATCH_PREDICTION_WINNERS,
  MATCH_PREDICTIONS,
  SUBMIT_MATCH_PREDICTION,
} from "@ctrend/shared/graphql/predictions";
import { WORLD_CUP_FIXTURE_DETAILS } from "@ctrend/shared/graphql/worldcup";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../context/AuthContext";
import { useCoins } from "../context/CoinsContext";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import {
  isExtraTimeLiveStatus,
  isKnockoutStage,
  isPredictionResultPending,
  isShootoutLiveStatus,
} from "@ctrend/shared/lib/knockoutFixture";
import {
  knockoutRoundBadgeText,
  predictionPendingExtraTimeMessage,
  predictionPendingShootoutMessage,
  predictionResolvedAfterShootoutNote,
  predictionWinnersButtonLabel,
  PREDICTION_WINNERS_BUTTON_ICON,
} from "@ctrend/shared/lib/matchPredictionCopy";
import { knockoutEffectiveScore } from "@ctrend/shared/lib/matchScoreCopy";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";

type PredUser = { id: string; username?: string | null; displayName?: string | null; profileImageUrl?: string | null };
type Prediction = { id: string; homeScore: number; awayScore: number; isWinner: boolean; user?: PredUser | null };
type StateData = {
  matchPredictionState: {
    count: number;
    predictionsOpen: boolean;
    predictionsResolved: boolean;
    fixtureStage?: string | null;
    predictionsPendingResult?: boolean | null;
    wentToExtraTime?: boolean | null;
    wentToPenalties?: boolean | null;
    myPrediction: Prediction | null;
  };
};

function predName(u?: PredUser | null): string {
  if (!u) return "User";
  return u.displayName?.trim() || (u.username ? `@${u.username.trim()}` : "User");
}

function teamDisplayLabel(
  postLabel: string,
  fixtureTeam?: { name?: string | null; shortName?: string | null } | null,
): string {
  const fromPost = postLabel.trim();
  if (fromPost) return fromPost;
  return fixtureTeam?.shortName?.trim() || fixtureTeam?.name?.trim() || "Team";
}

export function MatchPrediction({
  postId,
  fixtureId,
  homeTeam,
  awayTeam,
  enabled,
}: {
  postId: string;
  fixtureId?: string | null;
  homeTeam: string;
  awayTeam: string;
  enabled: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const { awardCoins } = useCoins();
  const { colors, isDark } = useTheme();
  const st = makeStyles(colors, isDark);

  const { data, refetch } = useQuery<StateData>(MATCH_PREDICTION_STATE, {
    variables: { postId },
    skip: !enabled,
    fetchPolicy: "cache-and-network",
  });
  const { data: fixtureData } = useQuery<{
    worldCupFixture?: {
      stage?: string | null;
      status?: string | null;
      rawStatus?: string | null;
      homeTeam?: { name?: string | null; shortName?: string | null } | null;
      awayTeam?: { name?: string | null; shortName?: string | null } | null;
      fullTime?: { home?: number | null; away?: number | null } | null;
      extraTime?: { home?: number | null; away?: number | null } | null;
      penalty?: { home?: number | null; away?: number | null } | null;
      wentToPenalties?: boolean | null;
      score?: { home?: number | null; away?: number | null } | null;
    } | null;
  }>(WORLD_CUP_FIXTURE_DETAILS, {
    variables: { id: fixtureId! },
    skip: !enabled || !fixtureId,
    fetchPolicy: "cache-first",
  });
  useSubscription(MATCH_PREDICTION_UPDATED, {
    variables: { postId },
    skip: !enabled,
    onData: () => void refetch(),
  });

  const [submit, { loading: submitting }] = useMutation(SUBMIT_MATCH_PREDICTION);
  const [remove, { loading: removing }] = useMutation(DELETE_MATCH_PREDICTION);

  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listMode, setListMode] = useState<null | "all" | "winners">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [homeFocused, setHomeFocused] = useState(false);
  const [awayFocused, setAwayFocused] = useState(false);

  const homeLabel = teamDisplayLabel(homeTeam, fixtureData?.worldCupFixture?.homeTeam);
  const awayLabel = teamDisplayLabel(awayTeam, fixtureData?.worldCupFixture?.awayTeam);

  const state = data?.matchPredictionState;
  if (!enabled || !state) return null;

  const mine = state.myPrediction;
  const open = state.predictionsOpen;
  const resolved = state.predictionsResolved;
  const count = state.count;
  const formOpen = open && (editing || !mine);
  const fixtureStage = state.fixtureStage ?? fixtureData?.worldCupFixture?.stage ?? null;
  const matchStatus = fixtureData?.worldCupFixture?.status ?? null;
  const matchPhase = fixtureData?.worldCupFixture?.rawStatus ?? null;
  const roundBadge = isKnockoutStage(fixtureStage) ? knockoutRoundBadgeText(fixtureStage) : null;
  const pendingResult = isPredictionResultPending(
    resolved,
    matchStatus,
    state.predictionsPendingResult,
    matchPhase,
    fixtureStage,
  );
  const inExtraTime = isExtraTimeLiveStatus(matchStatus, matchPhase);
  const inShootout = isShootoutLiveStatus(matchStatus, matchPhase);
  const showResolvedPenNote =
    isKnockoutStage(fixtureStage) && resolved && Boolean(state.wentToPenalties);
  const gradingScore = fixtureData?.worldCupFixture
    ? knockoutEffectiveScore(fixtureData.worldCupFixture)
    : null;

  function startEdit() {
    setHome(mine != null ? String(mine.homeScore) : "");
    setAway(mine != null ? String(mine.awayScore) : "");
    setError(null);
    setEditing(true);
  }

  async function onSubmit() {
    if (home.trim() === "" || away.trim() === "") {
      setError("Enter a score for both teams.");
      return;
    }
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      setError("Enter a score for both teams.");
      return;
    }
    setError(null);
    const isFirstPrediction = !mine;
    try {
      await submit({ variables: { postId, homeScore: h, awayScore: a } });
      setEditing(false);
      void refetch();
      if (isFirstPrediction) awardCoins(COIN_AMOUNTS.PREDICTION);
    } catch {
      setError("Couldn't save your prediction.");
    }
  }

  async function onDelete() {
    try {
      await remove({ variables: { postId } });
      setEditing(false);
      setHome("");
      setAway("");
      void refetch();
    } catch {
      setError("Couldn't delete your prediction.");
    }
  }

  const countBtn =
    count > 0 ? (
      <Pressable style={st.countBtn} onPress={() => setListMode("all")} hitSlop={6}>
        <Text style={st.countBtnText}>
          {count} {count === 1 ? "prediction" : "predictions"}
        </Text>
      </Pressable>
    ) : null;

  const optionsMenu =
    open && !resolved ? (
      <View style={st.menuWrap}>
        <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={st.dotsBtn}>
          <Text style={st.dots}>⋯</Text>
        </Pressable>
        {menuOpen ? (
          <View style={st.menu}>
            <Pressable style={st.menuItem} onPress={() => { setMenuOpen(false); startEdit(); }}>
              <Text style={st.menuItemText}>Edit</Text>
            </Pressable>
            <Pressable style={st.menuItem} onPress={() => { setMenuOpen(false); void onDelete(); }} disabled={removing}>
              <Text style={[st.menuItemText, { color: "#ef4444" }]}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <View style={st.wrap}>
      {roundBadge ? (
        <View style={st.roundBadge}>
          <Text style={st.roundBadgeIcon}>🏆</Text>
          <Text style={st.roundBadgeText}>{roundBadge}</Text>
        </View>
      ) : null}
      {pendingResult && inExtraTime ? (
        <View style={st.pendingBanner}>
          <Text style={st.pendingBannerText}>{predictionPendingExtraTimeMessage()}</Text>
        </View>
      ) : null}
      {pendingResult && inShootout ? (
        <View style={st.pendingBanner}>
          <Text style={st.pendingBannerText}>{predictionPendingShootoutMessage()}</Text>
        </View>
      ) : null}

      {mine && !formOpen ? (
        <View style={st.row}>
          <View style={st.matchCore}>
            <Text style={st.teamHome} numberOfLines={1}>{homeLabel}</Text>
            <View style={st.scoreCluster}>
              <Text style={st.scoreNum}>{mine.homeScore}</Text>
              <Text style={st.dash}>–</Text>
              <Text style={st.scoreNum}>{mine.awayScore}</Text>
            </View>
            <Text style={st.teamAway} numberOfLines={1}>{awayLabel}</Text>
          </View>
          {resolved ? (
            <View style={[st.tag, mine.isWinner ? st.tagWin : st.tagMiss]}>
              <Text style={[st.tagText, { color: mine.isWinner ? "#16a34a" : colors.muted }]}>
                {mine.isWinner ? "✓ Correct" : "Missed"}
              </Text>
            </View>
          ) : null}
          {(countBtn || (!resolved && (optionsMenu || !open))) ? (
            <View style={st.rowTail}>
              {countBtn}
              {!resolved ? (optionsMenu ?? <Text style={st.locked}>Locked</Text>) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {formOpen ? (
        isAuthenticated ? (
          <View style={[st.row, st.rowForm]}>
            <View style={st.matchCore}>
              <Text style={st.teamHome} numberOfLines={1}>{homeLabel}</Text>
              <View style={st.scoreBox}>
                <TextInput
                  style={[st.input, homeFocused && st.inputFocused]}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={home}
                  placeholder=""
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setHome(v.replace(/[^0-9]/g, ""))}
                  onFocus={() => setHomeFocused(true)}
                  onBlur={() => setHomeFocused(false)}
                  selectTextOnFocus
                />
                <Text style={st.dash}>–</Text>
                <TextInput
                  style={[st.input, awayFocused && st.inputFocused]}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={away}
                  placeholder=""
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setAway(v.replace(/[^0-9]/g, ""))}
                  onFocus={() => setAwayFocused(true)}
                  onBlur={() => setAwayFocused(false)}
                  selectTextOnFocus
                />
              </View>
              <Text style={st.teamAway} numberOfLines={1}>{awayLabel}</Text>
            </View>
            <View style={st.rowTail}>
              <Pressable style={st.submitBtn} onPress={() => void onSubmit()} disabled={submitting}>
                <Text style={st.submitText}>{mine ? "Save" : "Predict"}</Text>
              </Pressable>
              {editing ? (
                <Pressable
                  style={st.cancelBtn}
                  onPress={() => setEditing(false)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Text style={st.cancelBtnText}>Cancel</Text>
                </Pressable>
              ) : null}
              {countBtn}
            </View>
          </View>
        ) : (
          <View style={[st.row, st.rowHint]}>
            <Text style={st.hint}>Log in to predict the score.</Text>
            {countBtn ? <View style={st.rowTail}>{countBtn}</View> : null}
          </View>
        )
      ) : null}

      {!open && !resolved && !mine ? (
        <View style={[st.row, st.rowHint]}>
          <Text style={st.hint}>Predictions are locked (match started).</Text>
          {countBtn ? <View style={st.rowTail}>{countBtn}</View> : null}
        </View>
      ) : null}

      {resolved && !mine && !formOpen ? (
        <View style={[st.row, st.rowHint]}>
          <Text style={st.hint}>Results are in</Text>
          {countBtn ? <View style={st.rowTail}>{countBtn}</View> : null}
        </View>
      ) : null}

      {resolved ? (
        <>
          {gradingScore ? (
            <Text style={st.resultLine}>
              Result after extra time: {homeLabel} {gradingScore.home}–{gradingScore.away} {awayLabel}
            </Text>
          ) : null}
          {showResolvedPenNote ? (
            <Text style={st.penNote}>{predictionResolvedAfterShootoutNote()}</Text>
          ) : null}
          <Pressable
            style={st.winnersBtn}
            onPress={() => setListMode("winners")}
            accessibilityRole="button"
            accessibilityLabel={`${PREDICTION_WINNERS_BUTTON_ICON} ${predictionWinnersButtonLabel()}`}
          >
            <Text style={st.winnersIcon}>{PREDICTION_WINNERS_BUTTON_ICON}</Text>
            <Text style={st.winnersText}>{predictionWinnersButtonLabel()}</Text>
          </Pressable>
        </>
      ) : null}

      {error ? <Text style={st.error}>{error}</Text> : null}

      <PredictionListModal
        visible={listMode !== null}
        winnersOnly={listMode === "winners"}
        postId={postId}
        homeTeam={homeLabel}
        awayTeam={awayLabel}
        colors={colors}
        st={st}
        onClose={() => setListMode(null)}
      />
    </View>
  );
}

function PredictionListModal({
  visible,
  winnersOnly,
  postId,
  homeTeam,
  awayTeam,
  colors,
  st,
  onClose,
}: {
  visible: boolean;
  winnersOnly: boolean;
  postId: string;
  homeTeam: string;
  awayTeam: string;
  colors: ColorPalette;
  st: ReturnType<typeof makeStyles>;
  onClose: () => void;
}) {
  const { data, loading, refetch } = useQuery<{ matchPredictions?: Prediction[]; matchPredictionWinners?: Prediction[] }>(
    winnersOnly ? MATCH_PREDICTION_WINNERS : MATCH_PREDICTIONS,
    { variables: winnersOnly ? { postId } : { postId, take: 200 }, fetchPolicy: "network-only", skip: !visible },
  );
  useSubscription(MATCH_PREDICTION_UPDATED, {
    variables: { postId },
    skip: !visible || winnersOnly,
    onData: () => void refetch(),
  });
  const rows = (winnersOnly ? data?.matchPredictionWinners : data?.matchPredictions) ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.overlay} onPress={onClose}>
        <View style={st.sheet} onStartShouldSetResponder={() => true}>
          <View style={st.handle} />
          <View style={st.sheetHead}>
            <Text style={st.sheetTitle}>
              {winnersOnly ? "Prediction winners" : "Predictions"}
              {rows.length ? ` (${rows.length})` : ""}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={st.sheetClose}>✕</Text></Pressable>
          </View>
          <FlatList
            data={rows}
            keyExtractor={(p) => p.id}
            style={{ height: 340 }}
            ListEmptyComponent={
              loading
                ? <ActivityIndicator style={{ margin: 24 }} color={colors.accent} />
                : <Text style={st.empty}>{winnersOnly ? "No correct predictions." : "No predictions yet."}</Text>
            }
            renderItem={({ item: p }) => {
              const img = normalizeProfileImageUrl(p.user?.profileImageUrl);
              const name = predName(p.user);
              return (
                <Pressable style={st.rowItem} onPress={() => { onClose(); if (p.user) router.push(`/profile/${p.user.id}` as `/${string}`); }}>
                  <View style={st.avatar}>
                    {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={st.avatarText}>{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</Text>}
                  </View>
                  <Text style={st.rowName} numberOfLines={1}>{name}</Text>
                  <Text style={[st.rowScore, p.isWinner && { color: "#16a34a", fontWeight: "800" }]}>
                    {homeTeam} {p.homeScore}–{p.awayScore} {awayTeam}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: ColorPalette, isDark: boolean) {
  const accentSoft = `${c.accent}1a`;
  const accentBorder = `${c.accent}24`;
  const winnerGreen = isDark ? "#34d399" : "#059669";
  const winnerGreenSoft = isDark ? "rgba(52,211,153,0.12)" : "rgba(16,185,129,0.12)";
  const winnerGreenBorder = isDark ? "rgba(52,211,153,0.45)" : "rgba(16,185,129,0.45)";
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 5,
    },
    roundBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(245,158,11,0.14)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "rgba(245,158,11,0.35)",
    },
    roundBadgeIcon: { fontSize: 11 },
    roundBadgeText: {
      fontSize: 11,
      fontWeight: "800",
      color: "#d97706",
    },
    roundHint: { fontSize: 11, color: c.muted, lineHeight: 15 },
    ruleHint: { fontSize: 11, color: c.subtext, lineHeight: 15 },
    pendingBanner: {
      backgroundColor: "rgba(99,102,241,0.12)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.25)",
    },
    pendingBannerText: { fontSize: 11, color: c.subtext, lineHeight: 15 },
    penNote: { fontSize: 11, color: c.muted, lineHeight: 15 },
    resultLine: { fontSize: 12, fontWeight: "700", color: c.text, lineHeight: 16 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 34,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: accentSoft,
      borderWidth: 1,
      borderColor: accentBorder,
    },
    rowHint: {
      backgroundColor: c.section,
      borderColor: c.border,
    },
    rowForm: {
      minHeight: 48,
      paddingVertical: 6,
    },
    matchCore: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minWidth: 0,
    },
    teamHome: {
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
      color: c.text,
      textAlign: "right",
      lineHeight: 14,
    },
    teamAway: {
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
      color: c.text,
      textAlign: "left",
      lineHeight: 14,
    },
    scoreCluster: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      flexShrink: 0,
    },
    scoreBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: `${c.accent}55`,
      paddingHorizontal: 8,
      paddingVertical: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    scoreNum: {
      fontSize: 15,
      fontWeight: "900",
      color: c.accent,
      minWidth: 16,
      textAlign: "center",
    },
    dash: { color: c.muted, fontWeight: "800", fontSize: 13 },
    input: {
      width: 34,
      height: 34,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "900",
      color: c.accent,
      backgroundColor: c.section,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    inputFocused: {
      borderColor: c.accent,
      backgroundColor: c.card,
    },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },
    submitBtn: {
      backgroundColor: c.accent,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    submitText: { color: "#fff", fontSize: 11, fontWeight: "800" },
    cancelBtn: {
      minHeight: 32,
      minWidth: 32,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtnText: { fontSize: 11, fontWeight: "800", color: c.subtext },
    rowTail: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
      paddingLeft: 6,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: `${c.text}14`,
    },
    countBtn: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: accentSoft,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    countBtnText: {
      fontSize: 10,
      fontWeight: "800",
      color: c.accent,
    },
    tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
    tagWin: { backgroundColor: "rgba(34,197,94,0.18)" },
    tagMiss: { backgroundColor: c.section },
    tagText: { fontSize: 11, fontWeight: "800" },
    locked: { fontSize: 12, fontWeight: "700", color: c.muted },
    menuWrap: { position: "relative" },
    dotsBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    dots: { fontSize: 20, fontWeight: "800", color: c.muted, lineHeight: 20 },
    menu: {
      position: "absolute",
      top: 26,
      right: 0,
      minWidth: 130,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 4,
      zIndex: 50,
      elevation: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
    menuItemText: { fontSize: 14, fontWeight: "600", color: c.text },
    hint: { fontSize: 12, color: c.muted, flexShrink: 1 },
    winnersBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: winnerGreenSoft,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: winnerGreenBorder,
    },
    winnersText: { color: winnerGreen, fontSize: 13, fontWeight: "800" },
    winnersIcon: { fontSize: 14 },
    error: { color: "#ef4444", fontSize: 12 },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 28,
    },
    handle: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: 10,
    },
    sheetHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    sheetTitle: { fontSize: 15, fontWeight: "800", color: c.text },
    sheetClose: { fontSize: 16, color: c.muted, fontWeight: "700" },
    empty: { textAlign: "center", color: c.muted, paddingVertical: 24, fontSize: 13 },
    rowItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      overflow: "hidden",
      backgroundColor: c.section,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 13, fontWeight: "800", color: c.subtext },
    rowName: { fontSize: 14, color: c.text, flexShrink: 1 },
    rowScore: { fontSize: 12, color: c.muted, marginLeft: "auto", flexShrink: 1 },
  });
}
