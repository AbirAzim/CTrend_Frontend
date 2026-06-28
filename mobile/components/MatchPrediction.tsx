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
  predictionKnockoutHint,
  predictionPendingExtraTimeMessage,
  predictionPendingShootoutMessage,
  predictionResolvedAfterShootoutNote,
  predictionScoringRuleHint,
} from "@ctrend/shared/lib/matchPredictionCopy";
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
  const { colors } = useTheme();
  const st = makeStyles(colors);

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
  const knockoutHint = predictionKnockoutHint(fixtureStage);
  const scoringRule = predictionScoringRuleHint(fixtureStage);
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
          <Text style={st.roundBadgeText}>{roundBadge}</Text>
        </View>
      ) : null}
      {knockoutHint ? <Text style={st.roundHint}>{knockoutHint}</Text> : null}
      {scoringRule ? <Text style={st.ruleHint}>{scoringRule}</Text> : null}
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
            <Text style={st.teamHome} numberOfLines={2}>{homeLabel}</Text>
            <View style={st.scoreCluster}>
              <Text style={st.scoreNum}>{mine.homeScore}</Text>
              <Text style={st.dash}>–</Text>
              <Text style={st.scoreNum}>{mine.awayScore}</Text>
            </View>
            <Text style={st.teamAway} numberOfLines={2}>{awayLabel}</Text>
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
              <Text style={st.teamHome} numberOfLines={2}>{homeLabel}</Text>
              <View style={st.scoreCluster}>
                <TextInput
                  style={st.input}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={home}
                  placeholder="–"
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setHome(v.replace(/[^0-9]/g, ""))}
                />
                <Text style={st.dash}>–</Text>
                <TextInput
                  style={st.input}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={away}
                  placeholder="–"
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setAway(v.replace(/[^0-9]/g, ""))}
                />
              </View>
              <Text style={st.teamAway} numberOfLines={2}>{awayLabel}</Text>
            </View>
            <View style={st.formActions}>
              <Pressable style={st.submitBtn} onPress={() => void onSubmit()} disabled={submitting}>
                <Text style={st.submitText}>{mine ? "Save" : "Predict"}</Text>
              </Pressable>
              {editing ? (
                <Pressable onPress={() => setEditing(false)} hitSlop={6}>
                  <Text style={st.link}>Cancel</Text>
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
          {showResolvedPenNote ? (
            <Text style={st.penNote}>{predictionResolvedAfterShootoutNote()}</Text>
          ) : null}
          <Pressable style={st.winnersBtn} onPress={() => setListMode("winners")}>
            <Text style={st.winnersText}>🏆 Prediction winners</Text>
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

function makeStyles(c: ColorPalette) {
  const accentSoft = `${c.accent}1a`;
  const accentBorder = `${c.accent}24`;
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 6,
    },
    roundBadge: {
      alignSelf: "flex-start",
      backgroundColor: "rgba(245,158,11,0.16)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: "rgba(245,158,11,0.35)",
    },
    roundBadgeText: { fontSize: 11, fontWeight: "800", color: "#d97706" },
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
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 44,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: accentSoft,
      borderWidth: 1,
      borderColor: accentBorder,
    },
    rowForm: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 8,
    },
    rowHint: {
      backgroundColor: c.section,
      borderColor: c.border,
    },
    matchCore: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minWidth: 0,
    },
    teamHome: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: c.text,
      textAlign: "right",
      lineHeight: 16,
    },
    teamAway: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: c.text,
      textAlign: "left",
      lineHeight: 16,
    },
    scoreCluster: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
    },
    formActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
      flexWrap: "wrap",
    },
    scoreNum: {
      fontSize: 17,
      fontWeight: "900",
      color: c.accent,
      minWidth: 18,
      textAlign: "center",
    },
    dash: { color: c.muted, fontWeight: "800", fontSize: 14 },
    input: {
      width: 34,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "800",
      color: c.text,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: accentBorder,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 2,
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
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    submitText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    link: { fontSize: 13, fontWeight: "700", color: c.accent },
    rowTail: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
      paddingLeft: 10,
      borderLeftWidth: 1,
      borderLeftColor: `${c.text}1a`,
    },
    countBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: accentBorder,
      backgroundColor: accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    countBtnText: {
      fontSize: 12,
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
      backgroundColor: "rgba(245,158,11,0.16)",
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    winnersText: { color: "#d97706", fontSize: 13, fontWeight: "800" },
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
