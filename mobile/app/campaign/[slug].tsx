import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import worldcupPlayersAsset from "../../assets/worldcup-players.png";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Easing, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CAMPAIGN_BY_SLUG,
  CAMPAIGN_WIN_LEADERBOARD,
} from "@ctrend/shared/graphql/campaigns";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";
import { BottomNav } from "../../components/BottomNav";
import { LeaderboardRankBadge } from "../../components/LeaderboardRankBadge";
import { leaderboardRankRowClass } from "@ctrend/shared/lib/leaderboardRank";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  bannerText: string;
  bannerImageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  isActive: boolean;
  prizePerWinner: number;
  rules?: string | null;
  rulesBn?: string | null;
  fixturesEnabled: boolean;
  startDate?: string | null;
  endDate?: string | null;
};

type FixtureTeam = { name?: string | null; shortName?: string | null; crest?: string | null };
type FixtureScore = { home?: number | null; away?: number | null; winner?: string | null };
type Fixture = {
  id: string;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  kickoff: string;
  status: string;
  stage: string;
  group?: string | null;
  matchday?: number | null;
  score: FixtureScore;
  campaignPostId?: string | null;
};

type CampaignData = { campaign: Campaign };
type FixturesData = { worldCupFixtures: Fixture[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_ORDER: Record<string, number> = {
  GROUP_STAGE: 0, LAST_32: 1, LAST_16: 2, QUARTER_FINALS: 3,
  SEMI_FINALS: 4, THIRD_PLACE: 5, FINAL: 6,
};

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage", LAST_32: "Round of 32", LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter Finals", SEMI_FINALS: "Semi Finals",
  THIRD_PLACE: "3rd Place", FINAL: "Final",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ─── Group standings ──────────────────────────────────────────────────────────

type TeamStanding = {
  name: string; shortName: string; crest?: string | null;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; pts: number;
};

function computeGroupTables(fixtures: Fixture[]) {
  const tables = new Map<string, Map<string, TeamStanding>>();

  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group) continue;
    if (!tables.has(f.group)) tables.set(f.group, new Map());
    const gMap = tables.get(f.group)!;
    for (const side of [f.homeTeam, f.awayTeam]) {
      const key = side.name ?? "";
      if (!key || key === "TBD" || gMap.has(key)) continue;
      gMap.set(key, {
        name: side.name ?? "TBD", shortName: side.shortName ?? side.name ?? "TBD",
        crest: side.crest, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      });
    }
  }

  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group || f.status !== "FINISHED") continue;
    if (f.score.home === null || f.score.home === undefined || f.score.away === null || f.score.away === undefined) continue;
    const gMap = tables.get(f.group);
    if (!gMap) continue;
    const home = gMap.get(f.homeTeam.name ?? "");
    const away = gMap.get(f.awayTeam.name ?? "");
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += f.score.home; home.ga += f.score.away;
    away.gf += f.score.away; away.ga += f.score.home;
    if (f.score.winner === "HOME_TEAM") {
      home.won++; home.pts += 3; away.lost++;
    } else if (f.score.winner === "AWAY_TEAM") {
      away.won++; away.pts += 3; home.lost++;
    } else {
      home.drawn++; home.pts++; away.drawn++; away.pts++;
    }
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
  }

  return [...tables.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, gMap]) => ({
      group,
      label: group.replace("GROUP_", "Group "),
      teams: [...gMap.values()].sort(
        (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name),
      ),
    }));
}

// ─── Group standings section ──────────────────────────────────────────────────

