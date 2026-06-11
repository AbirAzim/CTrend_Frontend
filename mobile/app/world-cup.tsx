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
  countdownToKickoff,
  fixtureTeams,
  formatTime,
  groupByDay,
  involvesTeam,
  isFinished,
  isLive,
  liveFixtures,
  upcomingFixtures,
} from "../lib/worldCupFixtures";
import { setFollowedTeam, useFollowedTeam } from "../lib/wcTeam";

type FixturesData = { worldCupFixtures: WcFixture[] };
type Palette = ReturnType<typeof useTheme>["colors"];

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
  const canVote = !!fixture.campaignPostId && !hasScore;

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
          <Text style={st.liveBadge}>{fixture.minute != null ? `LIVE ${fixture.minute}'` : "LIVE"}</Text>
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

export default function WorldCupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const followed = useFollowedTeam();
  const st = makeStyles(colors);

  const { data, loading, error } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    pollInterval: 60_000,
  });

  const fixtures = data?.worldCupFixtures ?? [];
  const teams = fixtureTeams(fixtures);
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const upcomingDays = groupByDay(upcomingFixtures(filtered));

  const byStage: Record<string, WcFixture[]> = {};
  for (const f of filtered) (byStage[f.stage] ??= []).push(f);
  const sortedStages = Object.keys(byStage).sort(
    (a, b) => (WC_STAGE_ORDER[a] ?? 99) - (WC_STAGE_ORDER[b] ?? 99),
  );

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

        {followed && filtered.length === 0 ? (
          <Text style={st.statusMsg}>No matches found for {followed}.</Text>
        ) : null}
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
  });
}
