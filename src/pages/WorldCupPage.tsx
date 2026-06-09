import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";
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
  isUpcoming,
  liveFixtures,
  liveMinute,
  upcomingFixtures,
} from "../lib/worldCupFixtures";
import { setFollowedTeam, useFollowedTeam } from "../lib/wcTeam";

function StatusBadge({ fixture }: { fixture: WcFixture }) {
  if (isLive(fixture)) {
    return <span className="wc-badge wc-badge--live">LIVE {liveMinute(fixture.kickoff)}&apos;</span>;
  }
  if (isFinished(fixture)) {
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

function FixtureRow({ fixture }: { fixture: WcFixture }) {
  const navigate = useNavigate();
  const live = isLive(fixture);
  const finished = isFinished(fixture);
  const upcoming = isUpcoming(fixture);
  const hasScore = finished || live;
  const canVote = !!fixture.campaignPostId && upcoming;

  const homeWon = fixture.score.winner === "HOME_TEAM";
  const awayWon = fixture.score.winner === "AWAY_TEAM";

  return (
    <div
      className={`wc-fixture${live ? " wc-fixture--live" : ""}${finished ? " wc-fixture--finished" : ""}`}
    >
      <div className={`wc-team wc-team--home${homeWon ? " wc-team--winner" : ""}`}>
        <TeamCrest crest={fixture.homeTeam.crest} name={fixture.homeTeam.name} />
        <span className="wc-team-name">{fixture.homeTeam.shortName}</span>
      </div>

      <div className="wc-center">
        <StatusBadge fixture={fixture} />
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
        <span className="wc-team-name">{fixture.awayTeam.shortName}</span>
        <TeamCrest crest={fixture.awayTeam.crest} name={fixture.awayTeam.name} />
      </div>
    </div>
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

export function WorldCupPage() {
  const { data, loading, error } = useQuery<{ worldCupFixtures: WcFixture[] }>(
    WORLD_CUP_FIXTURES,
    { fetchPolicy: "cache-and-network", pollInterval: 60_000 },
  );
  const followed = useFollowedTeam();

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
              <option key={t.name} value={t.name}>
                {t.name}
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

      {fixtures.length > 0 && (
        <>
          <h2 className="wc-section-divider">Full schedule</h2>
          {sortedStages.map((stage) => (
            <StageSection key={stage} stage={stage} fixtures={byStage[stage]!} />
          ))}
        </>
      )}

      {followed && filtered.length === 0 && (
        <p className="wc-status-msg">No matches found for {followed}.</p>
      )}
    </div>
  );
}
