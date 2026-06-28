import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@apollo/client";
import { NavLink, Navigate, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { WORLD_CUP_FIXTURES, WORLD_CUP_TOP_STATS } from "../graphql/worldcup";
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
import {
  worldCupRoadMapPollMs,
  type BracketFixture,
} from "@ctrend/shared/lib/knockoutBracket";
import { WorldCupKnockoutBracket } from "../components/WorldCupKnockoutBracket";

const WC_TABS = [
  { id: "fixtures", label: "Fixtures", path: "fixtures" },
  { id: "results", label: "Results", path: "results" },
  { id: "standings", label: "Standings", path: "standings" },
  { id: "stats", label: "Stats", path: "stats" },
  { id: "road-map", label: "Road Map", path: "road-map" },
] as const;

type WorldCupTabId = (typeof WC_TABS)[number]["id"];

type WorldCupPageData = {
  fixtures: WcFixture[];
  filtered: WcFixture[];
  teams: ReturnType<typeof fixtureTeams>;
  loading: boolean;
  error: Error | undefined;
  statsData:
    | {
        worldCupTopScorers: TopScorer[];
        worldCupTopAssistants: TopAssistant[];
      }
    | undefined;
  statsLoading: boolean;
  statsError: Error | undefined;
  live: WcFixture[];
  upcomingDays: ReturnType<typeof groupByDay>;
  recent: WcFixture[];
  byStage: Record<string, WcFixture[]>;
  sortedStages: string[];
  followed: string | null;
  refetch: () => Promise<unknown>;
};

const WorldCupDataContext = createContext<WorldCupPageData | null>(null);

function useWorldCupData(): WorldCupPageData {
  const ctx = useContext(WorldCupDataContext);
  if (!ctx) throw new Error("useWorldCupData must be used within WorldCupLayout");
  return ctx;
}

function StatusBadge({ fixture }: { fixture: WcFixture }) {
  if (isLive(fixture)) {
    return (
      <span className="wc-badge wc-badge--live">
        {liveBadgeLabel(fixture)}
      </span>
    );
  }
  if (isFinished(fixture)) {
    return <span className="wc-badge wc-badge--finished">FT</span>;
  }
  return null;
}

function TeamCrest({ crest, name }: { crest: string | null; name: string | null }) {
  const label = name?.trim() || "TBD";
  if (!crest) {
    return (
      <span className="wc-crest wc-crest--placeholder" aria-label={label}>
        {label.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={crest}
      alt={label}
      className="wc-crest"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function FixtureRow({ fixture }: { fixture: WcFixture }) {
  const navigate = useNavigate();
  const live = isLive(fixture);
  const finished = isFinished(fixture);
  const hasScore = finished || live;
  const canVote = canVoteOnFixture(fixture);

  const homeWon = fixture.score?.winner === "home";
  const awayWon = fixture.score?.winner === "away";

  return (
    <div
      id={`wc-fixture-${fixture.id}`}
      className={`wc-fixture${live ? " wc-fixture--live" : ""}${finished ? " wc-fixture--finished" : ""}${live || finished ? " wc-fixture--clickable" : ""}`}
      onClick={live || finished ? () => navigate(`/world-cup/match/${fixture.id}`) : undefined}
      role={live || finished ? "button" : undefined}
      tabIndex={live || finished ? 0 : undefined}
      onKeyDown={live || finished ? (e) => e.key === "Enter" && navigate(`/world-cup/match/${fixture.id}`) : undefined}
    >
      <div className={`wc-team wc-team--home${homeWon ? " wc-team--winner" : ""}`}>
        <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} />
        <span className="wc-team-name">{fixture.homeTeam.shortName ?? "TBD"}</span>
      </div>

      <div className="wc-center">
        <StatusBadge fixture={fixture} />
        {hasScore ? (
          <div className="wc-score">
            <span className={homeWon ? "wc-score-num wc-score-num--winner" : "wc-score-num"}>
              {fixture.score?.home ?? "–"}
            </span>
            <span className="wc-score-sep">:</span>
            <span className={awayWon ? "wc-score-num wc-score-num--winner" : "wc-score-num"}>
              {fixture.score?.away ?? "–"}
            </span>
          </div>
        ) : (
          <>
            <div className="wc-kickoff-time">{formatTime(fixture.kickoff)}</div>
            <div className="wc-kickoff-date">{countdownToKickoff(fixture.kickoff)}</div>
          </>
        )}
        {canVote && (
          <button
            type="button"
            className="wc-vote-btn"
            onClick={() => navigate(`/post/${fixture.campaignPostId}`)}
          >
            Vote
          </button>
        )}
      </div>

      <div className={`wc-team wc-team--away${awayWon ? " wc-team--winner" : ""}`}>
        <span className="wc-team-name">{fixture.awayTeam.shortName ?? "TBD"}</span>
        <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} />
      </div>
    </div>
  );
}

// ─── Top scorers / assists ────────────────────────────────────────────────────

type TopScorer = { playerId: number | null; name: string; team: string; teamCrest: string | null; goals: number; matchesPlayed: number };
type TopAssistant = { playerId: number | null; name: string; team: string; teamCrest: string | null; assists: number; matchesPlayed: number };

function PlayerRow({ rank, name, team, teamCrest, stat, statLabel, matches }: {
  rank: number; name: string; team: string; teamCrest: string | null; stat: number; statLabel: string; matches: number;
}) {
  return (
    <div className="wc-player-row">
      <span className="wc-player-rank">{rank}</span>
      <div className="wc-player-info">
        <span className="wc-player-name">{name}</span>
        <span className="wc-player-team">
          {teamCrest && (
            <img src={teamCrest} alt={team} className="wc-player-crest" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )}
          {team}
        </span>
      </div>
      <span className="wc-player-apps" title="Matches played">{matches} {matches === 1 ? "match" : "matches"}</span>
      <span className="wc-player-stat" title={statLabel}>{stat}</span>
    </div>
  );
}

function TopStatsSection({ scorers, assistants, loading }: {
  scorers: TopScorer[]; assistants: TopAssistant[]; loading: boolean;
}) {
  if (loading) return <p className="wc-status-msg">Loading stats…</p>;
  const noData = scorers.length === 0 && assistants.length === 0;
  if (noData) return <p className="wc-status-msg">No stats yet — available once matches have been played.</p>;
  return (
    <div className="wc-stats-grid">
      <section className="wc-stats-col">
        <h2 className="wc-stats-col-title">⚽ Top Scorers</h2>
        {scorers.length === 0
          ? <p className="wc-stats-empty">No goals recorded yet.</p>
          : scorers.map((s, i) => (
            <PlayerRow key={`${s.name}-${s.team}`} rank={i + 1} name={s.name} team={s.team} teamCrest={s.teamCrest} stat={s.goals} statLabel="Goals" matches={s.matchesPlayed} />
          ))
        }
      </section>
      <section className="wc-stats-col">
        <h2 className="wc-stats-col-title">🎯 Top Assists</h2>
        {assistants.length === 0
          ? <p className="wc-stats-empty">No assists recorded yet.</p>
          : assistants.map((a, i) => (
            <PlayerRow key={`${a.name}-${a.team}`} rank={i + 1} name={a.name} team={a.team} teamCrest={a.teamCrest} stat={a.assists} statLabel="Assists" matches={a.matchesPlayed} />
          ))
        }
      </section>
    </div>
  );
}

// ─── Group standings (points table) ──────────────────────────────────────────

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
      gMap.set(key, { name: side.name ?? "TBD", shortName: side.shortName ?? side.name ?? "TBD", crest: side.crest, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
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

function GroupStandings({ fixtures }: { fixtures: WcFixture[] }) {
  const tables = computeGroupTables(fixtures);
  if (!tables.length) return null;
  return (
    <section className="wc-stage wc-standings">
      <h2 className="wc-stage-title">📊 Group Standings</h2>
      <p className="wc-standings-note">
        <span className="wc-gs-dot wc-gs-dot--qualify" />Top 2 qualify &nbsp;
        <span className="wc-gs-dot wc-gs-dot--possible" />Best 3rd may qualify
      </p>
      <div className="wc-standings-grid">
        {tables.map((table) => (
          <div key={table.group} className="wc-standing-card">
            <div className="wc-standing-head">{table.label}</div>
            <table className="wc-standing-table">
              <thead>
                <tr>
                  <th className="wc-st-th wc-st-th--team">Team</th>
                  <th className="wc-st-th" title="Played">P</th>
                  <th className="wc-st-th" title="Won">W</th>
                  <th className="wc-st-th" title="Drawn">D</th>
                  <th className="wc-st-th" title="Lost">L</th>
                  <th className="wc-st-th" title="Goal Difference">GD</th>
                  <th className="wc-st-th wc-st-th--pts" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.teams.map((team, i) => (
                  <tr key={team.name} className={`wc-st-row${i < 2 ? " wc-st-row--qualify" : i === 2 ? " wc-st-row--possible" : ""}`}>
                    <td className="wc-st-td wc-st-td--team">
                      <span className="wc-st-pos">{i + 1}</span>
                      {team.crest
                        ? <img src={team.crest} alt={team.shortName} className="wc-st-crest" />
                        : <span className="wc-st-crest-ph" />}
                      <span className="wc-st-name">{team.shortName}</span>
                    </td>
                    <td className="wc-st-td">{team.played}</td>
                    <td className="wc-st-td">{team.won}</td>
                    <td className="wc-st-td">{team.drawn}</td>
                    <td className="wc-st-td">{team.lost}</td>
                    <td className="wc-st-td">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                    <td className="wc-st-td wc-st-td--pts">{team.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupSection({ group, fixtures }: { group: string; fixtures: WcFixture[] }) {
  const label = group.replace("GROUP_", "Group ");
  const sorted = [...fixtures].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  return (
    <div className="wc-group">
      <h3 className="wc-group-title">{label}</h3>
      <div className="wc-fixture-list">
        {sorted.map((f) => (
          <FixtureRow key={f.id} fixture={f} />
        ))}
      </div>
    </div>
  );
}

function StageSection({ stage, fixtures }: { stage: string; fixtures: WcFixture[] }) {
  const label = WC_STAGE_LABELS[stage] ?? stage;

  if (stage === "GROUP_STAGE") {
    const byGroup: Record<string, WcFixture[]> = {};
    for (const f of fixtures) {
      const g = f.group ?? "UNKNOWN";
      (byGroup[g] ??= []).push(f);
    }
    const sortedGroups = Object.keys(byGroup).sort();
    return (
      <section className="wc-stage">
        <h2 className="wc-stage-title">{label}</h2>
        <div className="wc-groups-grid">
          {sortedGroups.map((g) => (
            <GroupSection key={g} group={g} fixtures={byGroup[g]!} />
          ))}
        </div>
      </section>
    );
  }

  const sorted = [...fixtures].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  return (
    <section className="wc-stage">
      <h2 className="wc-stage-title">{label}</h2>
      <div className="wc-fixture-list wc-fixture-list--knockout">
        {sorted.map((f) => (
          <FixtureRow key={f.id} fixture={f} />
        ))}
      </div>
    </section>
  );
}

function WorldCupDataProvider({ children }: { children: ReactNode }) {
  const [pollMs, setPollMs] = useState(30_000);
  const { data, loading, error, refetch } = useQuery<{ worldCupFixtures: WcFixture[] }>(
    WORLD_CUP_FIXTURES,
    { fetchPolicy: "cache-and-network", pollInterval: pollMs },
  );
  const { data: statsData, loading: statsLoading, error: statsError } = useQuery<{
    worldCupTopScorers: TopScorer[];
    worldCupTopAssistants: TopAssistant[];
  }>(WORLD_CUP_TOP_STATS, { fetchPolicy: "cache-and-network", pollInterval: 120_000 });

  const followed = useFollowedTeam();
  const [, setTick] = useState(0);

  const fixtures = data?.worldCupFixtures ?? [];

  useEffect(() => {
    setPollMs(worldCupRoadMapPollMs(fixtures as BracketFixture[]));
  }, [fixtures]);
  const teams = fixtureTeams(fixtures);
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    function schedule() {
      const fast = needsSecondTick(upcomingFixtures(filtered));
      id = setTimeout(() => { setTick((n) => n + 1); schedule(); }, fast ? 1000 : 30_000);
    }
    schedule();
    return () => clearTimeout(id);
  });

  const live = liveFixtures(filtered);
  const upcomingDays = groupByDay(upcomingFixtures(filtered));
  const recent = finishedFixtures(filtered);

  const byStage: Record<string, WcFixture[]> = {};
  for (const f of filtered) (byStage[f.stage] ??= []).push(f);
  const sortedStages = Object.keys(byStage).sort(
    (a, b) => (WC_STAGE_ORDER[a] ?? 99) - (WC_STAGE_ORDER[b] ?? 99),
  );

  const value: WorldCupPageData = {
    fixtures,
    filtered,
    teams,
    loading,
    error: error as Error | undefined,
    statsData,
    statsLoading,
    statsError: statsError as Error | undefined,
    live,
    upcomingDays,
    recent,
    byStage,
    sortedStages,
    followed,
    refetch,
  };

  return <WorldCupDataContext.Provider value={value}>{children}</WorldCupDataContext.Provider>;
}

function WorldCupShell() {
  const {
    fixtures,
    teams,
    loading,
    error,
    followed,
  } = useWorldCupData();

  return (
    <div className="wc-page">
      <div className="wc-hero">
        <div className="wc-hero-inner">
          <span className="wc-hero-trophy">🏆</span>
          <div>
            <h1 className="wc-hero-title">FIFA World Cup 2026</h1>
            <p className="wc-hero-sub">USA · Canada · Mexico · Jun 11 – Jul 19</p>
          </div>
        </div>
      </div>

      {fixtures.length > 0 && (
        <div className="wc-filter-bar">
          <label className="wc-filter-label" htmlFor="wc-team-filter">
            Filter by team
          </label>
          <select
            id="wc-team-filter"
            className="wc-filter-select"
            value={followed ?? ""}
            onChange={(e) => setFollowedTeam(e.target.value || null)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.name ?? ""} value={t.name ?? ""}>
                {t.name ?? "TBD"}
              </option>
            ))}
          </select>
          {followed && (
            <button
              type="button"
              className="wc-filter-clear"
              onClick={() => setFollowedTeam(null)}
            >
              Clear
            </button>
          )}
          <span className="wc-filter-hint muted small">
            {followed
              ? "Saved — your team also shows in the feed widget."
              : "Pick a team to see only its matches."}
          </span>
        </div>
      )}

      <div className="wc-tab-bar" role="tablist">
        {WC_TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={`/world-cup/${tab.path}`}
            role="tab"
            className={({ isActive }) =>
              `wc-tab-btn${isActive ? " wc-tab-btn--active" : ""}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      {loading && fixtures.length === 0 && (
        <p className="wc-status-msg">Loading fixtures…</p>
      )}
      {error && (
        <p className="wc-status-msg wc-status-msg--error">
          Failed to load fixtures. {error.message}
        </p>
      )}
      {!loading && !error && fixtures.length === 0 && (
        <p className="wc-status-msg">
          No fixtures yet. An admin can sync them from the admin panel.
        </p>
      )}

      <Outlet />
    </div>
  );
}

export function WorldCupLayout() {
  return (
    <WorldCupDataProvider>
      <WorldCupShell />
    </WorldCupDataProvider>
  );
}

const LEGACY_TAB_PATH: Record<string, WorldCupTabId> = {
  fixtures: "fixtures",
  results: "results",
  standings: "standings",
  stats: "stats",
  bracket: "road-map",
  "road-map": "road-map",
};

/** Redirect /world-cup and old ?tab= links to dedicated tab routes. */
export function WorldCupIndexRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const focus = searchParams.get("focus");
  const path = tab && LEGACY_TAB_PATH[tab] ? LEGACY_TAB_PATH[tab] : "fixtures";
  const qs = focus ? `?focus=${encodeURIComponent(focus)}` : "";
  return <Navigate to={`/world-cup/${path}${qs}`} replace />;
}

export function WorldCupFixturesTab() {
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");
  const {
    fixtures,
    filtered,
    followed,
    live,
    upcomingDays,
    sortedStages,
    byStage,
  } = useWorldCupData();

  useEffect(() => {
    if (!focusId || fixtures.length === 0) return;
    const el = document.getElementById(`wc-fixture-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("wc-fixture--focus");
    const t = setTimeout(() => el.classList.remove("wc-fixture--focus"), 2400);
    return () => clearTimeout(t);
  }, [focusId, fixtures.length]);

  if (fixtures.length === 0) return null;

  return (
    <>
      {live.length > 0 && (
        <section className="wc-stage wc-stage--live">
          <h2 className="wc-stage-title">
            <span className="wc-live-dot" /> Live now
          </h2>
          <div className="wc-fixture-list wc-fixture-list--knockout">
            {live.map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}

      {upcomingDays.length > 0 && (
        <section className="wc-stage wc-stage--upnext">
          <h2 className="wc-stage-title">⏱ Up next</h2>
          {upcomingDays.map((g) => (
            <div className="wc-day" key={g.key}>
              <h3 className="wc-day-title">{g.label}</h3>
              <div className="wc-fixture-list wc-fixture-list--knockout">
                {g.fixtures.map((f) => (
                  <FixtureRow key={f.id} fixture={f} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <h2 className="wc-section-divider">Full schedule</h2>
      {sortedStages.map((stage) => (
        <StageSection key={stage} stage={stage} fixtures={byStage[stage]!} />
      ))}

      {followed && filtered.length === 0 && (
        <p className="wc-status-msg">No matches found for {followed}.</p>
      )}
    </>
  );
}

export function WorldCupResultsTab() {
  const { live, recent } = useWorldCupData();

  if (live.length === 0 && recent.length === 0) {
    return <p className="wc-status-msg">No results yet.</p>;
  }

  return (
    <>
      {live.length > 0 && (
        <section className="wc-stage wc-stage--live">
          <h2 className="wc-stage-title">
            <span className="wc-live-dot" /> Live now
          </h2>
          <div className="wc-fixture-list wc-fixture-list--knockout">
            {live.map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className="wc-stage wc-stage--results">
          <div className="wc-fixture-list wc-fixture-list--knockout">
            {recent.map((f) => (
              <FixtureRow key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function WorldCupStandingsTab() {
  const { filtered } = useWorldCupData();
  return <GroupStandings fixtures={filtered} />;
}

export function WorldCupStatsTab() {
  const { statsData, statsLoading, statsError } = useWorldCupData();

  if (statsError) {
    return (
      <p className="wc-status-msg wc-status-msg--error">
        Failed to load stats. {statsError.message}
      </p>
    );
  }

  return (
    <TopStatsSection
      scorers={statsData?.worldCupTopScorers ?? []}
      assistants={statsData?.worldCupTopAssistants ?? []}
      loading={statsLoading && !statsData}
    />
  );
}

export function WorldCupRoadMapTab() {
  const { fixtures, loading, refetch } = useWorldCupData();

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refetch]);

  if (loading && fixtures.length === 0) {
    return <p className="wc-status-msg">Loading road map…</p>;
  }

  return <WorldCupKnockoutBracket fixtures={fixtures} />;
}

/** @deprecated Use WorldCupRoadMapTab */
export const WorldCupBracketTab = WorldCupRoadMapTab;

/** @deprecated Use nested routes under /world-cup/:tab */
export function WorldCupPage() {
  return <Navigate to="/world-cup/fixtures" replace />;
}
