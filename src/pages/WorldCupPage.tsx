import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";

type FixtureTeam = { name: string; shortName: string; crest: string };
type FixtureScore = { home: number | null; away: number | null; winner: string | null };

type Fixture = {
  id: string;
  externalId: number;
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

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "IN_PLAY" || status === "PAUSED") {
    return <span className="wc-badge wc-badge--live">LIVE</span>;
  }
  if (status === "FINISHED") {
    return <span className="wc-badge wc-badge--finished">FT</span>;
  }
  return null;
}

function TeamCrest({ crest, name }: { crest: string; name: string }) {
  if (!crest) {
    return (
      <span className="wc-crest wc-crest--placeholder" aria-label={name}>
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={crest}
      alt={name}
      className="wc-crest"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function FixtureRow({ fixture }: { fixture: Fixture }) {
  const navigate = useNavigate();
  const now = new Date();
  const kickoff = new Date(fixture.kickoff);
  const isUpcoming = kickoff > now;
  const isLive = fixture.status === "IN_PLAY" || fixture.status === "PAUSED";
  const isFinished = fixture.status === "FINISHED";
  const hasScore = isFinished || isLive;
  const canVote = !!fixture.campaignPostId && isUpcoming;

  const homeWon = fixture.score.winner === "HOME_TEAM";
  const awayWon = fixture.score.winner === "AWAY_TEAM";

  return (
    <div className={`wc-fixture${isLive ? " wc-fixture--live" : ""}${isFinished ? " wc-fixture--finished" : ""}`}>
      <div className={`wc-team wc-team--home${homeWon ? " wc-team--winner" : ""}`}>
        <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} />
        <span className="wc-team-name">{fixture.homeTeam.shortName}</span>
      </div>

      <div className="wc-center">
        <StatusBadge status={fixture.status} />
        {hasScore ? (
          <div className="wc-score">
            <span className={homeWon ? "wc-score-num wc-score-num--winner" : "wc-score-num"}>
              {fixture.score.home ?? "–"}
            </span>
            <span className="wc-score-sep">:</span>
            <span className={awayWon ? "wc-score-num wc-score-num--winner" : "wc-score-num"}>
              {fixture.score.away ?? "–"}
            </span>
          </div>
        ) : (
          <div className="wc-kickoff-time">{formatKickoff(fixture.kickoff)}</div>
        )}
        {!hasScore && <div className="wc-kickoff-date">{new Date(fixture.kickoff).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>}
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
        <span className="wc-team-name">{fixture.awayTeam.shortName}</span>
        <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} />
      </div>
    </div>
  );
}

function GroupSection({ group, fixtures }: { group: string; fixtures: Fixture[] }) {
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

function StageSection({ stage, fixtures }: { stage: string; fixtures: Fixture[] }) {
  const label = STAGE_LABELS[stage] ?? stage;
  const isGroupStage = stage === "GROUP_STAGE";

  if (isGroupStage) {
    const byGroup: Record<string, Fixture[]> = {};
    for (const f of fixtures) {
      const g = f.group ?? "UNKNOWN";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(f);
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

export function WorldCupPage() {
  const { data, loading, error } = useQuery<{ worldCupFixtures: Fixture[] }>(
    WORLD_CUP_FIXTURES,
    { fetchPolicy: "cache-and-network" },
  );

  const fixtures = data?.worldCupFixtures ?? [];

  const byStage: Record<string, Fixture[]> = {};
  for (const f of fixtures) {
    if (!byStage[f.stage]) byStage[f.stage] = [];
    byStage[f.stage].push(f);
  }

  const sortedStages = Object.keys(byStage).sort(
    (a, b) => (STAGE_ORDER[a] ?? 99) - (STAGE_ORDER[b] ?? 99),
  );

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

      {sortedStages.map((stage) => (
        <StageSection key={stage} stage={stage} fixtures={byStage[stage]!} />
      ))}
    </div>
  );
}
