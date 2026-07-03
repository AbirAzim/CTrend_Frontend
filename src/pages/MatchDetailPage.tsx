import { useQuery } from "@apollo/client";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useCallback, useState } from "react";
import { WORLD_CUP_FIXTURE_DETAILS } from "../graphql/worldcup";
import {
  buildPlayerEventMap,
  buildPlayerRatingMap,
  compareEventsByMinute,
  effectiveEventMinute,
  isScoredGoal as isScoredGoalEvent,
  lineupPlayerKey,
  normalizePlayerName,
  playerHasLineupStats,
  type PlayerLineupEvents,
} from "../../packages/shared/src/lib/matchEvents";
import {
  formatKnockoutLivePrefix,
  hasKnockoutScoreBreakdown,
  knockoutFullTimeDividerLabel,
  knockoutHeaderSublines,
  knockoutMainDisplayScore,
  matchTopPlayerLabel,
} from "@ctrend/shared/lib/matchScoreCopy";
import {
  extractPenaltyShootoutKickEvents,
  extractPenaltyShootoutKicks,
  penaltyShootoutRounds,
  penaltyShootoutTeamSummaries,
  penaltyShootoutWinnerSide,
  shouldShowPenaltyShootoutSection,
} from "@ctrend/shared/lib/penaltyShootout";
import { isKnockoutStage } from "@ctrend/shared/lib/knockoutFixture";

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
  coach: LineupCoach | null;
};

type MatchStat = { type: string; home?: string | null; away?: string | null };

type PlayerRating = {
  playerId: number;
  name: string;
  team: "home" | "away";
  rating?: string | null;
  photo?: string | null;
};

type PlayerMatchStat = {
  playerId: number;
  name: string;
  team: "home" | "away";
  photo?: string | null;
  number?: number | null;
  position?: string | null;
  minutes?: number | null;
  rating?: string | null;
  captain?: boolean | null;
  substitute?: boolean | null;
  goals?: number | null;
  assists?: number | null;
  shotsTotal?: number | null;
  shotsOn?: number | null;
  keyPasses?: number | null;
  passesTotal?: number | null;
  passAccuracy?: number | null;
  dribblesAttempts?: number | null;
  dribblesSuccess?: number | null;
  foulsDrawn?: number | null;
  foulsCommitted?: number | null;
  tacklesTotal?: number | null;
  interceptions?: number | null;
  duelsTotal?: number | null;
  duelsWon?: number | null;
  offsides?: number | null;
  yellow?: number | null;
  red?: number | null;
  penaltyScored?: number | null;
  penaltyMissed?: number | null;
  saves?: number | null;
};

