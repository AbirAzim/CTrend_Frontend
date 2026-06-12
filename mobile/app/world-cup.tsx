import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { useTheme } from "../context/ThemeContext";
import {
  type WcFixture,
  WC_STAGE_LABELS,
  WC_STAGE_ORDER,
  canVoteOnFixture,
  countdownToKickoff,
  finishedFixtures,
  fixtureTeams,
  formatTime,
  groupByDay,
  involvesTeam,
  isFinished,
  isLive,
  liveBadgeLabel,
  liveFixtures,
  needsSecondTick,
  upcomingFixtures,
} from "../lib/worldCupFixtures";
import { setFollowedTeam, useFollowedTeam } from "../lib/wcTeam";

type FixturesData = { worldCupFixtures: WcFixture[] };
type Palette = ReturnType<typeof useTheme>["colors"];

// ─── Group standings ──────────────────────────────────────────────────────────

type TeamStanding = {
  name: string; shortName: string; crest: string | null;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; pts: number;
};

function computeGroupTables(fixtures: WcFixture[]) {
  const tables = new Map<string, Map<string, TeamStanding>>();
  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group) continue;
    if (!tables.has(f.group)) tables.set(f.group, new Map());
    const gMap = tables.get(f.group)!;
    for (const side of [f.homeTeam, f.awayTeam]) {
      const key = side.name ?? "";
      if (!key || key === "TBD" || gMap.has(key)) continue;
      gMap.set(key, { name: side.name ?? "TBD", shortName: side.shortName ?? side.name ?? "TBD", crest: side.crest ?? null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
    }
  }
  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group || f.status !== "FINISHED") continue;
    if (f.score?.home == null || f.score?.away == null) continue;
    const gMap = tables.get(f.group);
    if (!gMap) continue;
    const home = gMap.get(f.homeTeam.name ?? "");
    const away = gMap.get(f.awayTeam.name ?? "");
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += f.score.home; home.ga += f.score.away;
    away.gf += f.score.away; away.ga += f.score.home;
    if (f.score.winner === "HOME_TEAM") { home.won++; home.pts += 3; away.lost++; }
    else if (f.score.winner === "AWAY_TEAM") { away.won++; away.pts += 3; home.lost++; }
    else { home.drawn++; home.pts++; away.drawn++; away.pts++; }
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }
  return [...tables.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, gMap]) => ({
      group,
      label: group.replace("GROUP_", "Group "),
      teams: [...gMap.values()].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)),
    }));
}

