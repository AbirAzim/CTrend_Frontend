import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WORLD_CUP_FIXTURES, WORLD_CUP_TOP_STATS } from "@ctrend/shared/graphql/worldcup";
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
type TopScorer = { playerId: number | null; name: string; team: string; teamCrest: string | null; goals: number };
type TopAssistant = { playerId: number | null; name: string; team: string; teamCrest: string | null; assists: number };
type TopStatsData = { worldCupTopScorers: TopScorer[]; worldCupTopAssistants: TopAssistant[] };
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
    if (f.score.winner === "home") { home.won++; home.pts += 3; away.lost++; }
    else if (f.score.winner === "away") { away.won++; away.pts += 3; home.lost++; }
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
      <View style={st.standingsRow}>
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
      </View>
    </View>
  );
}

// ─── Top scorers / assists ────────────────────────────────────────────────────

function PlayerRow({ rank, name, team, teamCrest, stat, st }: {
  rank: number; name: string; team: string; teamCrest: string | null; stat: number;
  st: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={st.playerRow}>
      <Text style={st.playerRank}>{rank}</Text>
      <View style={st.playerInfo}>
        <Text style={st.playerName} numberOfLines={1}>{name}</Text>
        <View style={st.playerTeamRow}>
          {teamCrest ? (
            <Image source={{ uri: teamCrest }} style={st.playerCrest} contentFit="contain" />
          ) : null}
          <Text style={st.playerTeam} numberOfLines={1}>{team}</Text>
        </View>
      </View>
      <Text style={st.playerStat}>{stat}</Text>
    </View>
  );
}

