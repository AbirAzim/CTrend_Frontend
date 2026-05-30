import { useMutation, useQuery } from "@apollo/client/react";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  WORLD_CUP_FIXTURES,
  SYNC_WORLD_CUP_FIXTURES,
  CREATE_WORLD_CUP_CAMPAIGN_POST,
  PROCESS_MATCH_RESULT,
  CAMPAIGN_WINNERS,
  MARK_CAMPAIGN_PRIZE_PAID,
} from "@ctrend/shared/graphql/worldcup";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

type Team = { name: string; shortName?: string | null; crest?: string | null };
type Score = { home?: number | null; away?: number | null; winner?: string | null };
type Fixture = {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  kickoff: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  score?: Score | null;
  campaignPostId?: string | null;
};
type Winner = {
  id: string;
  fixtureId?: string | null;
  prize?: number | null;
  winningOption?: string | null;
  paid: boolean;
  note?: string | null;
  user?: { username?: string | null; displayName?: string | null; email: string } | null;
};

type FixturesData = { worldCupFixtures: Fixture[] };
type WinnersData = { campaignWinners: Winner[] };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  SCHEDULED: { bg: "rgba(99,102,241,0.1)", text: "#6366f1" },
  LIVE: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
  FINISHED: { bg: "rgba(100,116,139,0.15)", text: "#64748b" },
  POSTPONED: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
};

type Tab = "fixtures" | "winners";

