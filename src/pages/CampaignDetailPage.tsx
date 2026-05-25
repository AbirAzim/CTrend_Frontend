import { useQuery } from "@apollo/client";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CAMPAIGN_BY_SLUG } from "../graphql/campaigns";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  bannerText: string;
  bannerImageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
  isActive: boolean;
  prizePerWinner: number;
  rules: string | null;
  rulesBn: string | null;
  fixturesEnabled: boolean;
  startDate: string | null;
  endDate: string | null;
};

type FixtureTeam = { name: string | null; shortName: string | null; crest: string | null };
type FixtureScore = { home: number | null; away: number | null; winner: string | null };
type Fixture = {
  id: string;
  homeTeam: FixtureTeam;
  awayTeam: FixtureTeam;
  kickoff: string;
  status: string;
  stage: string;
  group: string | null;
  matchday: number | null;
  score: FixtureScore;
  campaignPostId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}


const STAGE_ORDER: Record<string, number> = {
  GROUP_STAGE: 0,
  LAST_16: 1,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 3,
  THIRD_PLACE: 4,
  FINAL: 5,
};

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter Finals",
  SEMI_FINALS: "Semi Finals",
  THIRD_PLACE: "Third Place",
  FINAL: "Final",
};

// ─── Group standings ──────────────────────────────────────────────────────────

