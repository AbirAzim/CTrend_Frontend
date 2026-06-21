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
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";

type PredUser = { id: string; username?: string | null; displayName?: string | null; profileImageUrl?: string | null };
type Prediction = { id: string; homeScore: number; awayScore: number; isWinner: boolean; user?: PredUser | null };
type StateData = {
  matchPredictionState: {
    count: number;
    predictionsOpen: boolean;
    predictionsResolved: boolean;
    myPrediction: Prediction | null;
  };
};

function predName(u?: PredUser | null): string {
  if (!u) return "User";
  return u.displayName?.trim() || (u.username ? `@${u.username.trim()}` : "User");
}

export function MatchPrediction({
  postId,
  homeTeam,
  awayTeam,
  enabled,
}: {
  postId: string;
  homeTeam: string;
  awayTeam: string;
  enabled: boolean;
}) {
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const st = makeStyles(colors);

  const { data, refetch } = useQuery<StateData>(MATCH_PREDICTION_STATE, {
    variables: { postId },
    skip: !enabled,
    fetchPolicy: "cache-and-network",
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

  const state = data?.matchPredictionState;
  if (!enabled || !state) return null;

  const mine = state.myPrediction;
  const open = state.predictionsOpen;
  const resolved = state.predictionsResolved;
  const count = state.count;
  const formOpen = open && (editing || !mine);

  function startEdit() {
    setHome(mine ? String(mine.homeScore) : "");
    setAway(mine ? String(mine.awayScore) : "");
    setError(null);
    setEditing(true);
  }

  async function onSubmit() {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      setError("Enter a score for both teams.");
      return;
    }
    setError(null);
    try {
      await submit({ variables: { postId, homeScore: h, awayScore: a } });
      setEditing(false);
      void refetch();
    } catch {
      setError("Couldn't save your prediction.");
    }
  }

  async function onDelete() {
    try {
      await remove({ variables: { postId } });
      setEditing(false);
      void refetch();
    } catch {
      setError("Couldn't delete your prediction.");
    }
  }

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text style={st.title}>🎯 Score prediction</Text>
        {count > 0 ? (
          <Pressable onPress={() => setListMode("all")} hitSlop={8}>
            <Text style={st.count}>{count} {count === 1 ? "prediction" : "predictions"}</Text>
          </Pressable>
        ) : null}
      </View>

      {mine && !formOpen ? (
        <View style={st.mine}>
          <Text style={st.score}>
            {homeTeam} <Text style={st.scoreNum}>{mine.homeScore}</Text> – <Text style={st.scoreNum}>{mine.awayScore}</Text> {awayTeam}
          </Text>
          {resolved ? (
            <View style={[st.tag, mine.isWinner ? st.tagWin : st.tagMiss]}>
              <Text style={[st.tagText, { color: mine.isWinner ? "#16a34a" : colors.muted }]}>{mine.isWinner ? "✓ Correct" : "Missed"}</Text>
            </View>
          ) : open ? (
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
          ) : (
            <Text style={st.locked}>Locked</Text>
          )}
        </View>
      ) : null}

      {formOpen ? (
        isAuthenticated ? (
          <View style={st.form}>
            <Text style={st.team} numberOfLines={1}>{homeTeam}</Text>
            <TextInput
              style={st.input}
              keyboardType="number-pad"
              maxLength={2}
              value={home}
              onChangeText={(v) => setHome(v.replace(/[^0-9]/g, ""))}
              placeholder="0"
              placeholderTextColor={colors.muted}
            />
            <Text style={st.dash}>–</Text>
            <TextInput
              style={st.input}
              keyboardType="number-pad"
              maxLength={2}
              value={away}
              onChangeText={(v) => setAway(v.replace(/[^0-9]/g, ""))}
              placeholder="0"
              placeholderTextColor={colors.muted}
            />
            <Text style={st.team} numberOfLines={1}>{awayTeam}</Text>
            <Pressable style={st.submitBtn} onPress={() => void onSubmit()} disabled={submitting}>
              <Text style={st.submitText}>{mine ? "Save" : "Predict"}</Text>
            </Pressable>
            {editing ? (
              <Pressable onPress={() => setEditing(false)} hitSlop={6}><Text style={st.link}>Cancel</Text></Pressable>
            ) : null}
          </View>
        ) : (
          <Text style={st.hint}>Log in to predict the score.</Text>
        )
      ) : null}

      {!open && !resolved && !mine ? (
        <Text style={st.hint}>Predictions are locked (match started).</Text>
      ) : null}

      {resolved ? (
        <Pressable style={st.winnersBtn} onPress={() => setListMode("winners")}>
          <Text style={st.winnersText}>🏆 Prediction winners</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={st.error}>{error}</Text> : null}

      <PredictionListModal
        visible={listMode !== null}
        winnersOnly={listMode === "winners"}
        postId={postId}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
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
            <Text style={st.sheetTitle}>{winnersOnly ? "Prediction winners" : "Predictions"} {rows.length ? `(${rows.length})` : ""}</Text>
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
                <Pressable style={st.row} onPress={() => { onClose(); if (p.user) router.push(`/profile/${p.user.id}` as `/${string}`); }}>
                  <View style={st.avatar}>
                    {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={st.avatarText}>{name.replace(/^@/, "").slice(0, 1).toUpperCase()}</Text>}
                  </View>
                  <Text style={st.rowName} numberOfLines={1}>{name}</Text>
                  <Text style={[st.rowScore, p.isWinner && { color: "#16a34a", fontWeight: "800" }]}>{homeTeam} {p.homeScore}–{p.awayScore} {awayTeam}</Text>
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
  return StyleSheet.create({
    wrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
    head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 13, fontWeight: "800", color: c.text },
    count: { fontSize: 12, fontWeight: "700", color: c.accent },
    mine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, backgroundColor: c.section, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    score: { fontSize: 13, color: c.text, flexShrink: 1 },
    scoreNum: { fontWeight: "800", color: c.text },
    tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginLeft: "auto" },
    tagWin: { backgroundColor: "rgba(34,197,94,0.18)" },
    tagMiss: { backgroundColor: c.section },
    tagText: { fontSize: 11, fontWeight: "800" },
    locked: { marginLeft: "auto", fontSize: 12, color: c.muted },
    menuWrap: { marginLeft: "auto", position: "relative" },
    dotsBtn: { paddingHorizontal: 8, paddingVertical: 2 },
    dots: { fontSize: 20, fontWeight: "800", color: c.muted, lineHeight: 20 },
    menu: { position: "absolute", top: 26, right: 0, minWidth: 130, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 4, zIndex: 50, elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    menuItem: { paddingHorizontal: 14, paddingVertical: 9 },
    menuItemText: { fontSize: 14, fontWeight: "600", color: c.text },
    link: { fontSize: 13, fontWeight: "700", color: c.accent },
    form: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    team: { fontSize: 13, fontWeight: "600", color: c.text, maxWidth: 90 },
    input: { width: 46, textAlign: "center", fontSize: 16, fontWeight: "800", color: c.text, backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingVertical: 5 },
    dash: { color: c.muted, fontWeight: "800" },
    submitBtn: { backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
    submitText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    hint: { fontSize: 12, color: c.muted },
    winnersBtn: { alignSelf: "flex-start", backgroundColor: "rgba(245,158,11,0.16)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    winnersText: { color: "#d97706", fontSize: 13, fontWeight: "800" },
    error: { color: "#ef4444", fontSize: 12 },
    // modal
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: { backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 10 },
    sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    sheetTitle: { fontSize: 15, fontWeight: "800", color: c.text },
    sheetClose: { fontSize: 16, color: c.muted, fontWeight: "700" },
    empty: { textAlign: "center", color: c.muted, paddingVertical: 24, fontSize: 13 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    avatar: { width: 34, height: 34, borderRadius: 17, overflow: "hidden", backgroundColor: c.section, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 13, fontWeight: "800", color: c.subtext },
    rowName: { fontSize: 14, color: c.text, flexShrink: 1 },
    rowScore: { fontSize: 12, color: c.muted, marginLeft: "auto" },
  });
}
