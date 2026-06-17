import { useQuery } from "@apollo/client";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { WORLD_CUP_FIXTURE_DETAILS } from "../graphql/worldcup";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventPlayer = { id?: number | null; name?: string | null };

type MatchEvent = {
  time: number;
  timeExtra?: number | null;
  team: "home" | "away";
  type: string;
  detail: string;
  player: EventPlayer;
  assist?: EventPlayer | null;
};

type LineupPlayer = {
  id?: number | null;
  name: string;
  number: number;
  pos?: string | null;
  grid?: string | null;
  photo?: string | null;
};

type LineupCoach = { id?: number | null; name: string; photo?: string | null };

type MatchLineup = {
  team: "home" | "away";
  formation: string;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
  coach: LineupCoach;
};

type MatchStat = { type: string; home?: string | null; away?: string | null };

type PlayerRating = {
  playerId: number;
  name: string;
  team: "home" | "away";
  rating?: string | null;
  photo?: string | null;
};

type FixtureDetails = {
  id: string;
  homeTeam: { name: string; shortName: string; crest: string };
  awayTeam: { name: string; shortName: string; crest: string };
  kickoff: string;
  status: string;
  minute?: number | null;
  stage: string;
  group?: string | null;
  score: { home?: number | null; away?: number | null; winner?: string | null };
  venue?: { name: string; city: string } | null;
  campaignPostId?: string | null;
  matchEndedAt?: string | null;
  events: MatchEvent[];
  lineups: MatchLineup[];
  stats: MatchStat[];
  playerRatings: PlayerRating[];
  detailsSyncedAt?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLive(status: string) {
  return status === "IN_PLAY" || status === "PAUSED";
}
function isFinished(status: string) {
  return status === "FINISHED";
}

function minuteLabel(e: MatchEvent) {
  return e.timeExtra != null && e.timeExtra > 0
    ? `${e.time}+${e.timeExtra}'`
    : `${e.time}'`;
}

function shortName(full?: string | null) {
  if (!full) return "";
  const parts = full.trim().split(" ");
  return parts.length === 1 ? parts[0] : parts[parts.length - 1];
}

// Build player-id → photo map from lineups
function buildPhotoMap(lineups: MatchLineup[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const l of lineups) {
    for (const p of [...l.startXI, ...l.substitutes]) {
      if (p.id != null && p.photo) map.set(p.id, p.photo);
    }
  }
  return map;
}

// Goal scorers per team
function goalScorers(events: MatchEvent[], team: "home" | "away") {
  return events
    .filter(
      (e) =>
        e.type === "Goal" &&
        e.team === team &&
        !e.detail.toLowerCase().includes("disallow"),
    )
    .sort((a, b) => a.time - b.time)
    .map((e) => {
      const min = minuteLabel(e);
      const name = shortName(e.player.name);
      return e.detail.includes("Own Goal") ? `${name} ${min} (OG)` : `${name} ${min}`;
    });
}

function ratingColor(r: number): string {
  if (r >= 8.5) return "#f59e0b"; // gold
  if (r >= 7.5) return "#22c55e"; // green
  if (r >= 6.5) return "#f97316"; // orange
  return "#ef4444"; // red
}

function motm(ratings: PlayerRating[]): PlayerRating | null {
  if (!ratings.length) return null;
  return ratings.reduce((best, cur) => {
    const bn = parseFloat(best.rating ?? "0");
    const cn = parseFloat(cur.rating ?? "0");
    return cn > bn ? cur : best;
  });
}

function deriveHalfScore(events: MatchEvent[]) {
  let home = 0, away = 0;
  for (const e of events) {
    if (e.type !== "Goal" || e.detail.toLowerCase().includes("disallow") || e.time > 45) continue;
    if (e.detail.includes("Own Goal")) { if (e.team === "home") away++; else home++; }
    else { if (e.team === "home") home++; else away++; }
  }
  return { home, away };
}

// ─── Event icon ───────────────────────────────────────────────────────────────

function EvIcon({ type, detail }: { type: string; detail: string }) {
  if (type === "Goal") {
    if (detail.includes("Own Goal")) return <span className="md-eico md-eico--goal">⚽ <small>OG</small></span>;
    if (detail.includes("Penalty")) return <span className="md-eico md-eico--goal">⚽ <small>P</small></span>;
    return <span className="md-eico md-eico--goal">⚽</span>;
  }
  if (type === "Card") {
    const red = detail.toLowerCase().includes("red") || detail.includes("Second Yellow");
    return <span className={`md-eico md-eico--card ${red ? "md-eico--red" : "md-eico--yellow"}`} />;
  }
  if (type === "subst") return (
    <span className="md-eico md-eico--sub">
      <span className="md-sub-in">▲</span>
      <span className="md-sub-out">▼</span>
    </span>
  );
  if (type === "Var") return <span className="md-eico md-eico--var">VAR</span>;
  return <span className="md-eico">·</span>;
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ fixture }: { fixture: FixtureDetails }) {
  const { events, score, status } = fixture;
  const live = isLive(status);
  const finished = isFinished(status);

  if (events.length === 0) {
    if (live) {
      return (
        <div className="md-syncing">
          <div className="md-sync-spinner" />
          <div className="md-sync-title">Syncing live events…</div>
          <div className="md-sync-sub">Updates every minute · Page refreshes automatically</div>
        </div>
      );
    }
    return (
      <div className="md-empty">
        {finished ? "No event data available." : "Events will appear once the match starts."}
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => {
    const at = a.time + (a.timeExtra ?? 0) * 0.1;
    const bt = b.time + (b.timeExtra ?? 0) * 0.1;
    return bt - at;
  });

  const halfScore = finished ? deriveHalfScore(events) : null;

  type Row =
    | { kind: "event"; event: MatchEvent }
    | { kind: "divider"; label: string };

  const rows: Row[] = [];
  if (finished || (score.home != null && score.away != null)) {
    const label = finished
      ? `Full-Time  ${score.home ?? 0} – ${score.away ?? 0}`
      : `${score.home ?? 0} – ${score.away ?? 0}`;
    rows.push({ kind: "divider", label });
  }

  let htInserted = false;
  for (const e of sorted) {
    if (!htInserted && halfScore && e.time <= 45) {
      rows.push({ kind: "divider", label: `Half Time  ${halfScore.home} – ${halfScore.away}` });
      htInserted = true;
    }
    rows.push({ kind: "event", event: e });
  }
  if (!htInserted && halfScore) {
    rows.push({ kind: "divider", label: `Half Time  ${halfScore.home} – ${halfScore.away}` });
  }

  return (
    <div className="md-overview">
      <div className="md-ov-header">Key Events</div>
      <div className="md-ov-list">
        {rows.map((row, i) => {
          if (row.kind === "divider") {
            return <div key={i} className="md-ov-divider">{row.label}</div>;
          }
          const e = row.event;
          const isHome = e.team === "home";
          const name = e.player.name ?? "Unknown";
          const assist = e.assist?.name ?? null;
          const subDetail = e.type === "subst" ? assist : e.type === "Goal" && assist ? `Assist: ${assist}` : null;

          return (
            <div key={i} className={`md-ev-row${e.type === "Goal" ? " md-ev-row--goal" : ""}`}>
              {/* Home side */}
              <div className={`md-ev-side md-ev-side--home${!isHome ? " md-ev-side--empty" : ""}`}>
                {isHome && (
                  <>
                    <span className="md-ev-name">{name}</span>
                    {subDetail && <span className="md-ev-sub">{e.type === "subst" ? `for ${subDetail}` : subDetail}</span>}
                  </>
                )}
              </div>

              {/* Center: icon + minute */}
              <div className="md-ev-center">
                <EvIcon type={e.type} detail={e.detail} />
                <span className="md-ev-min">{minuteLabel(e)}</span>
              </div>

              {/* Away side */}
              <div className={`md-ev-side md-ev-side--away${isHome ? " md-ev-side--empty" : ""}`}>
                {!isHome && (
                  <>
                    <span className="md-ev-name">{name}</span>
                    {subDetail && <span className="md-ev-sub">{e.type === "subst" ? `for ${subDetail}` : subDetail}</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lineup tab ───────────────────────────────────────────────────────────────

function playerPhoto(player: LineupPlayer, photoMap: Map<number, string>): string | null {
  if (player.photo) return player.photo;
  if (player.id != null) {
    const mapped = photoMap.get(player.id);
    if (mapped) return mapped;
    return `https://media.api-sports.io/football/players/${player.id}.png`;
  }
  return null;
}

function PitchAvatar({
  player,
  photoMap,
  ratingMap,
}: {
  player: LineupPlayer;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
}) {
  const photo = playerPhoto(player, photoMap);
  const [imgFailed, setImgFailed] = useState(false);
  const rating = player.id != null ? ratingMap.get(player.id) : undefined;

  return (
    <div className="md-pa">
      <div className="md-pa-circle">
        {photo && !imgFailed ? (
          <img
            src={photo}
            alt={player.name}
            className="md-pa-img"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="md-pa-num">{player.number}</span>
        )}
        {photo && !imgFailed && (
          <span className="md-pa-num-badge">{player.number}</span>
        )}
      </div>
      {rating && (
        <span className="md-pa-rating" style={{ background: ratingColor(parseFloat(rating)) }}>
          {rating}
        </span>
      )}
      <span className="md-pa-label">{shortName(player.name)}</span>
    </div>
  );
}

function FormationRows({
  players,
  reverse,
  photoMap,
  ratingMap,
}: {
  players: LineupPlayer[];
  reverse: boolean;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
}) {
  const byRow = new Map<number, LineupPlayer[]>();
  for (const p of players) {
    if (!p.grid) continue;
    const row = parseInt(p.grid.split(":")[0], 10);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row)!.push(p);
  }
  const noGrid = players.filter((p) => !p.grid);
  if (noGrid.length && !byRow.has(0)) byRow.set(0, noGrid);

  let rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
  if (reverse) rows = rows.reverse();

  return (
    <div className="md-frows">
      {rows.map(([row, rps]) => {
        const sorted = [...rps].sort((a, b) => {
          const ac = parseInt((a.grid ?? "0:1").split(":")[1], 10);
          const bc = parseInt((b.grid ?? "0:1").split(":")[1], 10);
          return ac - bc;
        });
        return (
          <div key={row} className="md-frow">
            {sorted.map((p) => (
              <PitchAvatar key={p.id ?? p.name} player={p} photoMap={photoMap} ratingMap={ratingMap} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BenchCell({
  player,
  photoMap,
  ratingMap,
}: {
  player: LineupPlayer;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
}) {
  const photo = playerPhoto(player, photoMap);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = photo && !imgFailed;
  const rating = player.id != null ? ratingMap.get(player.id) : undefined;

  const avatar = (
    <div className="md-bc-avatar">
      {showPhoto ? (
        <img src={photo} alt={player.name} className="md-bc-img" onError={() => setImgFailed(true)} />
      ) : (
        <span className="md-bc-num">{player.number}</span>
      )}
    </div>
  );

  const info = (
    <div className="md-bc-info">
      <span className="md-bc-name">{shortName(player.name)}</span>
      <div className="md-bc-meta">
        <span className="md-bc-pos">{player.pos ?? ""}</span>
        {rating && (
          <span className="md-bc-rating" style={{ background: ratingColor(parseFloat(rating)) }}>
            {rating}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="md-bc">
      {avatar}{info}
    </div>
  );
}

function LineupTab({ fixture }: { fixture: FixtureDetails }) {
  const { lineups } = fixture;
  if (lineups.length === 0) {
    return <div className="md-empty">Lineups will appear closer to kickoff.</div>;
  }

  const homeL = lineups.find((l) => l.team === "home");
  const awayL = lineups.find((l) => l.team === "away");
  const photoMap = buildPhotoMap(lineups);
  const ratingMap = new Map(
    fixture.playerRatings
      .filter((r) => r.rating != null)
      .map((r) => [r.playerId, r.rating as string])
  );

  return (
    <div className="md-lineup">
      {/* ── Pitch ── */}
      <div className="md-pitch">
        {/* Top half: Home (GK at top, FW toward center) */}
        {homeL && (
          <div className="md-pitch-half">
            <div className="md-pitch-team-badge">
              {fixture.homeTeam.crest && (
                <img src={fixture.homeTeam.crest} alt={fixture.homeTeam.name} className="md-pitch-team-crest" />
              )}
              <span>{fixture.homeTeam.shortName}</span>
              <span className="md-pitch-formation">{homeL.formation}</span>
            </div>
            <FormationRows players={homeL.startXI} reverse={false} photoMap={photoMap} ratingMap={ratingMap} />
          </div>
        )}

        {/* Center line */}
        <div className="md-pitch-center">
          <div className="md-pitch-center-line" />
          <div className="md-pitch-center-circle" />
        </div>

        {/* Bottom half: Away (FW toward center, GK at bottom) */}
        {awayL && (
          <div className="md-pitch-half">
            <FormationRows players={awayL.startXI} reverse={true} photoMap={photoMap} ratingMap={ratingMap} />
            <div className="md-pitch-team-badge md-pitch-team-badge--bottom">
              {fixture.awayTeam.crest && (
                <img src={fixture.awayTeam.crest} alt={fixture.awayTeam.name} className="md-pitch-team-crest" />
              )}
              <span>{fixture.awayTeam.shortName}</span>
              <span className="md-pitch-formation">{awayL.formation}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Bench (side-by-side) ── */}
      {(homeL || awayL) && (
        <div className="md-bench">
          {/* Header row */}
          <div className="md-bench-hdr">
            <div className="md-bench-hdr-side">
              {fixture.homeTeam.crest && <img src={fixture.homeTeam.crest} alt="" className="md-bench-hdr-crest" />}
              <span>{fixture.homeTeam.shortName}</span>
            </div>
            <span className="md-bench-hdr-label">Substitutes</span>
            <div className="md-bench-hdr-side md-bench-hdr-side--r">
              <span>{fixture.awayTeam.shortName}</span>
              {fixture.awayTeam.crest && <img src={fixture.awayTeam.crest} alt="" className="md-bench-hdr-crest" />}
            </div>
          </div>

          {/* Player rows */}
          {Array.from({
            length: Math.max(homeL?.substitutes.length ?? 0, awayL?.substitutes.length ?? 0),
          }).map((_, i) => {
            const hp = homeL?.substitutes[i];
            const ap = awayL?.substitutes[i];
            return (
              <div key={i} className="md-bench-pair">
                {hp ? <BenchCell player={hp} photoMap={photoMap} ratingMap={ratingMap} /> : <div className="md-bc md-bc--empty" />}
                <div className="md-bench-pair-div" />
                {ap ? <BenchCell player={ap} photoMap={photoMap} ratingMap={ratingMap} /> : <div className="md-bc md-bc--empty" />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Coaches ── */}
      {(homeL?.coach || awayL?.coach) && (
        <div className="md-coaches">
          <div className="md-coaches-title">Management</div>
          <div className="md-coaches-row">
            {[homeL, awayL].filter(Boolean).map((l) => {
              if (!l?.coach) return null;
              return (
                <div key={l.team} className="md-coach-card">
                  {l.coach.photo && (
                    <img src={l.coach.photo} alt={l.coach.name} className="md-coach-photo"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <div>
                    <div className="md-coach-name">{l.coach.name}</div>
                    <div className="md-coach-role">Head Coach</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="md-legend">
        <div className="md-legend-item"><span className="md-eico md-eico--goal">⚽</span> Goal</div>
        <div className="md-legend-item">
          <span className="md-eico md-eico--sub"><span className="md-sub-in">▲</span><span className="md-sub-out">▼</span></span>
          Substitution
        </div>
        <div className="md-legend-item"><span className="md-eico md-eico--card md-eico--yellow" /> Yellow card</div>
        <div className="md-legend-item"><span className="md-eico md-eico--card md-eico--red" /> Red card</div>
      </div>
    </div>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────────────

const STAT_LABEL: Record<string, string> = {
  "Ball Possession": "Possession",
  "expected_goals": "Expected Goals (xG)",
  "Shots on Goal": "Shots on Target",
  "Total Shots": "Total Shots",
  "Passes %": "Pass Accuracy",
  "Fouls": "Fouls Conceded",
  "Corner Kicks": "Corners",
  "Offsides": "Offsides",
  "Yellow Cards": "Yellow Cards",
  "Red Cards": "Red Cards",
  "Blocked Shots": "Blocked Shots",
  "Goalkeeper Saves": "Goalkeeper Saves",
  "Shots insidebox": "Shots Inside the Box",
  "Shots outsidebox": "Shots Outside the Box",
  "Total passes": "Total Passes",
  "Passes accurate": "Accurate Passes",
};

function parseNum(v?: string | null): number {
  if (!v) return 0;
  return parseFloat(v.replace("%", "")) || 0;
}

const STAT_GROUPS: { label: string; keys: string[] }[] = [
  {
    label: "General",
    keys: ["Ball Possession", "expected_goals", "Shots on Goal"],
  },
  {
    label: "Offense",
    keys: ["Total Shots", "Shots on Goal", "Blocked Shots", "Shots insidebox", "Shots outsidebox", "Corner Kicks", "Offsides"],
  },
  {
    label: "Distribution",
    keys: ["Total passes", "Passes accurate", "Passes %"],
  },
  {
    label: "Discipline",
    keys: ["Fouls", "Yellow Cards", "Red Cards", "Goalkeeper Saves"],
  },
];

function StatRow({ stat }: { stat: MatchStat }) {
  const label = STAT_LABEL[stat.type] ?? stat.type;
  const hv = stat.home ?? "0";
  const av = stat.away ?? "0";
  const hn = parseNum(stat.home);
  const an = parseNum(stat.away);
  const hWins = hn > an;
  const aWins = an > hn;

  return (
    <div className="md-stat">
      {hWins
        ? <span className="md-stat-pill">{hv}</span>
        : <span className="md-stat-plain">{hv}</span>}
      <span className="md-stat-label">{label}</span>
      {aWins
        ? <span className="md-stat-pill md-stat-pill--r">{av}</span>
        : <span className="md-stat-plain md-stat-plain--r">{av}</span>}
    </div>
  );
}

function StatsTab({ fixture }: { fixture: FixtureDetails }) {
  const { stats, homeTeam, awayTeam } = fixture;
  if (stats.length === 0) {
    return <div className="md-empty">Statistics available during and after the match.</div>;
  }

  const rendered = new Set<string>();

  return (
    <div className="md-stats">
      {/* Team header */}
      <div className="md-stats-hdr">
        <div className="md-stats-hdr-team">
          {homeTeam.crest && <img src={homeTeam.crest} alt="" className="md-stats-hdr-crest" />}
          <span className="md-stats-hdr-name">{homeTeam.shortName}</span>
        </div>
        <div className="md-stats-hdr-vs">vs</div>
        <div className="md-stats-hdr-team md-stats-hdr-team--r">
          <span className="md-stats-hdr-name">{awayTeam.shortName}</span>
          {awayTeam.crest && <img src={awayTeam.crest} alt="" className="md-stats-hdr-crest" />}
        </div>
      </div>

      {STAT_GROUPS.map((group) => {
        const rows = group.keys
          .map((k) => stats.find((s) => s.type === k))
          .filter((s): s is MatchStat => {
            if (!s) return false;
            if (rendered.has(s.type)) return false;
            rendered.add(s.type);
            return true;
          });
        if (rows.length === 0) return null;
        return (
          <div key={group.label} className="md-sg">
            <div className="md-sg-title">{group.label}</div>
            <div className="md-sg-card">
              {rows.map((s) => <StatRow key={s.type} stat={s} />)}
            </div>
          </div>
        );
      })}

      {/* Remaining stats not in any group */}
      {(() => {
        const rest = stats.filter((s) => !rendered.has(s.type));
        if (rest.length === 0) return null;
        return (
          <div className="md-sg">
            <div className="md-sg-title">Other</div>
            <div className="md-sg-card">
              {rest.map((s) => <StatRow key={s.type} stat={s} />)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Match header ─────────────────────────────────────────────────────────────

function MatchHeader({ fixture }: { fixture: FixtureDetails }) {
  const { status, minute, score, events, homeTeam, awayTeam, venue, playerRatings } = fixture;
  const live = isLive(status);
  const finished = isFinished(status);
  const hasScore = live || finished;
  const homeWon = score.winner === "HOME_TEAM";
  const awayWon = score.winner === "AWAY_TEAM";

  const homeScorers = hasScore ? goalScorers(events, "home") : [];
  const awayScorers = hasScore ? goalScorers(events, "away") : [];
  const [motmImgFailed, setMotmImgFailed] = useState(false);
  const star = (finished || live) ? motm(playerRatings) : null;

  return (
    <div className="md-hdr">
      {/* Status bar */}
      <div className="md-hdr-status">
        {live && (
          <span className="md-hdr-live">
            <span className="md-live-dot" />
            {minute != null ? `${minute}'` : "LIVE"}
          </span>
        )}
        {finished && <span className="md-hdr-ft">Full Time</span>}
        {!live && !finished && (
          <span className="md-hdr-ko">
            {new Date(fixture.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="md-hdr-row">
        {/* Home */}
        <div className={`md-hdr-team${homeWon ? " md-hdr-team--w" : ""}`}>
          {homeTeam.crest ? (
            <img src={homeTeam.crest} alt={homeTeam.name} className="md-hdr-crest" />
          ) : (
            <div className="md-hdr-crest-ph">{homeTeam.shortName?.slice(0, 3)}</div>
          )}
          <span className="md-hdr-tname">{homeTeam.name}</span>
        </div>

        {/* Score */}
        {hasScore ? (
          <div className="md-hdr-score">
            <span className={homeWon ? "md-sc md-sc--w" : "md-sc"}>{score.home ?? 0}</span>
            <span className="md-sc-sep">–</span>
            <span className={awayWon ? "md-sc md-sc--w" : "md-sc"}>{score.away ?? 0}</span>
          </div>
        ) : (
          <div className="md-hdr-vs">VS</div>
        )}

        {/* Away */}
        <div className={`md-hdr-team md-hdr-team--right${awayWon ? " md-hdr-team--w" : ""}`}>
          {awayTeam.crest ? (
            <img src={awayTeam.crest} alt={awayTeam.name} className="md-hdr-crest" />
          ) : (
            <div className="md-hdr-crest-ph">{awayTeam.shortName?.slice(0, 3)}</div>
          )}
          <span className="md-hdr-tname">{awayTeam.name}</span>
        </div>
      </div>

      {/* Goal scorers */}
      {(homeScorers.length > 0 || awayScorers.length > 0) && (
        <div className="md-hdr-scorers">
          <span className="md-hdr-scorer-home">{homeScorers.join(", ")}</span>
          <span className="md-hdr-scorer-away">{awayScorers.join(", ")}</span>
        </div>
      )}

      {/* Man of the Match */}
      {star && (
        <div className="md-motm">
          <div className="md-motm-avatar">
            {star.photo && !motmImgFailed ? (
              <img src={star.photo} alt={star.name} className="md-motm-photo" onError={() => setMotmImgFailed(true)} />
            ) : (
              <span className="md-motm-initials">{star.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
            )}
            <span className="md-motm-rating" style={{ background: ratingColor(parseFloat(star.rating ?? "0")) }}>
              {star.rating}
            </span>
          </div>
          <div className="md-motm-info">
            <span className="md-motm-label">{live ? "Best Player So Far" : "Man of the Match"}</span>
            <span className="md-motm-name">{star.name}</span>
            <span className="md-motm-team">{star.team === "home" ? homeTeam.name : awayTeam.name}</span>
          </div>
        </div>
      )}

      {/* Venue */}
      {venue && (
        <div className="md-hdr-venue">{venue.name}, {venue.city}</div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "lineup" | "stats";

export function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data, loading, error } = useQuery<{ worldCupFixture: FixtureDetails }>(
    WORLD_CUP_FIXTURE_DETAILS,
    { variables: { id }, fetchPolicy: "cache-and-network", pollInterval: 30_000, skip: !id },
  );

  const fixture = data?.worldCupFixture;
  const matchIsLive = fixture ? isLive(fixture.status) : false;

  return (
    <div className="md-page">
      {/* Top bar */}
      <div className="md-topbar">
        <button type="button" className="md-back" onClick={() => navigate("/world-cup?tab=results")} aria-label="Back">
          ←
        </button>
        <span className="md-topbar-title">Match Details</span>
        {matchIsLive && fixture?.campaignPostId && (
          <button type="button" className="md-vote-btn" onClick={() => navigate(`/post/${fixture.campaignPostId}`)}>
            Vote
          </button>
        )}
      </div>

      {loading && !fixture && <div className="md-loading">Loading…</div>}
      {error && <div className="md-error">Failed to load match details.</div>}

      {fixture && (
        <>
          <MatchHeader fixture={fixture} />

          <div className="md-tabs">
            {(["overview", "lineup", "stats"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`md-tab${activeTab === tab ? " md-tab--active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "overview" ? "Overview" : tab === "lineup" ? "Line-up" : "Stats"}
              </button>
            ))}
          </div>

          <div className="md-content">
            {activeTab === "overview" && <OverviewTab fixture={fixture} />}
            {activeTab === "lineup" && <LineupTab fixture={fixture} />}
            {activeTab === "stats" && <StatsTab fixture={fixture} />}
          </div>
        </>
      )}
    </div>
  );
}