type TeamStanding = {
  name: string;
  shortName: string;
  crest: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

type GroupTable = { group: string; label: string; teams: TeamStanding[] };

function computeGroupTables(fixtures: Fixture[]): GroupTable[] {
  const tables = new Map<string, Map<string, TeamStanding>>();

  // Pass 1 — register every team seen in group-stage fixtures
  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group) continue;
    if (!tables.has(f.group)) tables.set(f.group, new Map());
    const gMap = tables.get(f.group)!;
    for (const side of [f.homeTeam, f.awayTeam]) {
      const key = side.name ?? "";
      if (!key || key === "TBD" || gMap.has(key)) continue;
      gMap.set(key, {
        name: side.name ?? "TBD",
        shortName: side.shortName ?? side.name ?? "TBD",
        crest: side.crest,
        played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0,
      });
    }
  }

  // Pass 2 — tally finished matches only
  for (const f of fixtures) {
    if (f.stage !== "GROUP_STAGE" || !f.group || f.status !== "FINISHED") continue;
    if (f.score.home === null || f.score.away === null) continue;
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

function GroupTablesSection({ fixtures }: { fixtures: Fixture[] }) {
  const tables = computeGroupTables(fixtures);
  if (!tables.length) return null;

  return (
    <section className="cd-section">
      <h2 className="cd-section-title">Group Standings</h2>
      <p className="cd-gs-note">
        <span className="cd-gs-dot cd-gs-dot--qualify" />Top 2 advance &nbsp;
        <span className="cd-gs-dot cd-gs-dot--possible" />Best 3rd possible &nbsp;·&nbsp; live from results
      </p>
      <div className="cd-groups-grid">
        {tables.map((table) => (
          <div key={table.group} className="cd-group-card">
            <div className="cd-gc-head">{table.label}</div>
            <table className="cd-gt">
              <thead>
                <tr>
                  <th className="cd-gt-th cd-gt-th--team">Team</th>
                  <th className="cd-gt-th" title="Played">P</th>
                  <th className="cd-gt-th" title="Won">W</th>
                  <th className="cd-gt-th" title="Drawn">D</th>
                  <th className="cd-gt-th" title="Lost">L</th>
                  <th className="cd-gt-th" title="Goal Difference">GD</th>
                  <th className="cd-gt-th cd-gt-th--pts" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.teams.map((team, i) => (
                  <tr
                    key={team.name}
                    className={`cd-gt-row${i < 2 ? " cd-gt-row--qualify" : i === 2 ? " cd-gt-row--possible" : ""}`}
                  >
                    <td className="cd-gt-td cd-gt-td--team">
                      <div className="cd-gt-team-cell">
                        <span className="cd-gt-pos">{i + 1}</span>
                        {team.crest
                          ? <img src={team.crest} alt={team.shortName} className="cd-gt-crest" />
                          : <span className="cd-gt-crest-ph" />}
                        <span className="cd-gt-name">{team.shortName}</span>
                      </div>
                    </td>
                    <td className="cd-gt-td">{team.played}</td>
                    <td className="cd-gt-td">{team.won}</td>
                    <td className="cd-gt-td">{team.drawn}</td>
                    <td className="cd-gt-td">{team.lost}</td>
                    <td className="cd-gt-td">{team.gd > 0 ? `+${team.gd}` : team.gd}</td>
                    <td className="cd-gt-td cd-gt-td--pts">{team.pts}</td>
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

// ─── Rules section ────────────────────────────────────────────────────────────

function RulesSection({ rules, rulesBn }: { rules: string; rulesBn?: string | null }) {
  const [lang, setLang] = useState<"en" | "bn">("en");
  const activeRules = lang === "bn" && rulesBn ? rulesBn : rules;
  const lines = activeRules.split("\n").filter(Boolean);

  return (
    <section className="cd-section">
      <div className="cd-rules-header">
        <h2 className="cd-section-title" style={{ margin: 0 }}>How to participate</h2>
        {rulesBn && (
          <div className="cd-lang-toggle">
            <button
              type="button"
              className={`cd-lang-btn${lang === "en" ? " cd-lang-btn--active" : ""}`}
              onClick={() => setLang("en")}
            >
              English
            </button>
            <button
              type="button"
              className={`cd-lang-btn${lang === "bn" ? " cd-lang-btn--active" : ""}`}
              onClick={() => setLang("bn")}
            >
              বাংলা
            </button>
          </div>
        )}
      </div>
      <ol className="cd-rules-list">
        {lines.map((line, i) => {
          const text = line.replace(/^\d+\.\s*/, "");
          return (
            <li key={i} className="cd-rule-item">
              <span className="cd-rule-num">{i + 1}</span>
              <span>{text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─── Fixture card ─────────────────────────────────────────────────────────────

function FixtureCard({ fixture }: { fixture: Fixture }) {
  const navigate = useNavigate();
  const now = new Date();
  const kickoff = new Date(fixture.kickoff);
  const isUpcoming = kickoff > now && fixture.status !== "FINISHED";
  const isLive = fixture.status === "IN_PLAY" || fixture.status === "PAUSED";
  const isFinished = fixture.status === "FINISHED";
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

  return (
    <div className={`cd-fc${isLive ? " cd-fc--live" : ""}${isFinished ? " cd-fc--done" : ""}`}>
      {/* Header */}
      <div className="cd-fc-header">
        <span className="cd-fc-label">{matchLabel}</span>
        <div className="cd-fc-header-right">
          {isLive && <span className="cd-fc-live-dot" />}
          <span className="cd-fc-date">{dateStr}</span>
        </div>
      </div>

      {/* Body */}
      <div className="cd-fc-body">
        {/* Home team */}
        <div className={`cd-fc-team cd-fc-team--home${homeWon ? " cd-fc-team--winner" : ""}`}>
          <span className="cd-fc-name">{homeName}</span>
          {fixture.homeTeam.crest
            ? <img src={fixture.homeTeam.crest} alt={homeName} className="cd-fc-crest" />
            : <span className="cd-fc-crest-ph" />}
        </div>

        {/* Center */}
        <div className="cd-fc-center">
          {isLive && <span className="cd-fc-live-badge">Live</span>}
          {hasScore ? (
            <>
              <div className="cd-fc-score">
                <span className={`cd-fc-sn${homeWon ? " cd-fc-sn--w" : ""}`}>{fixture.score.home ?? "–"}</span>
                <span className="cd-fc-ssep">–</span>
                <span className={`cd-fc-sn${awayWon ? " cd-fc-sn--w" : ""}`}>{fixture.score.away ?? "–"}</span>
              </div>
              {isFinished && <span className="cd-fc-ft">Full Time</span>}
            </>
          ) : (
            <>
              <span className="cd-fc-time">{timeStr}</span>
              <span className="cd-fc-vs">vs</span>
            </>
          )}
        </div>

        {/* Away team */}
        <div className={`cd-fc-team cd-fc-team--away${awayWon ? " cd-fc-team--winner" : ""}`}>
          {fixture.awayTeam.crest
            ? <img src={fixture.awayTeam.crest} alt={awayName} className="cd-fc-crest" />
            : <span className="cd-fc-crest-ph" />}
          <span className="cd-fc-name">{awayName}</span>
        </div>
      </div>

      {/* Vote footer */}
      {fixture.campaignPostId && isUpcoming && (
        <div className="cd-fc-footer">
          <button
            type="button"
            className="cd-fc-vote-btn"
            onClick={() => navigate(`/post/${fixture.campaignPostId}`)}
          >
            Cast your vote →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Fixtures section (World Cup) ─────────────────────────────────────────────

function FixturesSection() {
  const { data, loading } = useQuery<{ worldCupFixtures: Fixture[] }>(
    WORLD_CUP_FIXTURES,
    { fetchPolicy: "cache-and-network" },
  );

  const fixtures = data?.worldCupFixtures ?? [];

  // Show only upcoming + live matches first, then finished
  const now = new Date();
  const upcoming = fixtures.filter((f) => new Date(f.kickoff) > now || f.status === "IN_PLAY" || f.status === "PAUSED");
  const finished = fixtures.filter((f) => f.status === "FINISHED");

  const byStage = (list: Fixture[]) => {
    const map: Record<string, Fixture[]> = {};
    for (const f of list) {
      if (!map[f.stage]) map[f.stage] = [];
      map[f.stage].push(f);
    }
    return Object.entries(map).sort(
      ([a], [b]) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99),
    );
  };

  if (loading && !fixtures.length) {
    return (
      <section className="cd-section">
        <h2 className="cd-section-title">Matches</h2>
        <p className="muted small">Loading fixtures…</p>
      </section>
    );
  }

  if (!fixtures.length) {
    return (
      <section className="cd-section">
        <h2 className="cd-section-title">Matches</h2>
        <p className="muted small">No fixtures synced yet — check back soon.</p>
      </section>
    );
  }

  return (
    <>
      {/* Group tables — computed from all fixtures, shown whenever group-stage data exists */}
      <GroupTablesSection fixtures={fixtures} />

      {upcoming.length > 0 && (
        <section className="cd-section">
          <h2 className="cd-section-title">Upcoming Matches</h2>
          <div className="cd-fixture-list">
            {byStage(upcoming).map(([stage, list]) => (
              <div key={stage} className="cd-stage-group">
                <p className="cd-stage-label">{STAGE_LABELS[stage] ?? stage}</p>
                {[...list]
                  .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
                  .map((f) => <FixtureCard key={f.id} fixture={f} />)}
              </div>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section className="cd-section">
          <h2 className="cd-section-title">Finished Matches</h2>
          <div className="cd-fixture-list">
            {[...finished]
              .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())
              .map((f) => <FixtureCard key={f.id} fixture={f} />)}
          </div>
        </section>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CampaignDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data, loading, error } = useQuery<{ campaign: Campaign | null }>(
    CAMPAIGN_BY_SLUG,
    { variables: { slug }, skip: !slug, fetchPolicy: "cache-and-network" },
  );

  if (loading) {
    return <div className="cd-page"><p className="muted small cd-loading">Loading…</p></div>;
  }

  if (error || !data?.campaign) {
    return (
      <div className="cd-page">
        <p className="cd-not-found">Campaign not found.</p>
        <button type="button" className="btn-ghost" onClick={() => navigate("/")}>
          Back to feed
        </button>
      </div>
    );
  }

  const c = data.campaign;

  return (
    <div className="cd-page">
      {/* Hero */}
      <div
        className="cd-hero"
        style={c.bannerImageUrl ? { backgroundImage: `url(${c.bannerImageUrl})` } : undefined}
      >
        <div className="cd-hero-overlay" />
        <div className="cd-hero-body">
          <span className="cd-hero-badge">Campaign</span>
          <h1 className="cd-hero-title">{c.name}</h1>
          {c.description && <p className="cd-hero-desc">{c.description}</p>}
          <div className="cd-hero-meta">
            {c.startDate && c.endDate && (
              <span className="cd-meta-chip">
                {formatDate(c.startDate)} – {formatDate(c.endDate)}
              </span>
            )}
            <span className="cd-meta-chip cd-meta-chip--prize">
              🎁 {c.prizePerWinner} BDT per winner
            </span>
          </div>
        </div>
      </div>

      {/* Prize callout */}
      <div className="cd-prize-callout">
        <span className="cd-prize-icon">🏆</span>
        <div>
          <p className="cd-prize-label">Prize per match winner</p>
          <p className="cd-prize-amount">{c.prizePerWinner} BDT</p>
        </div>
        <p className="cd-prize-note">
          Paid via bKash to the randomly drawn winner from all correct predictions.
        </p>
      </div>

      {/* Rules */}
      {c.rules && <RulesSection rules={c.rules} rulesBn={c.rulesBn} />}

      {/* Fixtures (World Cup only) */}
      {c.fixturesEnabled && <FixturesSection />}
    </div>
  );
}