function TopStatsSection({ scorers, assistants, loading, st }: {
  scorers: TopScorer[]; assistants: TopAssistant[]; loading: boolean;
  st: ReturnType<typeof makeStyles>;
}) {
  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} />;
  if (scorers.length === 0 && assistants.length === 0) {
    return <Text style={st.statusMsg}>No stats yet — available once matches have been played.</Text>;
  }
  return (
    <View style={st.statsGrid}>
      <View style={st.statsCol}>
        <Text style={st.statsColTitle}>⚽ Top Scorers</Text>
        {scorers.length === 0
          ? <Text style={st.statusMsg}>No goals yet.</Text>
          : scorers.map((s, i) => (
            <PlayerRow key={`${s.name}-${s.team}`} rank={i + 1} name={s.name} team={s.team} teamCrest={s.teamCrest} stat={s.goals} st={st} />
          ))}
      </View>
      <View style={st.statsCol}>
        <Text style={st.statsColTitle}>🎯 Top Assists</Text>
        {assistants.length === 0
          ? <Text style={st.statusMsg}>No assists yet.</Text>
          : assistants.map((a, i) => (
            <PlayerRow key={`${a.name}-${a.team}`} rank={i + 1} name={a.name} team={a.team} teamCrest={a.teamCrest} stat={a.assists} st={st} />
          ))}
      </View>
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

function FixtureRow({ fixture, st, isDark }: { fixture: WcFixture; st: ReturnType<typeof makeStyles>; isDark: boolean }) {
  const live = isLive(fixture);
  const finished = isFinished(fixture);
  const homeWon = fixture.score.winner === "home";
  const awayWon = fixture.score.winner === "away";
  const canVote = canVoteOnFixture(fixture);

  function handlePress() {
    if (live || finished) {
      router.push(`/world-cup/match/${fixture.id}` as `/${string}`);
    } else if (fixture.campaignPostId) {
      router.push(`/post/${fixture.campaignPostId}` as `/${string}`);
    }
  }

  const dimColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.28)";
  const winColor = isDark ? "#f1f5f9" : "#0f172a";
  const normalColor = isDark ? "#cbd5e1" : "#334155";
  const accentBlue = isDark ? "#60a5fa" : "#3b82f6";

  // ── Results row: centered score, home left, away right ──
  if (finished) {
    return (
      <Pressable style={[st.fixture, st.fixtureResult]} onPress={handlePress}>
        {/* Home */}
        <View style={st.frHome}>
          <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} size={20} />
          <Text style={[st.frTeamName, { color: homeWon ? winColor : dimColor, fontWeight: homeWon ? "800" : "500" }]} numberOfLines={1}>
            {fixture.homeTeam.shortName}
          </Text>
        </View>
        {/* Score */}
        <View style={st.frScoreBlock}>
          <Text style={st.frScore}>
            <Text style={{ color: homeWon ? accentBlue : normalColor }}>{fixture.score.home ?? "–"}</Text>
            <Text style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }}> – </Text>
            <Text style={{ color: awayWon ? accentBlue : normalColor }}>{fixture.score.away ?? "–"}</Text>
          </Text>
          <Text style={st.frFT}>FT</Text>
        </View>
        {/* Away */}
        <View style={st.frAway}>
          <Text style={[st.frTeamName, { color: awayWon ? winColor : dimColor, fontWeight: awayWon ? "800" : "500", textAlign: "right" }]} numberOfLines={1}>
            {fixture.awayTeam.shortName}
          </Text>
          <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} size={20} />
        </View>
      </Pressable>
    );
  }

  // ── Live row ──
  if (live) {
    return (
      <Pressable style={[st.fixture, st.fixtureLive]} onPress={handlePress}>
        <View style={st.frHome}>
          <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} size={20} />
          <Text style={[st.frTeamName, { color: normalColor }]} numberOfLines={1}>
            {fixture.homeTeam.shortName}
          </Text>
        </View>
        <View style={st.frScoreBlock}>
          <View style={st.livePillRow}>
            <View style={st.liveDotSmall} />
            <Text style={st.livePillText}>{liveBadgeLabel(fixture)}</Text>
          </View>
          <Text style={st.frScore}>
            <Text style={{ color: winColor }}>{fixture.score.home ?? 0}</Text>
            <Text style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)" }}> – </Text>
            <Text style={{ color: winColor }}>{fixture.score.away ?? 0}</Text>
          </Text>
        </View>
        <View style={st.frAway}>
          <Text style={[st.frTeamName, { color: normalColor, textAlign: "right" }]} numberOfLines={1}>
            {fixture.awayTeam.shortName}
          </Text>
          <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} size={20} />
        </View>
      </Pressable>
    );
  }

  // ── Upcoming row: teams left, time+countdown right ──
  return (
    <Pressable
      style={st.fixture}
      onPress={fixture.campaignPostId ? handlePress : undefined}
    >
      {/* Teams side */}
      <View style={st.frTeams}>
        <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} size={20} />
        <Text style={[st.frTeamName, { color: normalColor }]} numberOfLines={1}>
          {fixture.homeTeam.shortName}
        </Text>
        <Text style={st.frVs}>v</Text>
        <Text style={[st.frTeamName, { color: normalColor }]} numberOfLines={1}>
          {fixture.awayTeam.shortName}
        </Text>
        <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} size={20} />
      </View>
      {/* Time side */}
      <View style={st.frTimeBlock}>
        <Text style={st.kickoffTime}>{formatTime(fixture.kickoff)}</Text>
        <Text style={st.kickoffCountdown}>{countdownToKickoff(fixture.kickoff)}</Text>
        {canVote ? (
          <View style={st.voteChip}>
            <Text style={st.voteChipText}>Vote</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorldCupScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const st = makeStyles(colors);
  const [, setTick] = useState(0);
  const params = useLocalSearchParams<{ tab?: string }>();
  const initTab = params.tab === "results" || params.tab === "standings" || params.tab === "stats" ? params.tab : "fixtures";
  const [activeTab, setActiveTab] = useState<"fixtures" | "results" | "standings" | "stats">(initTab);

  const { data, loading, error } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    pollInterval: 60_000,
  });
  const { data: statsData, loading: statsLoading, error: statsError } = useQuery<TopStatsData>(
    WORLD_CUP_TOP_STATS,
    { fetchPolicy: "cache-and-network", pollInterval: 120_000 },
  );

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
    stats: "Stats",
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
        {(["fixtures", "results", "standings", "stats"] as const).map((tab) => (
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
                  <FixtureRow key={f.id} fixture={f} st={st} isDark={isDark} />
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
                      <FixtureRow key={f.id} fixture={f} st={st} isDark={isDark} />
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
                        <FixtureRow key={f.id} fixture={f} st={st} isDark={isDark} />
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
            {live.length === 0 && recent.length === 0 ? (
              <Text style={st.statusMsg}>No results yet.</Text>
            ) : (
              <>
                {live.length > 0 && (
                  <View>
                    <Text style={st.sectionTitle}>🔴 Live now</Text>
                    {live.map((f) => (
                      <FixtureRow key={f.id} fixture={f} st={st} isDark={isDark} />
                    ))}
                  </View>
                )}
                {recent.length > 0 && (
                  <View>
                    {recent.map((f) => (
                      <FixtureRow key={f.id} fixture={f} st={st} isDark={isDark} />
                    ))}
                  </View>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "standings" && (
          <GroupStandings fixtures={filtered} st={st} />
        )}

        {activeTab === "stats" && (
          statsError
            ? <Text style={st.statusMsg}>Failed to load stats. {statsError.message}</Text>
            : <TopStatsSection
                scorers={statsData?.worldCupTopScorers ?? []}
                assistants={statsData?.worldCupTopAssistants ?? []}
                loading={statsLoading && !statsData}
                st={st}
              />
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
    fixtureLive: { borderColor: "rgba(239,68,68,0.45)", borderWidth: 1.5 },
    fixtureResult: {},
    fixtureTappable: { opacity: 1 },
    // New row layouts
    frTeams: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "nowrap" },
    frTeamName: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
    frVs: { fontSize: 10.5, color: c.muted, fontWeight: "600", marginHorizontal: 2 },
    frTimeBlock: { alignItems: "flex-end", gap: 2, minWidth: 70 },
    frHome: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
    frAway: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
    frScoreBlock: { alignItems: "center", paddingHorizontal: 10, gap: 1 },
    frScore: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
    frFT: { fontSize: 9.5, fontWeight: "700", color: c.muted, letterSpacing: 0.3 },
    livePillRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#ef4444" },
    livePillText: { fontSize: 10, fontWeight: "800", color: "#ef4444" },
    // Legacy — kept for standings etc
    teamHome: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
    teamAway: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 8 },
    teamName: { fontSize: 13.5, fontWeight: "700", color: c.text, maxWidth: 90 },
    teamWinner: { color: c.accent, fontWeight: "800" },
    center: { width: 92, alignItems: "center", justifyContent: "center", gap: 1 },
    liveBadge: { fontSize: 9, fontWeight: "800", color: "#fff", backgroundColor: "#ef4444", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: "hidden" },
    ftBadge: { fontSize: 9, fontWeight: "800", color: c.muted },
    score: { fontSize: 17, fontWeight: "800", color: c.text },
    kickoffTime: { fontSize: 13, fontWeight: "800", color: c.text },
    kickoffCountdown: { fontSize: 10.5, fontWeight: "600", color: c.muted },
    voteChip: { backgroundColor: c.accent, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 3, marginTop: 2 },
    voteChipText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
    // ── Standings ──────────────────────────────────────────────────────────────
    standingsLegend: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendDotQualify: { backgroundColor: "rgba(34,197,94,0.35)" },
    legendDotPossible: { backgroundColor: "rgba(234,179,8,0.30)" },
    legendText: { fontSize: 10.5, color: c.muted },
    standingsRow: { gap: 10, paddingBottom: 4 },
    standingCard: {
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
    // ── Stats (top scorers / assists) ──────────────────────────────────────────
    statsGrid: { gap: 16 },
    statsCol: { gap: 4 },
    statsColTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: c.text,
      marginBottom: 6,
      paddingBottom: 6,
      borderBottomWidth: 2,
      borderBottomColor: c.accent,
    },
    playerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: c.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 5,
    },
    playerRank: { fontSize: 11, fontWeight: "800", color: c.muted, width: 18, textAlign: "center" },
    playerInfo: { flex: 1, gap: 2, minWidth: 0 },
    playerName: { fontSize: 13, fontWeight: "700", color: c.text },
    playerTeamRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    playerCrest: { width: 13, height: 13 },
    playerTeam: { fontSize: 11, color: c.muted, flexShrink: 1 },
    playerStat: {
      fontSize: 16,
      fontWeight: "900",
      color: c.accent,
      minWidth: 28,
      textAlign: "center",
    },
  });
}