function GroupStandings({ fixtures, st }: { fixtures: WcFixture[]; st: ReturnType<typeof makeStyles> }) {
  const tables = computeGroupTables(fixtures);
  if (!tables.length) return null;
  return (
    <View>
      <Text style={st.sectionTitle}>📊 Group Standings</Text>
      <View style={st.standingsLegend}>
        <View style={[st.legendDot, st.legendDotQualify]} />
        <Text style={st.legendText}>Top 2 qualify  </Text>
        <View style={[st.legendDot, st.legendDotPossible]} />
        <Text style={st.legendText}>Best 3rd may qualify</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.standingsRow}>
        {tables.map((table) => (
          <View key={table.group} style={st.standingCard}>
            <Text style={st.standingCardHead}>{table.label}</Text>
            {/* Header */}
            <View style={st.stRow}>
              <View style={st.stTeamCell}><Text style={st.stHeader}>Team</Text></View>
              <Text style={[st.stStatCell, st.stHeader]}>P</Text>
              <Text style={[st.stStatCell, st.stHeader]}>W</Text>
              <Text style={[st.stStatCell, st.stHeader]}>D</Text>
              <Text style={[st.stStatCell, st.stHeader]}>L</Text>
              <Text style={[st.stStatCell, st.stHeader]}>GD</Text>
              <Text style={[st.stPtsCell, st.stHeader]}>Pts</Text>
            </View>
            {table.teams.map((team, i) => (
              <View
                key={team.name}
                style={[
                  st.stRow,
                  i < 2 ? st.stRowQualify : i === 2 ? st.stRowPossible : undefined,
                ]}
              >
                <View style={st.stTeamCell}>
                  <Text style={st.stPos}>{i + 1}</Text>
                  {team.crest
                    ? <Image source={{ uri: team.crest }} style={st.stCrest} contentFit="contain" />
                    : <View style={st.stCrestPh} />}
                  <Text style={st.stName} numberOfLines={1}>{team.shortName}</Text>
                </View>
                <Text style={st.stStatCell}>{team.played}</Text>
                <Text style={st.stStatCell}>{team.won}</Text>
                <Text style={st.stStatCell}>{team.drawn}</Text>
                <Text style={st.stStatCell}>{team.lost}</Text>
                <Text style={st.stStatCell}>{team.gd > 0 ? `+${team.gd}` : team.gd}</Text>
                <Text style={st.stPtsCell}>{team.pts}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Fixture row ──────────────────────────────────────────────────────────────

function TeamCrest({ crest, name, size = 26 }: { crest: string; name: string; size?: number }) {
  if (!crest) return null;
  return (
    <Image
      source={{ uri: crest }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
      accessibilityLabel={name}
    />
  );
}

function FixtureRow({ fixture, st }: { fixture: WcFixture; st: ReturnType<typeof makeStyles> }) {
  const live = isLive(fixture);
  const finished = isFinished(fixture);
  const hasScore = live || finished;
  const homeWon = fixture.score.winner === "HOME_TEAM";
  const awayWon = fixture.score.winner === "AWAY_TEAM";
  const canVote = canVoteOnFixture(fixture);

  return (
    <Pressable
      style={[st.fixture, live && st.fixtureLive]}
      onPress={() =>
        fixture.campaignPostId
          ? router.push(`/post/${fixture.campaignPostId}` as `/${string}`)
          : undefined
      }
    >
      <View style={st.teamHome}>
        <Text style={[st.teamName, homeWon && st.teamWinner]} numberOfLines={1}>
          {fixture.homeTeam.shortName}
        </Text>
        <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} />
      </View>

      <View style={st.center}>
        {live ? (
          <Text style={st.liveBadge}>{liveBadgeLabel(fixture)}</Text>
        ) : finished ? (
          <Text style={st.ftBadge}>FT</Text>
        ) : null}
        {hasScore ? (
          <Text style={st.score}>
            {fixture.score.home ?? "–"} : {fixture.score.away ?? "–"}
          </Text>
        ) : (
          <>
            <Text style={st.kickoffTime}>{formatTime(fixture.kickoff)}</Text>
            <Text style={st.kickoffCountdown}>{countdownToKickoff(fixture.kickoff)}</Text>
          </>
        )}
        {canVote ? (
          <View style={st.voteChip}>
            <Text style={st.voteChipText}>Vote</Text>
          </View>
        ) : null}
      </View>

      <View style={st.teamAway}>
        <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} />
        <Text style={[st.teamName, awayWon && st.teamWinner]} numberOfLines={1}>
          {fixture.awayTeam.shortName}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorldCupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const st = makeStyles(colors);
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"fixtures" | "results" | "standings">("fixtures");

  const { data, loading, error } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    pollInterval: 60_000,
  });

  const fixtures = data?.worldCupFixtures ?? [];

  // Adaptive tick for second-level countdown
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    function schedule() {
      const fast = needsSecondTick(upcomingFixtures(fixtures));
      id = setTimeout(() => { setTick((n) => n + 1); schedule(); }, fast ? 1000 : 30_000);
    }
    schedule();
    return () => clearTimeout(id);
  }); // re-runs when fixtures changes

  const teams = fixtureTeams(fixtures);
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const upcomingDays = groupByDay(upcomingFixtures(filtered));
  const recent = finishedFixtures(filtered);

  const byStage: Record<string, WcFixture[]> = {};
  for (const f of filtered) (byStage[f.stage] ??= []).push(f);
  const sortedStages = Object.keys(byStage).sort(
    (a, b) => (WC_STAGE_ORDER[a] ?? 99) - (WC_STAGE_ORDER[b] ?? 99),
  );

  const TAB_LABELS: Record<typeof activeTab, string> = {
    fixtures: "Fixtures",
    results: "Results",
    standings: "Standings",
  };

  return (
    <View style={[st.flex, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[st.topRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[st.back, { color: colors.muted }]}>← Back</Text>
        </Pressable>
        <Text style={[st.screenTitle, { color: colors.text }]}>🏆 World Cup 2026</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Sticky tab bar */}
      <View style={st.tabBar}>
        {(["fixtures", "results", "standings"] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[st.tabBtn, activeTab === tab && st.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[st.tabBtnText, activeTab === tab && st.tabBtnTextActive]}>
              {TAB_LABELS[tab]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {fixtures.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.chipRow}
          >
            <Pressable
              style={[st.chip, !followed && st.chipActive]}
              onPress={() => setFollowedTeam(null)}
            >
              <Text style={[st.chipText, !followed && st.chipTextActive]}>All teams</Text>
            </Pressable>
            {teams.map((t) => {
              const active = followed === t.name;
              return (
                <Pressable
                  key={t.name}
                  style={[st.chip, active && st.chipActive]}
                  onPress={() => setFollowedTeam(active ? null : t.name)}
                >
                  <Text style={[st.chipText, active && st.chipTextActive]} numberOfLines={1}>
                    {t.shortName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {loading && fixtures.length === 0 ? (
          <View style={st.centerState}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
        {error && fixtures.length === 0 ? (
          <Text style={st.statusMsg}>Couldn&apos;t load fixtures. {error.message}</Text>
        ) : null}
        {!loading && !error && fixtures.length === 0 ? (
          <Text style={st.statusMsg}>No fixtures yet. An admin can sync them.</Text>
        ) : null}

        {activeTab === "fixtures" && (
          <>
            {live.length > 0 && (
              <View>
                <Text style={st.sectionTitle}>🔴 Live now</Text>
                {live.map((f) => (
                  <FixtureRow key={f.id} fixture={f} st={st} />
                ))}
              </View>
            )}

            {upcomingDays.length > 0 && (
              <View>
                <Text style={st.sectionTitle}>⏱ Up next</Text>
                {upcomingDays.map((g) => (
                  <View key={g.key}>
                    <Text style={st.dayTitle}>{g.label}</Text>
                    {g.fixtures.map((f) => (
                      <FixtureRow key={f.id} fixture={f} st={st} />
                    ))}
                  </View>
                ))}
              </View>
            )}

            {fixtures.length > 0 && (
              <>
                <Text style={st.dividerTitle}>Full schedule</Text>
                {sortedStages.map((stage) => {
                  const stageFixtures = [...byStage[stage]!].sort(
                    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
                  );
                  return (
                    <View key={stage} style={{ marginBottom: 10 }}>
                      <Text style={st.stageTitle}>{WC_STAGE_LABELS[stage] ?? stage}</Text>
                      {stageFixtures.map((f) => (
                        <FixtureRow key={f.id} fixture={f} st={st} />
                      ))}
                    </View>
                  );
                })}
              </>
            )}

            {followed && filtered.length === 0 && fixtures.length > 0 ? (
              <Text style={st.statusMsg}>No matches found for {followed}.</Text>
            ) : null}
          </>
        )}

        {activeTab === "results" && (
          <>
            {recent.length === 0 ? (
              <Text style={st.statusMsg}>No results yet.</Text>
            ) : (
              recent.map((f) => <FixtureRow key={f.id} fixture={f} st={st} />)
            )}
          </>
        )}

        {activeTab === "standings" && (
          <GroupStandings fixtures={filtered} st={st} />
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 8,
    },
    back: { fontSize: 15, fontWeight: "600", width: 56 },
    screenTitle: { fontSize: 17, fontWeight: "800" },
    tabBar: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.bg,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabBtnActive: { borderBottomColor: c.accent },
    tabBtnText: { fontSize: 13, fontWeight: "700", color: c.muted },
    tabBtnTextActive: { color: c.accent },
    chipRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.section,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 12.5, fontWeight: "700", color: c.subtext, maxWidth: 120 },
    chipTextActive: { color: "#fff" },
    centerState: { paddingVertical: 30, alignItems: "center" },
    statusMsg: { color: c.muted, fontSize: 13, textAlign: "center", paddingVertical: 16 },
    sectionTitle: { fontSize: 15, fontWeight: "800", color: c.text, marginTop: 8, marginBottom: 6 },
    dayTitle: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: c.accent,
      marginTop: 6,
      marginBottom: 4,
    },
    dividerTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: c.text,
      marginTop: 14,
      marginBottom: 8,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    stageTitle: { fontSize: 13, fontWeight: "800", color: c.subtext, marginTop: 8, marginBottom: 4 },
    fixture: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 9,
      paddingHorizontal: 10,
      marginBottom: 6,
    },
    fixtureLive: { borderColor: "rgba(239,68,68,0.5)" },
    teamHome: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
    teamAway: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8 },
    teamName: { fontSize: 13.5, fontWeight: "700", color: c.text, maxWidth: 90 },
    teamWinner: { color: c.accent, fontWeight: "800" },
    center: { width: 92, alignItems: "center", justifyContent: "center", gap: 1 },
    liveBadge: { fontSize: 9, fontWeight: "800", color: "#fff", backgroundColor: "#ef4444", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden" },
    ftBadge: { fontSize: 9, fontWeight: "800", color: c.muted },
    score: { fontSize: 17, fontWeight: "800", color: c.text },
    kickoffTime: { fontSize: 13, fontWeight: "800", color: c.text },
    kickoffCountdown: { fontSize: 10, fontWeight: "600", color: c.muted },
    voteChip: { backgroundColor: c.accent, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, marginTop: 3 },
    voteChipText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
    // ── Standings ──────────────────────────────────────────────────────────────
    standingsLegend: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendDotQualify: { backgroundColor: "rgba(34,197,94,0.35)" },
    legendDotPossible: { backgroundColor: "rgba(234,179,8,0.30)" },
    legendText: { fontSize: 10.5, color: c.muted },
    standingsRow: { gap: 10, paddingRight: 4, paddingBottom: 4 },
    standingCard: {
      width: 248,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      overflow: "hidden",
    },
    standingCardHead: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      backgroundColor: c.accent,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    stRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    stRowQualify: { backgroundColor: "rgba(34,197,94,0.09)" },
    stRowPossible: { backgroundColor: "rgba(234,179,8,0.08)" },
    stTeamCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
    stStatCell: { width: 22, textAlign: "center", fontSize: 11, color: c.subtext },
    stPtsCell: { width: 26, textAlign: "center", fontSize: 12, fontWeight: "800", color: c.text },
    stHeader: { fontWeight: "800", fontSize: 10, color: c.muted },
    stPos: { fontSize: 10, fontWeight: "700", color: c.muted, width: 14, textAlign: "center" },
    stCrest: { width: 16, height: 16, borderRadius: 8 },
    stCrestPh: { width: 16, height: 16, borderRadius: 8, backgroundColor: c.section },
    stName: { flex: 1, fontSize: 12, fontWeight: "700", color: c.text },
  });
}