export default function WorldCupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();
  const [tab, setTab] = useState<Tab>("fixtures");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const { data: fixturesData, loading: fixturesLoading, refetch: refetchFixtures } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
  });
  const { data: winnersData, loading: winnersLoading, refetch: refetchWinners } = useQuery<WinnersData>(CAMPAIGN_WINNERS, {
    fetchPolicy: "cache-and-network",
  });

  const [syncMut, { loading: syncing }] = useMutation(SYNC_WORLD_CUP_FIXTURES);
  const [createPostMut] = useMutation(CREATE_WORLD_CUP_CAMPAIGN_POST);
  const [processResultMut] = useMutation(PROCESS_MATCH_RESULT);
  const [markPaidMut] = useMutation(MARK_CAMPAIGN_PRIZE_PAID);

  const fixtures = fixturesData?.worldCupFixtures ?? [];
  const winners = winnersData?.campaignWinners ?? [];

  async function handleSync() {
    Alert.alert("Sync fixtures", "Pull latest fixtures from the football API?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sync",
        onPress: async () => {
          try {
            await syncMut();
            void refetchFixtures();
            showToast("Fixtures synced", "success");
          } catch { showToast("Sync failed", "error"); }
        },
      },
    ]);
  }

  async function handleCreatePost(fixture: Fixture) {
    setCreatingPostId(fixture.id);
    try {
      await createPostMut({ variables: { fixtureId: fixture.id } });
      void refetchFixtures();
      showToast("Campaign post created", "success");
    } catch { showToast("Failed to create post", "error"); }
    finally { setCreatingPostId(null); }
  }

  async function handleProcessResult(fixture: Fixture) {
    Alert.alert(
      "Process result",
      `Process result for ${fixture.homeTeam.shortName ?? fixture.homeTeam.name} vs ${fixture.awayTeam.shortName ?? fixture.awayTeam.name}? This assigns winners.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Process",
          onPress: async () => {
            setProcessingId(fixture.id);
            try {
              await processResultMut({ variables: { fixtureId: fixture.id } });
              void refetchWinners();
              showToast("Result processed", "success");
            } catch { showToast("Failed to process result", "error"); }
            finally { setProcessingId(null); }
          },
        },
      ],
    );
  }

  async function handleMarkPaid(winner: Winner) {
    setMarkingId(winner.id);
    try {
      await markPaidMut({ variables: { winnerId: winner.id } });
      void refetchWinners();
      showToast("Marked as paid", "success");
    } catch { showToast("Failed to mark paid", "error"); }
    finally { setMarkingId(null); }
  }

  const st = makeStyles(colors);

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Tab switch + sync */}
      <View style={[st.toolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={st.tabRow}>
          {(["fixtures", "winners"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              style={[st.tabBtn, tab === t && { backgroundColor: colors.accent + "22", borderColor: colors.accent }]}
              onPress={() => setTab(t)}
            >
              <Text style={[st.tabBtnText, { color: tab === t ? colors.accent : colors.muted }]}>
                {t === "fixtures" ? "⚽ Fixtures" : "🏆 Winners"}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === "fixtures" && (
          <Pressable
            style={[st.syncBtn, syncing && { opacity: 0.6 }]}
            onPress={() => void handleSync()}
            disabled={syncing}
          >
            {syncing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={st.syncBtnText}>↻ Sync</Text>}
          </Pressable>
        )}
      </View>

      {tab === "fixtures" ? (
        fixturesLoading && fixtures.length === 0 ? (
          <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <FlatList
            data={fixtures}
            keyExtractor={(f) => f.id}
            contentContainerStyle={st.list}
            refreshControl={
              <RefreshControl
                refreshing={fixturesLoading}
                onRefresh={() => void refetchFixtures()}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <Text style={[st.empty, { color: colors.muted }]}>No fixtures — tap ↻ Sync</Text>
            }
            renderItem={({ item: f }) => {
              const sc = STATUS_COLORS[f.status] ?? { bg: colors.section, text: colors.muted };
              const isFinished = f.status === "FINISHED";
              const hasPost = !!f.campaignPostId;
              const isCreating = creatingPostId === f.id;
              const isProcessing = processingId === f.id;

              return (
                <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Teams row */}
                  <View style={st.teamsRow}>
                    <Text style={[st.teamName, { color: colors.text }]} numberOfLines={1}>
                      {f.homeTeam.shortName ?? f.homeTeam.name}
                    </Text>
                    <View style={st.scoreBox}>
                      {f.score?.home != null ? (
                        <Text style={[st.scoreText, { color: colors.text }]}>
                          {f.score.home} – {f.score.away}
                        </Text>
                      ) : (
                        <Text style={[st.scoreText, { color: colors.muted }]}>vs</Text>
                      )}
                    </View>
                    <Text style={[st.teamName, st.teamNameRight, { color: colors.text }]} numberOfLines={1}>
                      {f.awayTeam.shortName ?? f.awayTeam.name}
                    </Text>
                  </View>

                  {/* Meta */}
                  <View style={st.metaRow}>
                    <View style={[st.pill, { backgroundColor: sc.bg }]}>
                      <Text style={[st.pillText, { color: sc.text }]}>{f.status}</Text>
                    </View>
                    {f.stage ? (
                      <Text style={[st.stageTxt, { color: colors.muted }]}>{f.stage}{f.group ? ` · ${f.group}` : ""}</Text>
                    ) : null}
                    <Text style={[st.kickoff, { color: colors.muted }]}>
                      {new Date(f.kickoff).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>

                  {/* Actions */}
                  <View style={st.actionRow}>
                    <Pressable
                      style={[
                        st.actionBtn,
                        { borderColor: hasPost ? colors.border : colors.accent },
                        (hasPost || isCreating) && { opacity: 0.5 },
                      ]}
                      onPress={() => !hasPost && void handleCreatePost(f)}
                      disabled={hasPost || isCreating}
                    >
                      {isCreating
                        ? <ActivityIndicator size="small" color={colors.accent} />
                        : <Text style={[st.actionBtnText, { color: hasPost ? colors.muted : colors.accent }]}>
                          {hasPost ? "✓ Post" : "+ Post"}
                        </Text>}
                    </Pressable>

                    {isFinished && hasPost && (
                      <Pressable
                        style={[st.actionBtn, { borderColor: "#22c55e" }, isProcessing && { opacity: 0.5 }]}
                        onPress={() => void handleProcessResult(f)}
                        disabled={isProcessing}
                      >
                        {isProcessing
                          ? <ActivityIndicator size="small" color="#22c55e" />
                          : <Text style={[st.actionBtnText, { color: "#22c55e" }]}>Process</Text>}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )
      ) : (
        /* Winners tab */
        winnersLoading && winners.length === 0 ? (
          <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <FlatList
            data={winners}
            keyExtractor={(w) => w.id}
            contentContainerStyle={st.list}
            refreshControl={
              <RefreshControl
                refreshing={winnersLoading}
                onRefresh={() => void refetchWinners()}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <Text style={[st.empty, { color: colors.muted }]}>No winners yet</Text>
            }
            renderItem={({ item: w }) => {
              const isMarking = markingId === w.id;
              return (
                <View style={[st.winnerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={st.winnerInfo}>
                    <Text style={[st.winnerName, { color: colors.text }]}>
                      {w.user?.displayName ?? w.user?.username ?? w.user?.email ?? "Unknown"}
                    </Text>
                    {w.user?.email && (
                      <Text style={[st.winnerEmail, { color: colors.muted }]}>{w.user.email}</Text>
                    )}
                    <View style={st.winnerMeta}>
                      {w.prize != null && (
                        <View style={[st.pill, { backgroundColor: "rgba(34,197,94,0.1)" }]}>
                          <Text style={[st.pillText, { color: "#22c55e" }]}>৳{w.prize}</Text>
                        </View>
                      )}
                      {w.winningOption && (
                        <View style={[st.pill, { backgroundColor: colors.section }]}>
                          <Text style={[st.pillText, { color: colors.subtext }]}>{w.winningOption}</Text>
                        </View>
                      )}
                      <View style={[st.pill, { backgroundColor: w.paid ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)" }]}>
                        <Text style={[st.pillText, { color: w.paid ? "#22c55e" : "#f59e0b" }]}>
                          {w.paid ? "PAID" : "UNPAID"}
                        </Text>
                      </View>
                    </View>
                    {w.note ? <Text style={[st.note, { color: colors.muted }]}>{w.note}</Text> : null}
                  </View>
                  {!w.paid && (
                    <Pressable
                      style={[st.payBtn, isMarking && { opacity: 0.5 }]}
                      onPress={() => void handleMarkPaid(w)}
                      disabled={isMarking}
                    >
                      {isMarking
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={st.payBtnText}>Mark Paid</Text>}
                    </Pressable>
                  )}
                </View>
              );
            }}
          />
        )
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    toolbar: { padding: 12, borderBottomWidth: 1, gap: 8 },
    tabRow: { flexDirection: "row", gap: 8 },
    tabBtn: { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: "center" },
    tabBtnText: { fontSize: 13, fontWeight: "700" },
    syncBtn: { alignSelf: "flex-end", backgroundColor: "#22c55e", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 4 },
    syncBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    list: { padding: 12, gap: 10 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
    teamsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    teamName: { flex: 1, fontSize: 14, fontWeight: "700" },
    teamNameRight: { textAlign: "right" },
    scoreBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: "rgba(99,102,241,0.1)" },
    scoreText: { fontSize: 14, fontWeight: "800" },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
    pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    pillText: { fontSize: 10, fontWeight: "700" },
    stageTxt: { fontSize: 11 },
    kickoff: { fontSize: 11 },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 2 },
    actionBtn: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 6, minWidth: 70, alignItems: "center" },
    actionBtnText: { fontSize: 12, fontWeight: "700" },
    winnerCard: { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
    winnerInfo: { flex: 1, gap: 4 },
    winnerName: { fontSize: 14, fontWeight: "700" },
    winnerEmail: { fontSize: 12 },
    winnerMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    note: { fontSize: 11 },
    payBtn: { backgroundColor: "#22c55e", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", minWidth: 88 },
    payBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  });
}