type FixtureDetails = {
  id: string;
  homeTeam: { name: string; shortName: string; crest: string };
  awayTeam: { name: string; shortName: string; crest: string };
  kickoff: string;
  status: string;
  rawStatus?: string | null;
  minute?: number | null;
  stage: string;
  group?: string | null;
  score: { home?: number | null; away?: number | null; winner?: string | null };
  fullTime?: { home?: number | null; away?: number | null } | null;
  extraTime?: { home?: number | null; away?: number | null } | null;
  penalty?: { home?: number | null; away?: number | null } | null;
  wentToExtraTime?: boolean | null;
  wentToPenalties?: boolean | null;
  venue?: { name: string; city: string } | null;
  campaignPostId?: string | null;
  matchEndedAt?: string | null;
  events: MatchEvent[];
  lineups: MatchLineup[];
  stats: MatchStat[];
  playerRatings: PlayerRating[];
  playerMatchStats?: PlayerMatchStat[];
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

/** A real scored goal — excludes disallowed goals, missed penalties, and
 * penalty-shootout goals (API-Football marks all of these as type "Goal"). */
function isScoredGoal(e: { type: string; detail?: string | null }): boolean {
  return isScoredGoalEvent(e);
}

// Goal scorers per team
function goalScorers(events: MatchEvent[], team: "home" | "away", wentToPenalties?: boolean | null) {
  const shootoutEvents = extractPenaltyShootoutKickEvents(events, { wentToPenalties });
  return events
    .filter((e) => isScoredGoal(e) && !shootoutEvents.includes(e) && e.team === team)
    .sort(compareEventsByMinute)
    .map((e) => {
      const min = minuteLabel(e);
      const name = shortName(e.player.name);
      return e.detail.includes("Own Goal") ? `${name} ${min} (OG)` : `${name} ${min}`;
    });
}

function ratingColor(r: number): string {
  if (r >= 7) return "#22c55e"; // green
  if (r >= 5) return "#f59e0b"; // yellow
  return "#ef4444"; // red
}

// Man of the match: highest rating, but weighted by attacking output so a
// match-winning scorer outranks a slightly-higher-rated player who didn't
// contribute goals (API ratings alone can crown the wrong side).
function motm(
  ratings: PlayerRating[],
  evMap: Map<string, PEvt>,
): PlayerRating | null {
  if (!ratings.length) return null;
  const impact = (r: PlayerRating): number => {
    const base = parseFloat(r.rating ?? "0");
    const ev =
      (r.playerId != null && evMap.get(`id:${r.playerId}`)) ||
      (r.name && evMap.get(`nm:${normalizePlayerName(r.name)}`)) ||
      null;
    if (!ev) return base;
    return base + ev.goals * 0.35 + ev.assists * 0.15 - ev.ownGoals * 0.5;
  };
  return ratings.reduce((best, cur) => (impact(cur) > impact(best) ? cur : best));
}

function deriveHalfScore(events: MatchEvent[]) {
  let home = 0, away = 0;
  for (const e of events) {
    if (!isScoredGoal(e) || e.time > 45) continue;
    if (e.detail.includes("Own Goal")) { if (e.team === "home") away++; else home++; }
    else { if (e.team === "home") home++; else away++; }
  }
  return { home, away };
}

// ─── Player event map (goals / cards / subs per player) ──────────────────────

type PEvt = PlayerLineupEvents;

function pEvtKey(p: LineupPlayer): string {
  return lineupPlayerKey(p);
}

// ─── Goal bar ─────────────────────────────────────────────────────────────────

function GoalBar({ events, homeTeam, awayTeam }: {
  events: MatchEvent[];
  homeTeam: { shortName: string };
  awayTeam: { shortName: string };
}) {
  const goals = events
    .filter(isScoredGoal)
    .sort(compareEventsByMinute);
  if (!goals.length) return null;

  const maxTime = Math.max(90, ...goals.map(effectiveEventMinute));
  const homeGoals = goals.filter(g => g.team === "home");
  const awayGoals = goals.filter(g => g.team === "away");

  const scorerLabel = (g: MatchEvent) => {
    const suffix = g.detail.includes("Own Goal") ? " (OG)" : g.detail.includes("Penalty") ? " (P)" : "";
    return `⚽ ${shortName(g.player.name)} ${minuteLabel(g)}${suffix}`;
  };

  return (
    <div className="md-goal-bar">
      {homeGoals.length > 0 && (
        <div className="md-gbar-scorers md-gbar-scorers--home">
          {homeGoals.map((g, i) => <span key={i} className="md-gbar-scorer">{scorerLabel(g)}</span>)}
        </div>
      )}
      <div className="md-gbar-track-wrap">
        <span className="md-gbar-team">{homeTeam.shortName}</span>
        <div className="md-gbar-track">
          {goals.map((g, i) => (
            <span
              key={i}
              className={`md-gbar-tick md-gbar-tick--${g.team}`}
              style={{ left: `${(effectiveEventMinute(g) / maxTime) * 100}%` }}
              title={`${g.player.name} ${minuteLabel(g)}`}
            />
          ))}
        </div>
        <span className="md-gbar-team md-gbar-team--r">{awayTeam.shortName}</span>
      </div>
      {awayGoals.length > 0 && (
        <div className="md-gbar-scorers md-gbar-scorers--away">
          {awayGoals.map((g, i) => <span key={i} className="md-gbar-scorer md-gbar-scorer--r">{scorerLabel(g)}</span>)}
        </div>
      )}
    </div>
  );
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

function PenaltyShootoutSection({ fixture }: { fixture: FixtureDetails }) {
  const kicks = extractPenaltyShootoutKicks(fixture.events, {
    wentToPenalties: fixture.wentToPenalties,
  });
  const rounds = penaltyShootoutRounds(kicks);
  const pen = fixture.penalty;
  if (
    !shouldShowPenaltyShootoutSection({
      wentToPenalties: fixture.wentToPenalties,
      penalty: pen,
      kickCount: kicks.length,
    })
  ) {
    return null;
  }
  // Only declare a winner once the match is actually FINISHED — a running
  // shootout tally can be unequal mid-sequence (e.g. 1-0 after two kicks)
  // without being decided yet, so "home != away" alone isn't a safe signal
  // while the match is still live.
  const winnerSide = isFinished(fixture.status)
    ? penaltyShootoutWinnerSide(pen ?? {}) ??
      (fixture.score.winner as "home" | "away" | null)
    : null;
  const winnerName =
    winnerSide === "home"
      ? fixture.homeTeam.name
      : winnerSide === "away"
        ? fixture.awayTeam.name
        : null;
  const { home: homeSummary, away: awaySummary } = penaltyShootoutTeamSummaries(kicks);
  const homeLabel = fixture.homeTeam.shortName || fixture.homeTeam.name;
  const awayLabel = fixture.awayTeam.shortName || fixture.awayTeam.name;

  return (
    <div className="md-pens">
      <div className="md-pens-head">
        <div className="md-pens-title">Penalty shootout</div>
        {pen && pen.home != null && pen.away != null ? (
          winnerName ? (
            <div className="md-pens-result">
              {winnerName} wins · {pen.home}–{pen.away}
            </div>
          ) : (
            <div className="md-pens-result">{pen.home}–{pen.away}</div>
          )
        ) : null}
      </div>

      {rounds.length > 0 ? (
        <>
          <div className="md-pens-teams">
            <span>{homeLabel}</span>
            <span>{awayLabel}</span>
          </div>
          <div className="md-pens-grid">
            {rounds.map((round, i) => (
              <div key={i} className="md-pens-round">
                <PenaltyKickCell kick={round.home} align="left" />
                <span className="md-pens-round-mid" aria-hidden>
                  {round.home?.scored ? "✓" : round.home ? "✕" : "·"}
                  {" "}
                  {round.away?.scored ? "✓" : round.away ? "✕" : "·"}
                </span>
                <PenaltyKickCell kick={round.away} align="right" />
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="md-pens-summaries">
        <PenaltyTeamSummaryCard
          teamName={homeLabel}
          summary={homeSummary}
          align="left"
        />
        <PenaltyTeamSummaryCard
          teamName={awayLabel}
          summary={awaySummary}
          align="right"
        />
      </div>

      {kicks.length === 0 ? (
        <p className="md-pens-sync">Kick-by-kick details are syncing…</p>
      ) : null}
    </div>
  );
}

function PenaltyTeamSummaryCard({
  teamName,
  summary,
  align,
}: {
  teamName: string;
  summary: { scored: string[]; missed: string[] };
  align: "left" | "right";
}) {
  if (summary.scored.length === 0 && summary.missed.length === 0) return null;
  return (
    <div className={`md-pens-summary md-pens-summary--${align}`}>
      <div className="md-pens-summary-team">{teamName}</div>
      {summary.scored.length > 0 ? (
        <div className="md-pens-summary-block">
          <span className="md-pens-summary-label md-pens-summary-label--goal">Scored</span>
          {summary.scored.map((name) => (
            <span key={`s-${name}`} className="md-pens-summary-player md-pens-outcome--goal">
              ✓ {name}
            </span>
          ))}
        </div>
      ) : null}
      {summary.missed.length > 0 ? (
        <div className="md-pens-summary-block">
          <span className="md-pens-summary-label md-pens-summary-label--miss">Missed</span>
          {summary.missed.map((name) => (
            <span key={`m-${name}`} className="md-pens-summary-player md-pens-outcome--miss">
              ✕ {name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PenaltyKickCell({
  kick,
  align,
}: {
  kick?: { playerName: string; scored: boolean; runHome: number; runAway: number };
  align: "left" | "right";
}) {
  if (!kick) return <div className={`md-pens-cell md-pens-cell--${align} md-pens-cell--empty`} />;
  return (
    <div className={`md-pens-cell md-pens-cell--${align}`}>
      <span className="md-pens-player">{kick.playerName}</span>
      <span className={`md-pens-outcome${kick.scored ? " md-pens-outcome--goal" : " md-pens-outcome--miss"}`}>
        {kick.scored ? "Goal" : "Miss"} ({kick.runHome}–{kick.runAway})
      </span>
    </div>
  );
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

  // Shootout kicks already have their own dedicated summary above — strip
  // them out of the general timeline instead of listing them twice. Uses the
  // full extractor (not just the strict "shootout" text match) since API
  // feeds often omit that word and only the trailing-kicks heuristic catches
  // them — the same detection PenaltyShootoutSection uses to build its board.
  const shootoutEvents = extractPenaltyShootoutKickEvents(events, {
    wentToPenalties: fixture.wentToPenalties,
  });
  const sorted = [...events]
    .filter((e) => !shootoutEvents.includes(e))
    .sort((a, b) => compareEventsByMinute(b, a));

  const halfScore = finished ? deriveHalfScore(events) : null;

  type Row =
    | { kind: "event"; event: MatchEvent }
    | { kind: "divider"; label: string };

  const rows: Row[] = [];
  if (finished || (score.home != null && score.away != null)) {
    const label =
      isKnockoutStage(fixture.stage) && hasKnockoutScoreBreakdown(fixture)
        ? knockoutFullTimeDividerLabel(fixture)
        : finished
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
      {shouldShowPenaltyShootoutSection({
        wentToPenalties: fixture.wentToPenalties,
        penalty: fixture.penalty,
        kickCount: extractPenaltyShootoutKicks(fixture.events, {
          wentToPenalties: fixture.wentToPenalties,
        }).length,
      }) ? (
        <PenaltyShootoutSection fixture={fixture} />
      ) : null}
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

/** Per-row vertical space on the pitch — must fit avatar, badges, event icons, and name. */
const PITCH_ROW_H = 110;
/** Extra clearance so home/away GK names stay inside the field markings. */
const PITCH_HALF_EDGE = 44;

function distinctFormationRows(players: LineupPlayer[]): number {
  const rows = new Set(
    players.filter((p) => p.grid).map((p) => parseInt(p.grid!.split(":")[0], 10)),
  );
  return rows.size || 1;
}

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
  evMap,
  onClick,
}: {
  player: LineupPlayer;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
  evMap: Map<string, PEvt>;
  onClick?: () => void;
}) {
  const photo = playerPhoto(player, photoMap);
  const [imgFailed, setImgFailed] = useState(false);
  const rating = player.id != null ? ratingMap.get(player.id) : undefined;
  const pev = evMap.get(pEvtKey(player));

  return (
    <div
      className={`md-pa${onClick ? " md-pa--tappable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="md-pa-av-wrap">
        {/* Sub icon sits above the circle, centered */}
        {(pev?.subOff || pev?.subOn) && (
          <span className="md-pa-sub-ico">
            <span className="md-sub-arr-up">▲</span>
            <span className="md-sub-arr-dn">▼</span>
          </span>
        )}
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
        {/* Card outside overflow:hidden circle */}
        {pev?.card && <span className={`md-pa-card md-pa-card--${pev.card}`} />}
      </div>
      {rating && (
        <span className="md-pa-rating" style={{ background: ratingColor(parseFloat(rating)) }}>
          {rating}
        </span>
      )}
      {pev && (pev.goals > 0 || pev.ownGoals > 0 || pev.assists > 0) && (
        <span className="md-pa-events">
          {pev.goals > 0 && <span className="md-pa-ev-goal">{"⚽".repeat(Math.min(pev.goals, 3))}{pev.goals > 3 ? `×${pev.goals}` : ""}</span>}
          {pev.ownGoals > 0 && <span className="md-pa-ev-og">{"⚽".repeat(Math.min(pev.ownGoals, 2))}OG</span>}
          {pev.assists > 0 && <span className="md-pa-ev-assist">{"👟".repeat(Math.min(pev.assists, 2))}{pev.assists > 2 ? `×${pev.assists}` : ""}</span>}
        </span>
      )}
      <span className="md-pa-label" title={player.name}>{shortName(player.name)}</span>
    </div>
  );
}

function FormationRows({
  players,
  reverse,
  mirrorCols,
  photoMap,
  ratingMap,
  evMap,
  onPlayerClick,
}: {
  players: LineupPlayer[];
  reverse: boolean;
  mirrorCols: boolean;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
  evMap: Map<string, PEvt>;
  onPlayerClick?: (id: number) => void;
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
  const gkRowNum = rows.length ? Math.min(...rows.map(([r]) => r)) : 0;

  return (
    <div className="md-frows">
      {rows.map(([row, rps]) => {
        const sorted = [...rps].sort((a, b) => {
          const ac = parseInt((a.grid ?? "0:1").split(":")[1], 10);
          const bc = parseInt((b.grid ?? "0:1").split(":")[1], 10);
          return mirrorCols ? bc - ac : ac - bc;
        });
        return (
          <div
            key={row}
            className={`md-frow${row === gkRowNum ? " md-frow--gk" : ""}`}
          >
            {sorted.map((p) => (
              <PitchAvatar
                key={p.id ?? p.name}
                player={p}
                photoMap={photoMap}
                ratingMap={ratingMap}
                evMap={evMap}
                onClick={p.id != null && onPlayerClick ? () => onPlayerClick(p.id as number) : undefined}
              />
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
  evMap,
  playerMatchStats,
  onPlayerClick,
}: {
  player: LineupPlayer;
  photoMap: Map<number, string>;
  ratingMap: Map<number, string>;
  evMap: Map<string, PEvt>;
  playerMatchStats?: PlayerMatchStat[];
  onPlayerClick?: (id: number) => void;
}) {
  const photo = playerPhoto(player, photoMap);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = photo && !imgFailed;
  const rating = player.id != null ? ratingMap.get(player.id) : undefined;
  const pev = evMap.get(pEvtKey(player));
  const tappable =
    player.id != null &&
    Boolean(onPlayerClick) &&
    playerHasLineupStats(player.id, playerMatchStats);

  return (
    <div
      className={`md-bc${tappable ? " md-bc--tappable" : ""}`}
      onClick={tappable ? () => onPlayerClick!(player.id!) : undefined}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPlayerClick!(player.id!);
              }
            }
          : undefined
      }
      role={tappable ? "button" : undefined}
      tabIndex={tappable ? 0 : undefined}
    >
      <div className="md-bc-av-wrap">
        <div className="md-bc-avatar">
          {showPhoto ? (
            <img src={photo} alt={player.name} className="md-bc-img" onError={() => setImgFailed(true)} />
          ) : (
            <span className="md-bc-num">{player.number}</span>
          )}
        </div>
        {pev?.subOn && (
          <span className="md-bc-sub-on">
            <span className="md-sub-arr-up">▲</span>
            <span className="md-sub-arr-dn">▼</span>
          </span>
        )}
        {pev?.card && <span className={`md-bc-card-ico md-bc-card-ico--${pev.card}`} />}
      </div>
      <div className="md-bc-info">
        <span className="md-bc-name">{player.name}</span>
        <div className="md-bc-meta">
          <span className="md-bc-pos">{player.pos ?? ""}</span>
          {rating && (
            <span className="md-bc-rating" style={{ background: ratingColor(parseFloat(rating)) }}>
              {rating}
            </span>
          )}
          {pev && pev.goals > 0 && <span className="md-bc-goal-ico">{"⚽".repeat(Math.min(pev.goals, 2))}</span>}
          {pev && pev.ownGoals > 0 && <span className="md-bc-og-ico">{"⚽".repeat(Math.min(pev.ownGoals, 2))}OG</span>}
          {pev && pev.assists > 0 && <span className="md-bc-assist-ico">{"👟".repeat(Math.min(pev.assists, 2))}</span>}
        </div>
      </div>
    </div>
  );
}

function PlayerMatchCard({
  stat,
  fixture,
  onClose,
}: {
  stat: PlayerMatchStat | null;
  fixture: FixtureDetails;
  onClose: () => void;
}) {
  if (!stat) return null;
  const rNum = stat.rating ? parseFloat(stat.rating) : null;
  const teamName = stat.team === "home" ? fixture.homeTeam.shortName : fixture.awayTeam.shortName;
  const photo = stat.photo ?? `https://media.api-sports.io/football/players/${stat.playerId}.png`;

  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, v: number | null | undefined, fmt?: (n: number) => string) => {
    if (v == null) return;
    rows.push({ label, value: fmt ? fmt(v) : String(v) });
  };
  push("Total shots", stat.shotsTotal);
  push("Shots on target", stat.shotsOn);
  push("Chances created", stat.keyPasses);
  if (stat.dribblesAttempts != null || stat.dribblesSuccess != null)
    rows.push({ label: "Dribbles (won/att)", value: `${stat.dribblesSuccess ?? 0}/${stat.dribblesAttempts ?? 0}` });
  push("Pass accuracy", stat.passAccuracy, (n) => `${n}%`);
  push("Tackles", stat.tacklesTotal);
  push("Interceptions", stat.interceptions);
  if (stat.duelsTotal != null || stat.duelsWon != null)
    rows.push({ label: "Duels (won/total)", value: `${stat.duelsWon ?? 0}/${stat.duelsTotal ?? 0}` });
  push("Fouls won", stat.foulsDrawn);
  push("Fouls committed", stat.foulsCommitted);
  push("Offsides", stat.offsides);
  push("Saves", stat.saves);
  if (stat.penaltyScored) push("Penalties scored", stat.penaltyScored);
  if (stat.penaltyMissed) push("Penalties missed", stat.penaltyMissed);
  if (stat.yellow) push("Yellow cards", stat.yellow);
  if (stat.red) push("Red cards", stat.red);

  return (
    <div className="md-pmc-backdrop" onClick={onClose} role="presentation">
      <div className="md-pmc" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="md-pmc-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="md-pmc-header">
          <img
            className="md-pmc-avatar"
            src={photo}
            alt={stat.name}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
          <div className="md-pmc-head-info">
            <div className="md-pmc-name">{stat.name}{stat.captain ? "  (C)" : ""}</div>
            <div className="md-pmc-meta">
              {[stat.position, stat.number != null ? `#${stat.number}` : null, teamName].filter(Boolean).join("  ·  ")}
            </div>
            <div className="md-pmc-context">
              {fixture.homeTeam.shortName} {fixture.score.home ?? 0}–{fixture.score.away ?? 0} {fixture.awayTeam.shortName}
            </div>
          </div>
          {rNum != null && (
            <span className="md-pmc-rating" style={{ background: ratingColor(rNum) }}>{rNum.toFixed(1)}</span>
          )}
        </div>
        <div className="md-pmc-tiles">
          <div className="md-pmc-tile"><div className="md-pmc-tile-val">{stat.minutes != null ? `${stat.minutes}'` : "—"}</div><div className="md-pmc-tile-lbl">Minutes</div></div>
          <div className="md-pmc-tile"><div className="md-pmc-tile-val">{stat.goals ?? 0}</div><div className="md-pmc-tile-lbl">Goals</div></div>
          <div className="md-pmc-tile"><div className="md-pmc-tile-val">{stat.assists ?? 0}</div><div className="md-pmc-tile-lbl">Assists</div></div>
        </div>
        {rows.length > 0 ? (
          <>
            <div className="md-pmc-section">Key stats</div>
            <div className="md-pmc-stats">
              {rows.map((r) => (
                <div key={r.label} className="md-pmc-stat-row">
                  <span className="md-pmc-stat-label">{r.label}</span>
                  <span className="md-pmc-stat-value">{r.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="md-pmc-empty">Detailed stats aren't available for this player.</div>
        )}
      </div>
    </div>
  );
}

function LineupTab({ fixture, onPlayerClick }: { fixture: FixtureDetails; onPlayerClick?: (id: number) => void }) {
  const { lineups, events } = fixture;
  if (lineups.length === 0) {
    return <div className="md-empty">Lineups will appear closer to kickoff.</div>;
  }

  const homeL = lineups.find((l) => l.team === "home");
  const awayL = lineups.find((l) => l.team === "away");
  const photoMap = buildPhotoMap(lineups);
  const ratingMap = buildPlayerRatingMap(
    fixture.playerRatings,
    fixture.playerMatchStats,
  );
  const evMap = buildPlayerEventMap(events, fixture.playerMatchStats);
  const sortSubs = (subs: LineupPlayer[]) =>
    [...subs].sort((a, b) => (evMap.get(pEvtKey(b))?.subOn ? 1 : 0) - (evMap.get(pEvtKey(a))?.subOn ? 1 : 0));
  const homeSubs = sortSubs(homeL?.substitutes ?? []);
  const awaySubs = sortSubs(awayL?.substitutes ?? []);
  const halfHeight =
    Math.max(
      distinctFormationRows(homeL?.startXI ?? []),
      distinctFormationRows(awayL?.startXI ?? []),
    ) * PITCH_ROW_H + PITCH_HALF_EDGE;

  return (
    <div className="md-lineup">
      {/* ── Goal bar ── */}
      <GoalBar events={events} homeTeam={fixture.homeTeam} awayTeam={fixture.awayTeam} />

      {/* ── Pitch (phone-width stage — avoids empty green margins on desktop) ── */}
      <div className="md-pitch-stage">
      <div className="md-pitch-header">
        {homeL && (
          <div className="md-pitch-team-badge">
            {fixture.homeTeam.crest && <img src={fixture.homeTeam.crest} alt={fixture.homeTeam.name} className="md-pitch-team-crest" />}
            <span>{fixture.homeTeam.shortName}</span>
            <span className="md-pitch-formation">{homeL.formation}</span>
          </div>
        )}
        {awayL && (
          <div className="md-pitch-team-badge">
            {fixture.awayTeam.crest && <img src={fixture.awayTeam.crest} alt={fixture.awayTeam.name} className="md-pitch-team-crest" />}
            <span>{fixture.awayTeam.shortName}</span>
            <span className="md-pitch-formation">{awayL.formation}</span>
          </div>
        )}
      </div>

      <div className="md-pitch" style={{ height: halfHeight * 2 }}>
        <svg className="md-pitch-svg" viewBox="0 0 100 160" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="160" fill="#2d7a3a" />
          <rect x="4" y="6" width="92" height="148" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.35" />
          <rect x="23" y="6" width="54" height="23" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
          <rect x="23" y="131" width="54" height="23" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
          <circle cx="50" cy="21.5" r="0.7" fill="rgba(255,255,255,0.5)" />
          <circle cx="50" cy="138.5" r="0.7" fill="rgba(255,255,255,0.5)" />
          <path d="M 39.75 29 A 13 13 0 0 0 60.25 29" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
          <path d="M 39.75 131 A 13 13 0 0 1 60.25 131" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
          <line x1="4" y1="80" x2="96" y2="80" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
          <path d="M 4 8.5 A 2.5 2.5 0 0 0 6.5 6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
          <path d="M 93.5 6 A 2.5 2.5 0 0 0 96 8.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
          <path d="M 96 151.5 A 2.5 2.5 0 0 0 93.5 154" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
          <path d="M 6.5 154 A 2.5 2.5 0 0 0 4 151.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.25" />
        </svg>

        {homeL && (
          <div className="md-pitch-half md-pitch-half--home" style={{ height: halfHeight, flex: "none" }}>
            <FormationRows players={homeL.startXI} reverse={false} mirrorCols={true} photoMap={photoMap} ratingMap={ratingMap} evMap={evMap} onPlayerClick={onPlayerClick} />
          </div>
        )}
        {awayL && (
          <div className="md-pitch-half md-pitch-half--away" style={{ height: halfHeight, flex: "none" }}>
            <FormationRows players={awayL.startXI} reverse={true} mirrorCols={false} photoMap={photoMap} ratingMap={ratingMap} evMap={evMap} onPlayerClick={onPlayerClick} />
          </div>
        )}
      </div>
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
          {Array.from({ length: Math.max(homeSubs.length, awaySubs.length) }).map((_, i) => {
            const hp = homeSubs[i];
            const ap = awaySubs[i];
            return (
              <div key={i} className="md-bench-pair">
                {hp ? (
                  <BenchCell
                    player={hp}
                    photoMap={photoMap}
                    ratingMap={ratingMap}
                    evMap={evMap}
                    playerMatchStats={fixture.playerMatchStats}
                    onPlayerClick={onPlayerClick}
                  />
                ) : (
                  <div className="md-bc md-bc--empty" />
                )}
                <div className="md-bench-pair-div" />
                {ap ? (
                  <BenchCell
                    player={ap}
                    photoMap={photoMap}
                    ratingMap={ratingMap}
                    evMap={evMap}
                    playerMatchStats={fixture.playerMatchStats}
                    onPlayerClick={onPlayerClick}
                  />
                ) : (
                  <div className="md-bc md-bc--empty" />
                )}
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

function clientMinute(kickoff: string): number {
  const elapsed = Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000);
  return Math.max(1, Math.min(elapsed, 130));
}

/**
 * Status-bar text for a live match: "HT", "ET 97'"/"ET", "Pens", or a bare
 * minute — `status` alone can't tell extra time / penalties apart from
 * regular time (both come back as IN_PLAY), so this also needs `rawStatus`
 * (the provider's original code), same as the feed card's live pill.
 *
 * The `clientMinute` wall-clock estimate only ever stands in for a genuine
 * 1H/2H elapsed value that hasn't synced yet — it must NOT be used during
 * HT/BT/ET/penalties, where the in-game clock isn't a simple function of
 * time-since-kickoff (breaks pause it; a stale/stuck sync can leave a fixture
 * sitting in one of these phases for hours, which previously showed a
 * permanently frozen "130'" instead of just the phase name).
 */
function liveHeaderLabel(
  status: string,
  rawStatus: string | null | undefined,
  minute: number | null | undefined,
  kickoff: string,
): string {
  if (status === "PAUSED") return "HT";
  const phase = formatKnockoutLivePrefix({ phase: rawStatus });
  if (phase === "Pens") return "Pens";
  if (phase === "ET") return minute != null ? `ET ${minute}'` : "ET";
  return minute != null ? `${minute}'` : `${clientMinute(kickoff)}'`;
}


function MatchHeader({ fixture, onPlayerClick }: { fixture: FixtureDetails; onPlayerClick?: (id: number) => void }) {
  const { status, minute, score, events, homeTeam, awayTeam, venue, playerRatings, kickoff } = fixture;
  const live = isLive(status);
  const finished = isFinished(status);
  const hasScore = live || finished;
  const homeWon = score.winner === "home";
  const awayWon = score.winner === "away";
  const scoreBreakdown =
    isKnockoutStage(fixture.stage) && hasKnockoutScoreBreakdown(fixture)
      ? knockoutHeaderSublines(fixture)
      : [];
  const displayScore = knockoutMainDisplayScore(fixture);
  const penDecided = Boolean(fixture.wentToPenalties && fixture.penalty);
  const highlightHomeScore = homeWon && !(penDecided && displayScore.home === displayScore.away);
  const highlightAwayScore = awayWon && !(penDecided && displayScore.home === displayScore.away);

  const homeScorers = hasScore ? goalScorers(events, "home", fixture.wentToPenalties) : [];
  const awayScorers = hasScore ? goalScorers(events, "away", fixture.wentToPenalties) : [];
  const [motmImgFailed, setMotmImgFailed] = useState(false);
  const [scorersExpanded, setScorersExpanded] = useState(false);
  const SCORER_LIMIT = 4;
  const hasMoreScorers = homeScorers.length > SCORER_LIMIT || awayScorers.length > SCORER_LIMIT;
  const shownHome = scorersExpanded ? homeScorers : homeScorers.slice(0, SCORER_LIMIT);
  const shownAway = scorersExpanded ? awayScorers : awayScorers.slice(0, SCORER_LIMIT);
  const star = (finished || live) ? motm(playerRatings, buildPlayerEventMap(events, fixture.playerMatchStats)) : null;

  return (
    <div className="md-hdr">
      {/* Status bar */}
      <div className="md-hdr-status">
        {live && (
          <span className="md-hdr-live">
            <span className="md-live-dot" />
            {liveHeaderLabel(status, fixture.rawStatus, minute, kickoff)}
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
            <div className="md-hdr-score-main">
              <span className={highlightHomeScore ? "md-sc md-sc--w" : "md-sc"}>{displayScore.home}</span>
              <span className="md-sc-sep">–</span>
              <span className={highlightAwayScore ? "md-sc md-sc--w" : "md-sc"}>{displayScore.away}</span>
            </div>
            {scoreBreakdown.length > 0 ? (
              <div className="md-hdr-score-breakdown">
                {scoreBreakdown.join(" · ")}
              </div>
            ) : null}
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
          <span className="md-hdr-scorer-home">{shownHome.join(", ")}</span>
          <span className="md-hdr-scorer-away">{shownAway.join(", ")}</span>
        </div>
      )}
      {hasMoreScorers && (
        <button
          type="button"
          className="md-hdr-scorers-toggle"
          onClick={() => setScorersExpanded((v) => !v)}
        >
          {scorersExpanded ? "Show less ▲" : "Show all goals ▼"}
        </button>
      )}

      {/* Man of the Match */}
      {star && (
        <div
          className={`md-motm${onPlayerClick && star.playerId != null ? " md-motm--tappable" : ""}`}
          onClick={onPlayerClick && star.playerId != null ? () => onPlayerClick(star.playerId) : undefined}
          role={onPlayerClick && star.playerId != null ? "button" : undefined}
          tabIndex={onPlayerClick && star.playerId != null ? 0 : undefined}
        >
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
            <span className="md-motm-label">{matchTopPlayerLabel(live)}</span>
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
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (tabFromUrl === "lineup" || tabFromUrl === "stats") return tabFromUrl;
    return "overview";
  });

  const { data, loading, error, refetch } = useQuery<{ worldCupFixture: FixtureDetails }>(
    WORLD_CUP_FIXTURE_DETAILS,
    { variables: { id }, fetchPolicy: "cache-and-network", pollInterval: 30_000, skip: !id },
  );

  const fixture = data?.worldCupFixture;
  const matchIsLive = fixture ? isLive(fixture.status) : false;
  const [refreshing, setRefreshing] = useState(false);
  // Player match-stat card — opened from the MoTM card or any pitch player.
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const selectedStat =
    selectedPlayerId != null
      ? (fixture?.playerMatchStats ?? []).find((s) => s.playerId === selectedPlayerId) ?? null
      : null;
  const onReload = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refreshing, refetch]);

  return (
    <div className="md-page">
      {/* Top bar */}
      <div className="md-topbar">
        <button type="button" className="md-back" onClick={() => navigate("/world-cup/results")} aria-label="Back">
          ←
        </button>
        <span className="md-topbar-title">Match Details</span>
        <button
          type="button"
          className={`md-reload${refreshing ? " md-reload--spinning" : ""}`}
          onClick={onReload}
          disabled={refreshing}
          aria-label="Reload match details"
          title="Reload"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        {matchIsLive && fixture?.campaignPostId && (
          <button type="button" className="md-vote-btn" onClick={() => navigate(`/post/${fixture.campaignPostId}`)}>
            Vote
          </button>
        )}
      </div>

      {loading && !fixture && <div className="md-loading">Loading…</div>}
      {error && !fixture && (
        <div className="md-error">
          <span>Failed to load match details.</span>
          <button type="button" className="md-retry" onClick={onReload} disabled={refreshing}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Try again
          </button>
        </div>
      )}
      {!loading && !error && !fixture && (
        <div className="md-empty">Match details not available.</div>
      )}

      {fixture && (
        <>
          <MatchHeader fixture={fixture} onPlayerClick={setSelectedPlayerId} />

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
            {activeTab === "lineup" && <LineupTab fixture={fixture} onPlayerClick={setSelectedPlayerId} />}
            {activeTab === "stats" && <StatsTab fixture={fixture} />}
          </div>

          <PlayerMatchCard
            stat={selectedStat}
            fixture={fixture}
            onClose={() => setSelectedPlayerId(null)}
          />
        </>
      )}
    </div>
  );
}
