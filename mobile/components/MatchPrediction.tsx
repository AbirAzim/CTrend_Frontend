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
import { Ionicons } from "@expo/vector-icons";
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
  suppressRoundBadge = false,
}: {
  postId: string;
  fixtureId?: string | null;
  homeTeam: string;
  awayTeam: string;
  enabled: boolean;
  suppressRoundBadge?: boolean;
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
    open && !resolved && mine && !formOpen ? (
      <View style={st.menuWrap}>
        <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} style={st.dotsBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
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

  const statusChip = resolved && mine?.isWinner ? (
    <View style={[st.chip, st.chipWin]}>
      <Text style={st.chipWinText}>Correct</Text>
    </View>
  ) : resolved && mine ? (
    <View style={[st.chip, st.chipMiss]}>
      <Text style={st.chipMissText}>Missed</Text>
    </View>
  ) : resolved ? (
    <View style={[st.chip, st.chipFinal]}>
      <Text style={st.chipFinalText}>Final</Text>
    </View>
  ) : open ? (
    <View style={[st.chip, st.chipOpen]}>
      <Text style={st.chipOpenText}>Open</Text>
    </View>
  ) : (
    <View style={[st.chip, st.chipLocked]}>
      <Text style={st.chipLockedText}>Locked</Text>
    </View>
  );

  return (
    <View style={st.card}>
      {roundBadge && !suppressRoundBadge ? (
        <View style={st.roundBadge}>
          <Text style={st.roundBadgeIcon}>🏆</Text>
          <Text style={st.roundBadgeText}>{roundBadge}</Text>
        </View>
      ) : null}

      <View style={st.header}>
        <View style={st.headerLeft}>
          <Ionicons name="football-outline" size={15} color={colors.accent} />
          <Text style={st.headerTitle}>Score prediction</Text>
          {statusChip}
        </View>
        <View style={st.headerRight}>
          {countBtn}
          {optionsMenu}
        </View>
      </View>

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
        <View style={st.board}>
          <View style={st.boardTeams}>
            <Text style={st.boardTeam} numberOfLines={2}>{homeLabel}</Text>
            <Text style={st.boardVs}>VS</Text>
            <Text style={[st.boardTeam, st.boardTeamAway]} numberOfLines={2}>{awayLabel}</Text>
          </View>
          <View style={st.scorePill}>
            <Text style={st.scoreBig}>{mine.homeScore}</Text>
            <Text style={st.scoreSep}>:</Text>
            <Text style={st.scoreBig}>{mine.awayScore}</Text>
          </View>
          <Text style={st.boardCaption}>Your prediction</Text>
        </View>
      ) : null}

      {formOpen ? (
        isAuthenticated ? (
          <>
            <View style={st.board}>
              <View style={st.boardTeams}>
                <Text style={st.boardTeam} numberOfLines={2}>{homeLabel}</Text>
                <Text style={st.boardVs}>VS</Text>
                <Text style={[st.boardTeam, st.boardTeamAway]} numberOfLines={2}>{awayLabel}</Text>
              </View>
              <View style={st.inputPill}>
                <TextInput
                  style={[st.input, homeFocused && st.inputFocused]}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={home}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setHome(v.replace(/[^0-9]/g, ""))}
                  onFocus={() => setHomeFocused(true)}
                  onBlur={() => setHomeFocused(false)}
                  selectTextOnFocus
                />
                <Text style={st.scoreSep}>:</Text>
                <TextInput
                  style={[st.input, awayFocused && st.inputFocused]}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={away}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  onChangeText={(v) => setAway(v.replace(/[^0-9]/g, ""))}
                  onFocus={() => setAwayFocused(true)}
                  onBlur={() => setAwayFocused(false)}
                  selectTextOnFocus
                />
              </View>
            </View>
            <View style={st.formActions}>
              <Pressable style={st.primaryBtn} onPress={() => void onSubmit()} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={st.primaryBtnText}>{mine ? "Save prediction" : "Submit prediction"}</Text>
                )}
              </Pressable>
              {editing ? (
                <Pressable
                  style={st.secondaryBtn}
                  onPress={() => setEditing(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Text style={st.secondaryBtnText}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <View style={st.hintCard}>
            <Ionicons name="log-in-outline" size={18} color={colors.muted} />
            <Text style={st.hint}>Log in to predict the score.</Text>
          </View>
        )
      ) : null}

      {!open && !resolved && !mine ? (
        <View style={st.hintCard}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.muted} />
          <Text style={st.hint}>Predictions are locked — match has started.</Text>
        </View>
      ) : null}

      {resolved && !mine && !formOpen ? (
        <View style={st.hintCard}>
          <Ionicons name="checkmark-circle-outline" size={16} color={colors.muted} />
          <Text style={st.hint}>Results are in</Text>
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
  const accentSoft = `${c.accent}14`;
  const accentBorder = `${c.accent}28`;
  const winnerGreen = isDark ? "#34d399" : "#059669";
  const winnerGreenSoft = isDark ? "rgba(52,211,153,0.12)" : "rgba(16,185,129,0.12)";
  const winnerGreenBorder = isDark ? "rgba(52,211,153,0.45)" : "rgba(16,185,129,0.45)";
  return StyleSheet.create({
    card: {
      marginHorizontal: 12,
      marginBottom: 10,
      marginTop: 4,
      padding: 12,
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.section,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    headerLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
      flexWrap: "wrap",
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
    },
    headerTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: c.text,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    chip: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    chipOpen: {
      backgroundColor: accentSoft,
      borderWidth: 1,
      borderColor: accentBorder,
    },
    chipOpenText: { fontSize: 10, fontWeight: "800", color: c.accent },
    chipLocked: {
      backgroundColor: `${c.text}0a`,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipLockedText: { fontSize: 10, fontWeight: "800", color: c.muted },
    chipWin: {
      backgroundColor: "rgba(34,197,94,0.16)",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.35)",
    },
    chipWinText: { fontSize: 10, fontWeight: "800", color: "#16a34a" },
    chipMiss: {
      backgroundColor: `${c.text}0a`,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipMissText: { fontSize: 10, fontWeight: "800", color: c.muted },
    chipFinal: {
      backgroundColor: `${c.text}0a`,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipFinalText: { fontSize: 10, fontWeight: "800", color: c.subtext },
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
    pendingBanner: {
      backgroundColor: "rgba(99,102,241,0.12)",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.25)",
    },
    pendingBannerText: { fontSize: 11, color: c.subtext, lineHeight: 15 },
    board: {
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
    },
    boardTeams: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      gap: 8,
    },
    boardTeam: {
      flex: 1,
      fontSize: 13,
      fontWeight: "800",
      color: c.text,
      textAlign: "left",
      lineHeight: 17,
    },
    boardTeamAway: { textAlign: "right" },
    boardVs: {
      fontSize: 10,
      fontWeight: "800",
      color: c.muted,
      letterSpacing: 0.6,
    },
    scorePill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      minWidth: 120,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: accentBorder,
    },
    scoreBig: {
      fontSize: 28,
      fontWeight: "900",
      color: c.accent,
      minWidth: 28,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    scoreSep: {
      fontSize: 22,
      fontWeight: "300",
      color: c.muted,
      lineHeight: 28,
    },
    boardCaption: {
      fontSize: 11,
      fontWeight: "600",
      color: c.muted,
    },
    inputPill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minWidth: 140,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: accentBorder,
    },
    input: {
      width: 44,
      height: 44,
      textAlign: "center",
      fontSize: 24,
      fontWeight: "900",
      color: c.accent,
      backgroundColor: c.section,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 0,
      paddingHorizontal: 0,
      fontVariant: ["tabular-nums"],
    },
    inputFocused: {
      borderColor: c.accent,
      backgroundColor: c.card,
    },
    formActions: {
      gap: 8,
    },
    primaryBtn: {
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    secondaryBtn: {
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    secondaryBtnText: { fontSize: 13, fontWeight: "700", color: c.subtext },
    hintCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    hint: { fontSize: 12, color: c.muted, flex: 1, lineHeight: 16 },
    penNote: { fontSize: 11, color: c.muted, lineHeight: 15 },
    resultLine: { fontSize: 12, fontWeight: "700", color: c.text, lineHeight: 16 },
    countBtn: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: accentBorder,
      backgroundColor: accentSoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    countBtnText: {
      fontSize: 10,
      fontWeight: "800",
      color: c.accent,
    },
    menuWrap: { position: "relative" },
    dotsBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    menu: {
      position: "absolute",
      top: 36,
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
    winnersBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      width: "100%",
      backgroundColor: winnerGreenSoft,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
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