function GroupTablesSection({
  fixtures,
  colors,
}: {
  fixtures: Fixture[];
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const tables = computeGroupTables(fixtures);
  if (!tables.length) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Group Standings</Text>
      <View style={styles.groupsGrid}>
        {tables.map((table) => (
          <View key={table.group} style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.groupCardHead, { color: colors.accent, borderBottomColor: colors.border }]}>
              {table.label}
            </Text>
            {/* Header row */}
            <View style={styles.standingRow}>
              <Text style={[styles.standingTeamCol, styles.standingHeader, { color: colors.muted }]}>Team</Text>
              {["P","W","D","L","GD","Pts"].map((h) => (
                <Text key={h} style={[styles.standingNumCol, styles.standingHeader, { color: colors.muted }]}>{h}</Text>
              ))}
            </View>
            {table.teams.map((team, i) => {
              const qualifies = i < 2;
              const borderLeft = qualifies ? "#22c55e" : i === 2 ? "#f59e0b" : "transparent";
              return (
                <View key={team.name} style={[styles.standingRow, { borderLeftWidth: 3, borderLeftColor: borderLeft }]}>
                  <View style={styles.standingTeamCol}>
                    <Text style={[styles.standingPos, { color: colors.muted }]}>{i + 1}</Text>
                    {team.crest
                      ? <Image source={{ uri: team.crest }} style={styles.crestSmall} contentFit="contain" cachePolicy="memory-disk" />
                      : <View style={[styles.crestSmall, styles.crestPh, { backgroundColor: colors.section }]} />
                    }
                    <Text style={[styles.standingName, { color: colors.text }]} numberOfLines={1}>{team.shortName}</Text>
                  </View>
                  <Text style={[styles.standingNumCol, { color: colors.subtext }]}>{team.played}</Text>
                  <Text style={[styles.standingNumCol, { color: colors.subtext }]}>{team.won}</Text>
                  <Text style={[styles.standingNumCol, { color: colors.subtext }]}>{team.drawn}</Text>
                  <Text style={[styles.standingNumCol, { color: colors.subtext }]}>{team.lost}</Text>
                  <Text style={[styles.standingNumCol, { color: colors.subtext }]}>
                    {team.gd > 0 ? `+${team.gd}` : team.gd}
                  </Text>
                  <Text style={[styles.standingNumCol, { color: colors.text, fontWeight: "700" }]}>{team.pts}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
        <Text style={[styles.legendText, { color: colors.muted }]}>Advance  </Text>
        <View style={[styles.legendDot, { backgroundColor: "#f59e0b" }]} />
        <Text style={[styles.legendText, { color: colors.muted }]}>Possible  </Text>
      </View>
    </View>
  );
}

// ─── Fixture card ─────────────────────────────────────────────────────────────

function FixtureCard({
  fixture,
  colors,
}: {
  fixture: Fixture;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const kickoff = new Date(fixture.kickoff);
  const isLive = fixture.status === "IN_PLAY" || fixture.status === "PAUSED";
  const isFinished = fixture.status === "FINISHED";
  const isUpcoming = !isLive && !isFinished;
  // Campaign match posts publish (voting opens) 24h before kickoff, close at
  // kickoff. Only show "Cast your vote" inside that window.
  const votingOpen =
    isUpcoming && kickoff.getTime() - Date.now() <= 24 * 60 * 60 * 1000;
  const hasScore = isFinished || isLive;
  const homeWon = fixture.score.winner === "HOME_TEAM";
  const awayWon = fixture.score.winner === "AWAY_TEAM";

  const groupLabel = fixture.group ? fixture.group.replace("GROUP_", "Group ") : null;
  const matchLabel = groupLabel
    ? `${groupLabel}${fixture.matchday ? ` · MD ${fixture.matchday}` : ""}`
    : (STAGE_LABELS[fixture.stage] ?? fixture.stage.replace(/_/g, " "));

  const dateStr = kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeStr = kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });

  const homeName = fixture.homeTeam.shortName ?? fixture.homeTeam.name ?? "TBD";
  const awayName = fixture.awayTeam.shortName ?? fixture.awayTeam.name ?? "TBD";

  const cardBg = isLive ? "#1a1a2e" : colors.card;
  const cardBorder = isLive ? "#818cf8" : colors.border;

  return (
    <View style={[styles.fixtureCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header */}
      <View style={[styles.fcHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.fcLabel, { color: colors.muted }]}>{matchLabel}</Text>
        <View style={styles.fcHeaderRight}>
          {isLive && <View style={styles.liveDot} />}
          <Text style={[styles.fcDate, { color: colors.muted }]}>{dateStr}</Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.fcBody}>
        {/* Home */}
        <View style={styles.fcTeam}>
          {fixture.homeTeam.crest
            ? <Image source={{ uri: fixture.homeTeam.crest }} style={styles.crest} contentFit="contain" cachePolicy="memory-disk" />
            : <View style={[styles.crest, styles.crestPh, { backgroundColor: colors.section }]} />
          }
          <Text style={[styles.fcTeamName, { color: homeWon ? "#f59e0b" : colors.text, fontWeight: homeWon ? "800" : "600" }]}
            numberOfLines={2}
          >
            {homeName}
          </Text>
        </View>

        {/* Center */}
        <View style={styles.fcCenter}>
          {isLive && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
          {hasScore ? (
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreNum, { color: homeWon ? "#f59e0b" : colors.text }]}>
                {fixture.score.home ?? "–"}
              </Text>
              <Text style={[styles.scoreSep, { color: colors.muted }]}>–</Text>
              <Text style={[styles.scoreNum, { color: awayWon ? "#f59e0b" : colors.text }]}>
                {fixture.score.away ?? "–"}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.kickoffTime, { color: colors.accent }]}>{timeStr}</Text>
              <Text style={[styles.vsLabel, { color: colors.muted }]}>vs</Text>
            </>
          )}
          {isFinished && (
            <Text style={[styles.ftLabel, { color: colors.muted }]}>Full Time</Text>
          )}
        </View>

        {/* Away */}
        <View style={[styles.fcTeam, { alignItems: "flex-end" }]}>
          {fixture.awayTeam.crest
            ? <Image source={{ uri: fixture.awayTeam.crest }} style={styles.crest} contentFit="contain" cachePolicy="memory-disk" />
            : <View style={[styles.crest, styles.crestPh, { backgroundColor: colors.section }]} />
          }
          <Text style={[styles.fcTeamName, { color: awayWon ? "#f59e0b" : colors.text, fontWeight: awayWon ? "800" : "600" }]}
            numberOfLines={2}
            textBreakStrategy="simple"
          >
            {awayName}
          </Text>
        </View>
      </View>

      {/* Vote button — only once the campaign post is published (24h before kickoff) */}
      {fixture.campaignPostId && votingOpen ? (
        <Pressable
          style={[styles.voteBtn, { backgroundColor: colors.accent }]}
          onPress={() => router.push(`/post/${fixture.campaignPostId}` as `/${string}`)}
        >
          <Text style={styles.voteBtnText}>Cast your vote →</Text>
        </Pressable>
      ) : fixture.campaignPostId && isUpcoming ? (
        <View style={[styles.voteBtn, { borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={[styles.voteBtnText, { color: colors.muted }]}>🔒 Voting opens 24h before kickoff</Text>
        </View>
      ) : null}
      {fixture.campaignPostId && isFinished && (
        <Pressable
          style={[styles.voteBtn, { backgroundColor: colors.section, borderColor: colors.border }]}
          onPress={() => router.push(`/post/${fixture.campaignPostId}` as `/${string}`)}
        >
          <Text style={[styles.voteBtnText, { color: colors.muted }]}>View result →</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Fixtures section ─────────────────────────────────────────────────────────

function FixturesSection({ colors }: { colors: ReturnType<typeof useTheme>["colors"] }) {
  const { data, loading } = useQuery<FixturesData>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
  });

  const fixtures = data?.worldCupFixtures ?? [];
  const now = new Date();

  const upcoming = fixtures.filter(
    (f) => new Date(f.kickoff) > now || f.status === "IN_PLAY" || f.status === "PAUSED"
  );
  const finished = fixtures.filter((f) => f.status === "FINISHED");

  function byStage(list: Fixture[]) {
    const map: Record<string, Fixture[]> = {};
    for (const f of list) {
      if (!map[f.stage]) map[f.stage] = [];
      map[f.stage].push(f);
    }
    return Object.entries(map).sort(
      ([a], [b]) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99)
    );
  }

  if (loading && !fixtures.length) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Matches</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!fixtures.length) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Matches</Text>
        <Text style={[styles.emptyText, { color: colors.muted }]}>No fixtures synced yet — check back soon.</Text>
      </View>
    );
  }

  return (
    <>
      <GroupTablesSection fixtures={fixtures} colors={colors} />

      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Matches</Text>
          {byStage(upcoming).map(([stage, list]) => (
            <View key={stage}>
              <Text style={[styles.stageLabel, { color: colors.accent }]}>
                {STAGE_LABELS[stage] ?? stage.replace(/_/g, " ")}
              </Text>
              {[...list]
                .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
                .map((f) => <FixtureCard key={f.id} fixture={f} colors={colors} />)}
            </View>
          ))}
        </View>
      )}

      {finished.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Finished Matches</Text>
          {[...finished]
            .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())
            .map((f) => <FixtureCard key={f.id} fixture={f} colors={colors} />)}
        </View>
      )}
    </>
  );
}

// ─── Rules section ────────────────────────────────────────────────────────────

function RulesSection({
  rules,
  rulesBn,
  colors,
}: {
  rules: string;
  rulesBn?: string | null;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [lang, setLang] = useState<"en" | "bn">("en");
  const active = lang === "bn" && rulesBn ? rulesBn : rules;
  const lines = active.split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);

  return (
    <View style={styles.section}>
      <View style={styles.rulesTitleRow}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>How to participate</Text>
        {rulesBn && (
          <View style={[styles.langToggle, { backgroundColor: colors.section, borderColor: colors.border }]}>
            {(["en", "bn"] as const).map((l) => (
              <Pressable
                key={l}
                style={[
                  styles.langBtn,
                  lang === l && { backgroundColor: colors.accent },
                ]}
                onPress={() => setLang(l)}
              >
                <Text style={[styles.langBtnText, { color: lang === l ? "#fff" : colors.muted }]}>
                  {l === "en" ? "EN" : "বাং"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <View style={{ marginTop: 12 }}>
        {lines.map((line, i) => (
          <View key={i} style={styles.ruleItem}>
            <View style={[styles.ruleNum, { backgroundColor: colors.accent }]}>
              <Text style={styles.ruleNumText}>{i + 1}</Text>
            </View>
            <Text style={[styles.ruleText, { color: colors.subtext }]}>{line}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Campaign winners leaderboard ──────────────────────────────────────────────

type LeaderRow = {
  rank: number;
  wins: number;
  totalPrize: number;
  user: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

const LB_ROW_TIER: Record<string, { border: string; bg: string }> = {
  "lb-row--gold": { border: "rgba(245,197,24,0.45)", bg: "rgba(245,197,24,0.12)" },
  "lb-row--silver": { border: "rgba(192,200,212,0.5)", bg: "rgba(192,200,212,0.1)" },
  "lb-row--bronze": { border: "rgba(205,127,50,0.45)", bg: "rgba(205,127,50,0.1)" },
};

function WinnersLeaderboardSection({
  campaignId,
  colors,
}: {
  campaignId: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const [showAll, setShowAll] = useState(false);
  const { data, loading } = useQuery<{ campaignWinLeaderboard: LeaderRow[] }>(
    CAMPAIGN_WIN_LEADERBOARD,
    { variables: { campaignId, take: 50 }, fetchPolicy: "cache-and-network" },
  );
  const allRows = data?.campaignWinLeaderboard ?? [];
  const rows = showAll ? allRows : allRows.slice(0, 3);

  if (loading && allRows.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>🏆 Top campaign winners</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Loading…</Text>
      </View>
    );
  }
  if (allRows.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>🏆 Top campaign winners</Text>
        <Text style={[styles.lbEmpty, { color: colors.muted, backgroundColor: colors.card, borderColor: colors.border }]}>
          No winners drawn yet — be the first!
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>
        🏆 Top campaign winners
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, marginBottom: 12 }}>
        Most match wins drawn from this campaign.
      </Text>
      <View style={{ gap: 6 }}>
        {rows.map((row) => {
          const u = row.user;
          const name = u?.displayName?.trim() || u?.username || "User";
          const img = normalizeProfileImageUrl(u?.profileImageUrl ?? null);
          const tierKey = leaderboardRankRowClass(row.rank);
          const tierStyle = tierKey ? LB_ROW_TIER[tierKey] : null;
          return (
            <Pressable
              key={u?.id ?? row.rank}
              style={[
                styles.lbRow,
                {
                  backgroundColor: tierStyle?.bg ?? colors.card,
                  borderColor: tierStyle?.border ?? colors.border,
                },
              ]}
              onPress={() => u?.id && router.push(`/profile/${u.id}` as `/${string}`)}
            >
              <LeaderboardRankBadge rank={row.rank} />
              <View
                style={[
                  styles.lbAvatar,
                  { backgroundColor: colors.section },
                ]}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.lbAvatarImg} cachePolicy="memory-disk" />
                ) : (
                  <Text style={[styles.lbAvatarFallback, { color: colors.muted }]}>
                    {name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={[styles.lbName, { color: colors.text }]} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.lbWins}>
                {row.wins} {row.wins === 1 ? "win" : "wins"}
              </Text>
            </Pressable>
          );
        })}
        {allRows.length > 3 && (
          <Pressable
            style={[styles.lbMore, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setShowAll((s) => !s)}
          >
            <Text style={[styles.lbMoreText, { color: colors.text }]}>
              {showAll ? "Show less" : `Show more (${allRows.length - 3})`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CampaignDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();
  // Reset on focus so the footer is visible when entering the screen.
  useFocusEffect(
    useCallback(() => {
      translateY.value = 0;
    }, [translateY]),
  );

  // Hide the footer on scroll-down, reveal on scroll-up — same as the feed.
  const TAB_BAR_H = 60 + insets.bottom + 6;
  const lastScrollY = useRef(0);
  const tabBarVisible = useRef(true);
  function handleScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    lastScrollY.current = y;
    if (y < 60) {
      if (!tabBarVisible.current) {
        tabBarVisible.current = true;
        translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      }
      return;
    }
    if (diff > 4 && tabBarVisible.current) {
      tabBarVisible.current = false;
      translateY.value = withTiming(TAB_BAR_H, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else if (diff < -4 && !tabBarVisible.current) {
      tabBarVisible.current = true;
      translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    }
  }

  const { data, loading, error } = useQuery<CampaignData>(CAMPAIGN_BY_SLUG, {
    variables: { slug },
    skip: !slug,
    fetchPolicy: "cache-and-network",
  });

  const campaign = data?.campaign;

  // Defer the heavy sections (rules, leaderboard, all fixtures + group tables)
  // until the navigation transition finishes, so opening/leaving the screen is
  // snappy instead of janking while React renders everything synchronously.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header bar */}
      <View
        style={[
          styles.topbar,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.topbarTitle, { color: colors.text }]} numberOfLines={1}>
          {campaign?.name ?? "Campaign"}
        </Text>
        <View style={{ width: 64 }} />
      </View>

      {loading && !campaign ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error || !campaign ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📋</Text>
          <Text style={[styles.errorText, { color: colors.text }]}>Campaign not found</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.accent, fontWeight: "700" }}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* Campaign banner card — same style as feed banner */}
          <View style={styles.bannerCard}>
            <Image
              source={campaign.bannerImageUrl ? { uri: campaign.bannerImageUrl } : worldcupPlayersAsset}
              style={styles.bannerRightImage}
              contentFit="contain"
              contentPosition="right center"
              cachePolicy="memory-disk"
            />
            <View style={styles.bannerLeftFade} />
            <View style={styles.bannerContent}>
              <View style={styles.bannerTopRow}>
                <View style={styles.bannerBadge}>
                  <Text style={styles.bannerBadgeText}>CAMPAIGN</Text>
                </View>
                <Text style={styles.bannerPrize}>🏆 Win {campaign.prizePerWinner} BDT</Text>
              </View>
              <Text style={styles.bannerTitle} numberOfLines={1}>{campaign.name}</Text>
              <Text style={styles.bannerDesc} numberOfLines={2}>{campaign.bannerText}</Text>
              {campaign.ctaLabel && (
                <View style={styles.bannerCta}>
                  <Text style={styles.bannerCtaText}>{campaign.ctaLabel}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.body}>

            {/* Meta row */}
            <View style={[styles.metaRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, { color: colors.muted }]}>Prize</Text>
                <Text style={[styles.metaValue, { color: "#f59e0b" }]}>
                  ৳{campaign.prizePerWinner.toLocaleString()}
                </Text>
              </View>
              {campaign.startDate && (
                <View style={[styles.metaItem, styles.metaItemBorder, { borderLeftColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.muted }]}>Starts</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>{formatDate(campaign.startDate)}</Text>
                </View>
              )}
              {campaign.endDate && (
                <View style={[styles.metaItem, styles.metaItemBorder, { borderLeftColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.muted }]}>Ends</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>{formatDate(campaign.endDate)}</Text>
                </View>
              )}
            </View>

            {/* Description */}
            {campaign.description ? (
              <View style={styles.section}>
                <Text style={[styles.description, { color: colors.subtext }]}>{campaign.description}</Text>
              </View>
            ) : null}

            {/* Heavy sections — mounted after the navigation transition so the
                push/back feels instant. */}
            {!ready ? (
              <View style={[styles.center, { paddingVertical: 40 }]}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : (
              <>
                {/* Rules */}
                {campaign.rules ? (
                  <RulesSection rules={campaign.rules} rulesBn={campaign.rulesBn} colors={colors} />
                ) : null}

                {/* Top campaign winners */}
                <WinnersLeaderboardSection campaignId={campaign.id} colors={colors} />

                {/* Fixtures (World Cup) */}
                {campaign.fixturesEnabled && <FixturesSection colors={colors} />}
              </>
            )}
          </View>
        </ScrollView>
      )}

      <View style={styles.bottomNavOverlay} pointerEvents="box-none">
        <BottomNav />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bottomNavOverlay: { position: "absolute", left: 0, right: 0, bottom: 0 },

  // Banner card (same as CampaignBanner feed card)
  bannerCard: {
    height: 130,
    backgroundColor: "#5a0a0a",
    overflow: "hidden",
    marginBottom: 0,
  },
  bannerRightImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "55%",
  },
  bannerLeftFade: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "65%",
    backgroundColor: "#5a0a0a",
  },
  bannerContent: {
    flex: 1,
    padding: 14,
    paddingRight: 8,
    gap: 3,
    width: "62%",
  },
  bannerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  bannerBadge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bannerBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },
  bannerPrize: { color: "#fbbf24", fontSize: 12, fontWeight: "700" },
  bannerTitle: { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 20 },
  bannerDesc: { color: "rgba(255,255,255,0.78)", fontSize: 11, lineHeight: 16 },
  bannerCta: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  bannerCtaText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 64, justifyContent: "center" },
  backText: { fontSize: 18, fontWeight: "600" },
  topbarTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  errorText: { fontSize: 18, fontWeight: "700" },
  scrollContent: {},
  body: { paddingHorizontal: 16, paddingTop: 16 },

  // Meta
  metaRow: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  metaItem: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  metaItemBorder: { borderLeftWidth: StyleSheet.hairlineWidth },
  metaLabel: { fontSize: 11, fontWeight: "600", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: "700" },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  emptyText: { fontSize: 14, marginTop: 8 },
  description: { fontSize: 15, lineHeight: 22 },

  // Rules
  rulesTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 0 },
  langToggle: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    padding: 2,
    gap: 2,
  },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  langBtnText: { fontSize: 12, fontWeight: "700" },
  ruleItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
  ruleNum: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  ruleNumText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  ruleText: { flex: 1, fontSize: 14, lineHeight: 20 },

  // Group standings
  groupsGrid: { gap: 12 },
  groupCard: {
    borderRadius: 12, borderWidth: 1, overflow: "hidden",
  },
  groupCardHead: {
    fontSize: 13, fontWeight: "800", paddingHorizontal: 12, paddingVertical: 8,
    letterSpacing: 0.5, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  standingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 5 },
  standingHeader: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  standingTeamCol: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  standingNumCol: { width: 28, textAlign: "center", fontSize: 12 },
  standingPos: { width: 14, fontSize: 11, textAlign: "center" },
  standingName: { flex: 1, fontSize: 12, fontWeight: "600" },
  crestSmall: { width: 18, height: 18, borderRadius: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
  crestPh: { borderRadius: 2 },

  // Fixture cards
  stageLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },
  fixtureCard: {
    borderRadius: 14, borderWidth: 1,
    marginBottom: 10, overflow: "hidden",
  },
  fcHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fcHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  fcLabel: { fontSize: 11, fontWeight: "600" },
  fcDate: { fontSize: 11 },
  liveDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  fcBody: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 14,
  },
  fcTeam: { flex: 1, alignItems: "flex-start", gap: 6 },
  crest: { width: 36, height: 36 },
  fcTeamName: { fontSize: 13, lineHeight: 17 },
  fcCenter: { width: 72, alignItems: "center", gap: 4 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scoreNum: { fontSize: 22, fontWeight: "800" },
  scoreSep: { fontSize: 18, fontWeight: "300" },
  kickoffTime: { fontSize: 16, fontWeight: "700" },
  vsLabel: { fontSize: 11, fontWeight: "600" },
  ftLabel: { fontSize: 10, fontWeight: "600" },
  liveBadge: {
    backgroundColor: "#ef4444", borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  liveBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  voteBtn: {
    marginHorizontal: 12, marginBottom: 12, borderRadius: 10,
    paddingVertical: 10, alignItems: "center",
    borderWidth: 1, borderColor: "transparent",
  },
  voteBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Winners leaderboard
  lbEmpty: {
    fontSize: 13,
    textAlign: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lbRank: { width: 30, textAlign: "center", fontWeight: "900", fontSize: 16 },
  lbAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  lbAvatarImg: { width: "100%", height: "100%" },
  lbAvatarFallback: { fontWeight: "800", fontSize: 15 },
  lbName: { flex: 1, fontWeight: "700", fontSize: 14 },
  lbWins: {
    fontWeight: "800",
    fontSize: 12.5,
    color: "#d99411",
    backgroundColor: "rgba(245,197,24,0.14)",
    borderWidth: 1,
    borderColor: "rgba(245,197,24,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  lbMore: {
    alignSelf: "center",
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  lbMoreText: { fontWeight: "700", fontSize: 13 },
});
