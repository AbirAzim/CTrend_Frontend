/** Build a mirrored knockout bracket from worldCupFixtures API data. */

export type BracketTeam = {
  name: string | null;
  shortName: string | null;
  crest: string | null;
};

export type BracketScore = {
  home: number | null;
  away: number | null;
  winner: string | null;
};

export type BracketFixture = {
  id: string;
  externalId?: number;
  homeTeam: BracketTeam;
  awayTeam: BracketTeam;
  kickoff: string;
  status: string;
  stage: string;
  matchday?: number | null;
  score: BracketScore | null;
  minute?: number | null;
};

export type BracketSide = "left" | "right" | "center";

export type BracketSlot = {
  fixture: BracketFixture | null;
  stage: string;
  side: BracketSide;
  index: number;
  label: string;
};

export type KnockoutBracket = {
  left: BracketSlot[][];
  right: BracketSlot[][];
  center: BracketSlot[];
};

export const BRACKET_STAGE_ORDER = [
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "FINAL",
  "THIRD_PLACE",
] as const;

export type BracketStage = (typeof BRACKET_STAGE_ORDER)[number];

export const BRACKET_STAGE_META: Record<
  BracketStage,
  { label: string; color: string; teams: number; matches: number }
> = {
  LAST_32: { label: "Round of 32", color: "#10b981", teams: 32, matches: 16 },
  LAST_16: { label: "Round of 16", color: "#3b82f6", teams: 16, matches: 8 },
  QUARTER_FINALS: { label: "Quarter-Final", color: "#8b5cf6", teams: 8, matches: 4 },
  SEMI_FINALS: { label: "Semi-Final", color: "#6366f1", teams: 4, matches: 2 },
  FINAL: { label: "Final", color: "#d97706", teams: 2, matches: 1 },
  THIRD_PLACE: { label: "Third Place", color: "#78716c", teams: 2, matches: 1 },
};

const SIDE_STAGES: BracketStage[] = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS"];
const SIDE_COUNTS: Record<string, number> = {
  LAST_32: 8,
  LAST_16: 4,
  QUARTER_FINALS: 2,
  SEMI_FINALS: 1,
};

/**
 * FIFA World Cup 2026 R32 pairings in official bracket-tree slot order.
 * Left half feeds SF Match 101; right half feeds SF Match 102.
 * Sources: FIFA bracket tree (Wikipedia / CBS Sports knockout bracket).
 */
const R32_LEFT_PAIRS: [string, string][] = [
  ["South Africa", "Canada"], // M73
  ["Netherlands", "Morocco"], // M75
  ["Germany", "Paraguay"], // M74
  ["France", "Sweden"], // M77
  ["USA", "Bosnia & Herzegovina"], // M81
  ["Belgium", "Senegal"], // M82
  ["Portugal", "Croatia"], // M83
  ["Spain", "Austria"], // M84
];

const R32_RIGHT_PAIRS: [string, string][] = [
  ["Brazil", "Japan"], // M76
  ["Ivory Coast", "Norway"], // M78
  ["Mexico", "Ecuador"], // M79
  ["England", "Congo DR"], // M80
  ["Switzerland", "Algeria"], // M85
  ["Colombia", "Ghana"], // M87
  ["Argentina", "Cape Verde Islands"], // M86
  ["Australia", "Egypt"], // M88
];

export const BRACKET_LEAF_COUNT = 8;
export const BRACKET_CARD_H = 88;
export const BRACKET_CARD_GAP = 8;
export const BRACKET_COL_HEAD = 36;
export const BRACKET_COL_W = 124;
export const BRACKET_CONN_W = 14;
export const BRACKET_CENTER_W = 196;
export const BRACKET_CENTER_CARD_H = 108;
export const BRACKET_CENTER_STACK_GAP = 28;
export const BRACKET_CENTER_GAP = 12;
export const BRACKET_BOARD_GAP = 10;
export const BRACKET_BOARD_PAD_X = 16;
export const BRACKET_BOARD_PAD_Y = 36;

export function bracketSideWidth(): number {
  return 4 * BRACKET_COL_W + 3 * BRACKET_CONN_W;
}

export function bracketChampionshipWidth(): number {
  return BRACKET_CONN_W * 2 + BRACKET_CENTER_W;
}

export function bracketBoardWidth(): number {
  return (
    BRACKET_BOARD_PAD_X +
    bracketSideWidth() * 2 +
    bracketChampionshipWidth() +
    BRACKET_BOARD_GAP * 2
  );
}

export function bracketFinalRowTop(): number {
  return bracketFinalTop();
}

export function bracketBoardHeight(): number {
  return BRACKET_COL_HEAD + bracketTreeHeight() + BRACKET_BOARD_PAD_Y;
}

export function bracketTreeHeight(): number {
  return BRACKET_LEAF_COUNT * (BRACKET_CARD_H + BRACKET_CARD_GAP) - BRACKET_CARD_GAP;
}

export function bracketSlotTop(index: number, slotCount: number): number {
  if (slotCount <= 0) return 0;
  if (slotCount === BRACKET_LEAF_COUNT) {
    return index * (BRACKET_CARD_H + BRACKET_CARD_GAP);
  }
  const childA = bracketSlotTop(index * 2, slotCount * 2);
  const childB = bracketSlotTop(index * 2 + 1, slotCount * 2);
  const centerA = childA + BRACKET_CARD_H / 2;
  const centerB = childB + BRACKET_CARD_H / 2;
  return (centerA + centerB) / 2 - BRACKET_CARD_H / 2;
}

export function bracketSlotCenterY(index: number, slotCount: number): number {
  return bracketSlotTop(index, slotCount) + BRACKET_CARD_H / 2;
}

export function bracketCenterStackHeight(): number {
  return BRACKET_CENTER_CARD_H * 2 + BRACKET_CENTER_STACK_GAP;
}

export function bracketFinalTop(): number {
  return (bracketTreeHeight() - bracketCenterStackHeight()) / 2;
}

export function bracketThirdPlaceTop(): number {
  return bracketFinalTop() + BRACKET_CENTER_CARD_H + BRACKET_CENTER_STACK_GAP;
}

export function bracketSemiCenterY(): number {
  return bracketSlotCenterY(0, 1);
}

export function bracketFinalCenterY(): number {
  return bracketFinalTop() + BRACKET_CENTER_CARD_H / 2;
}

export function bracketThirdCenterY(): number {
  return bracketThirdPlaceTop() + BRACKET_CENTER_CARD_H / 2;
}

function normTeam(name: string | null | undefined): string {
  const raw = (name ?? "").trim().toLowerCase();
  if (!raw || raw === "tbd") return "";
  const aliases: Record<string, string> = {
    "congo dr": "congo dr",
    "dr congo": "congo dr",
    "democratic republic of the congo": "congo dr",
    "bosnia and herzegovina": "bosnia & herzegovina",
    "cape verde": "cape verde islands",
    "cape verde islands": "cape verde islands",
    "côte d'ivoire": "ivory coast",
    "cote d'ivoire": "ivory coast",
    "ivory coast": "ivory coast",
    "united states": "usa",
    "u.s.a.": "usa",
    "usa": "usa",
    "turkiye": "türkiye",
    "türkiye": "türkiye",
    "korea republic": "south korea",
    "republic of korea": "south korea",
  };
  return aliases[raw] ?? raw;
}

function normalizeBracketStage(stage: string | null | undefined): string {
  const raw = (stage ?? "").trim().toUpperCase();
  if (!raw || raw === "GROUP_STAGE") return "GROUP_STAGE";
  if (raw === "ROUND_OF_32" || raw === "ROUND OF 32") return "LAST_32";
  if (raw === "ROUND_OF_16" || raw === "ROUND OF 16") return "LAST_16";
  if (raw === "QUARTER_FINAL" || raw === "QUARTER FINAL" || raw === "QUARTER-FINAL") {
    return "QUARTER_FINALS";
  }
  if (raw === "SEMI_FINAL" || raw === "SEMI FINAL" || raw === "SEMI-FINAL") return "SEMI_FINALS";
  if (raw === "THIRD_PLACE_PLAY_OFF" || raw === "THIRD PLACE PLAY-OFF") return "THIRD_PLACE";
  return raw;
}

export function normalizeKnockoutFixtures(fixtures: BracketFixture[]): BracketFixture[] {
  return fixtures.map((f) => ({
    ...f,
    stage: normalizeBracketStage(f.stage),
  }));
}

/** Index team crests from all fixtures (group + knockout) for placeholder enrichment. */
function buildTeamCrestLookup(fixtures: BracketFixture[]): Map<string, BracketTeam> {
  const map = new Map<string, BracketTeam>();
  for (const f of fixtures) {
    for (const team of [f.homeTeam, f.awayTeam]) {
      const key = normTeam(team.name);
      if (!key) continue;
      const existing = map.get(key);
      if (existing?.crest) continue;
      if (team.crest) {
        map.set(key, team);
      } else if (!existing) {
        map.set(key, team);
      }
    }
  }
  return map;
}

function teamFromLookup(name: string, lookup: Map<string, BracketTeam>): BracketTeam {
  return enrichTeam({ name, shortName: name, crest: null }, lookup);
}

function enrichTeam(team: BracketTeam, lookup: Map<string, BracketTeam>): BracketTeam {
  const key = normTeam(team.name);
  const found = key ? lookup.get(key) : undefined;
  if (!found) return team;
  return {
    name: team.name ?? found.name,
    shortName: team.shortName?.trim() || found.shortName?.trim() || team.name,
    crest: team.crest ?? found.crest ?? null,
  };
}

function enrichFixtureTeams(fixture: BracketFixture, lookup: Map<string, BracketTeam>): BracketFixture {
  return {
    ...fixture,
    homeTeam: enrichTeam(fixture.homeTeam, lookup),
    awayTeam: enrichTeam(fixture.awayTeam, lookup),
  };
}

function placeholderR32Fixture(
  home: string,
  away: string,
  side: BracketSide,
  index: number,
  lookup: Map<string, BracketTeam>,
): BracketFixture {
  return {
    id: `r32-placeholder-${side}-${index}`,
    homeTeam: teamFromLookup(home, lookup),
    awayTeam: teamFromLookup(away, lookup),
    kickoff: "",
    status: "SCHEDULED",
    stage: "LAST_32",
    score: null,
  };
}

export function isBracketPlaceholder(fixture: BracketFixture | null | undefined): boolean {
  return Boolean(fixture?.id?.startsWith("r32-placeholder-"));
}

export function isBracketProjected(fixture: BracketFixture | null | undefined): boolean {
  return Boolean(fixture?.id?.startsWith("bracket-projected-"));
}

export function isBracketSynthetic(fixture: BracketFixture | null | undefined): boolean {
  return isBracketPlaceholder(fixture) || isBracketProjected(fixture);
}

/** Faster refresh while knockout matches are live; otherwise keep roadmap current after FT. */
export function worldCupRoadMapPollMs(fixtures: BracketFixture[]): number {
  const knockout = fixtures.filter((f) => f.stage !== "GROUP_STAGE" && !isBracketPlaceholder(f));
  if (knockout.some((f) => isBracketLive(f))) return 15_000;
  if (knockout.some((f) => !isBracketFinished(f))) return 30_000;
  return 60_000;
}

function fixtureMatchesPair(f: BracketFixture, home: string, away: string): boolean {
  const h = normTeam(f.homeTeam.name);
  const a = normTeam(f.awayTeam.name);
  const th = normTeam(home);
  const ta = normTeam(away);
  if (!h || !a) return false;
  return (h === th && a === ta) || (h === ta && a === th);
}

function teamsForFixture(f: BracketFixture | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!f) return out;
  for (const n of [f.homeTeam.name, f.awayTeam.name]) {
    const t = normTeam(n);
    if (t) out.add(t);
  }
  const w = bracketWinnerSide(f);
  if (w) {
    const name = w === "home" ? f.homeTeam.name : f.awayTeam.name;
    const t = normTeam(name);
    if (t) out.add(t);
  }
  return out;
}

function slotLabel(stage: string, side: BracketSide, index: number): string {
  if (stage === "FINAL") return "Final";
  if (stage === "THIRD_PLACE") return "Third Place";
  const ord = index + 1;
  if (stage === "LAST_32") return `Match ${side === "left" ? ord : ord + 8}`;
  if (stage === "LAST_16") return `Round of 16 · ${ord}`;
  if (stage === "QUARTER_FINALS") return `Quarter · ${ord}`;
  if (stage === "SEMI_FINALS") return "Semi-Final";
  return stage.replace(/_/g, " ");
}

function emptySideColumns(side: BracketSide): BracketSlot[][] {
  return SIDE_STAGES.map((stage) => {
    const count = SIDE_COUNTS[stage] ?? 0;
    return Array.from({ length: count }, (_, index) => ({
      fixture: null,
      stage,
      side,
      index,
      label: slotLabel(stage, side, index),
    }));
  });
}

function pairIndexForFixture(f: BracketFixture, pairs: [string, string][]): number {
  for (let i = 0; i < pairs.length; i++) {
    const [home, away] = pairs[i]!;
    if (fixtureMatchesPair(f, home, away)) return i;
  }
  const h = normTeam(f.homeTeam.name);
  const a = normTeam(f.awayTeam.name);
  for (let i = 0; i < pairs.length; i++) {
    const [home, away] = pairs[i]!;
    const th = normTeam(home);
    const ta = normTeam(away);
    if ((h && (h === th || h === ta)) || (a && (a === th || a === ta))) return i;
  }
  return -1;
}

/** Map R32 fixture → official bracket slot using FIFA draw pairings (not kickoff order). */
function assignR32Slots(
  columns: BracketSlot[][],
  fixtures: BracketFixture[],
  side: BracketSide,
  lookup: Map<string, BracketTeam>,
): void {
  const col = columns[0]!;
  const pairs = side === "left" ? R32_LEFT_PAIRS : R32_RIGHT_PAIRS;
  const used = new Set<string>();

  for (const f of fixtures) {
    const idx = pairIndexForFixture(f, pairs);
    if (idx >= 0 && !used.has(f.id)) {
      col[idx] = { ...col[idx]!, fixture: enrichFixtureTeams(f, lookup) };
      used.add(f.id);
    }
  }

  for (let i = 0; i < pairs.length; i++) {
    if (col[i]?.fixture && !isBracketPlaceholder(col[i]?.fixture)) continue;
    const [home, away] = pairs[i]!;
    col[i] = {
      ...col[i]!,
      fixture: placeholderR32Fixture(home, away, side, i, lookup),
    };
  }
}

/** Place later-round fixtures by tracing teams back to feeder matches on the same side. */
function assignFeederSlots(
  columns: BracketSlot[][],
  fixtures: BracketFixture[],
  stageIdx: number,
  lookup: Map<string, BracketTeam>,
): void {
  const col = columns[stageIdx]!;
  const childCol = columns[stageIdx - 1]!;
  const used = new Set<string>();

  for (const f of fixtures) {
    const fTeams = teamsForFixture(f);
    if (fTeams.size === 0) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < col.length; i++) {
      const pool = new Set<string>();
      for (const t of teamsForFixture(childCol[i * 2]?.fixture)) pool.add(t);
      for (const t of teamsForFixture(childCol[i * 2 + 1]?.fixture)) pool.add(t);
      let score = 0;
      for (const t of fTeams) if (pool.has(t)) score++;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore > 0 && !used.has(f.id)) {
      col[bestIdx] = { ...col[bestIdx]!, fixture: enrichFixtureTeams(f, lookup) };
      used.add(f.id);
    }
  }
}

const TBD_TEAM: BracketTeam = { name: null, shortName: null, crest: null };

function bracketWinnerTeam(fixture: BracketFixture): BracketTeam | null {
  const side = bracketWinnerSide(fixture);
  if (side === "home") return fixture.homeTeam;
  if (side === "away") return fixture.awayTeam;
  return null;
}

/** Fill later-round slots from feeder winners when the API fixture is not synced yet. */
function projectSlotFromFeeders(
  slot: BracketSlot,
  feederA: BracketFixture | null | undefined,
  feederB: BracketFixture | null | undefined,
  lookup: Map<string, BracketTeam>,
): BracketFixture | null {
  const winnerA = feederA ? bracketWinnerTeam(feederA) : null;
  const winnerB = feederB ? bracketWinnerTeam(feederB) : null;
  if (!winnerA && !winnerB) return null;

  return {
    id: `bracket-projected-${slot.stage}-${slot.side}-${slot.index}`,
    homeTeam: winnerA ? enrichTeam(winnerA, lookup) : TBD_TEAM,
    awayTeam: winnerB ? enrichTeam(winnerB, lookup) : TBD_TEAM,
    kickoff: "",
    status: "SCHEDULED",
    stage: slot.stage,
    score: null,
  };
}

function projectEmptySlots(columns: BracketSlot[][], lookup: Map<string, BracketTeam>): void {
  for (let stageIdx = 1; stageIdx < columns.length; stageIdx++) {
    const col = columns[stageIdx]!;
    const childCol = columns[stageIdx - 1]!;
    for (let i = 0; i < col.length; i++) {
      const slot = col[i]!;
      if (slot.fixture) continue;
      const projected = projectSlotFromFeeders(
        slot,
        childCol[i * 2]?.fixture,
        childCol[i * 2 + 1]?.fixture,
        lookup,
      );
      if (projected) {
        col[i] = { ...slot, fixture: projected };
      }
    }
  }
}

function stageFixtures(fixtures: BracketFixture[], stage: string): BracketFixture[] {
  return fixtures.filter((f) => f.stage === stage);
}

function buildSideColumns(
  fixtures: BracketFixture[],
  side: BracketSide,
  lookup: Map<string, BracketTeam>,
): BracketSlot[][] {
  const columns = emptySideColumns(side);

  assignR32Slots(columns, stageFixtures(fixtures, "LAST_32"), side, lookup);

  for (let stageIdx = 1; stageIdx < SIDE_STAGES.length; stageIdx++) {
    const stage = SIDE_STAGES[stageIdx]!;
    assignFeederSlots(columns, stageFixtures(fixtures, stage), stageIdx, lookup);
  }

  projectEmptySlots(columns, lookup);

  return columns;
}

/** Group knockout fixtures into left / center / right bracket columns. */
export function buildKnockoutBracket(fixtures: BracketFixture[]): KnockoutBracket {
  const normalized = normalizeKnockoutFixtures(fixtures);
  const teamLookup = buildTeamCrestLookup(normalized);
  const knockout = normalized.filter((f) => f.stage !== "GROUP_STAGE");
  const finals = stageFixtures(knockout, "FINAL").map((f) => enrichFixtureTeams(f, teamLookup));
  const third = stageFixtures(knockout, "THIRD_PLACE").map((f) => enrichFixtureTeams(f, teamLookup));

  return {
    left: buildSideColumns(knockout, "left", teamLookup),
    right: buildSideColumns(knockout, "right", teamLookup),
    center: [
      {
        fixture: finals[0] ?? null,
        stage: "FINAL",
        side: "center",
        index: 0,
        label: "Final",
      },
      {
        fixture: third[0] ?? null,
        stage: "THIRD_PLACE",
        side: "center",
        index: 0,
        label: "Third Place",
      },
    ],
  };
}

export function isBracketTeamKnown(team: BracketTeam | null | undefined): boolean {
  const name = team?.name?.trim() ?? "";
  return Boolean(name && name.toUpperCase() !== "TBD");
}

export function bracketTeamLabel(team: BracketTeam | null | undefined): string {
  if (!isBracketTeamKnown(team)) return "TBD";
  return team!.shortName?.trim() || team!.name!.trim();
}

export function isBracketLive(fixture: BracketFixture): boolean {
  return (
    fixture.status === "IN_PLAY" ||
    fixture.status === "PAUSED" ||
    fixture.status === "EXTRA_TIME" ||
    fixture.status === "PENALTY"
  );
}

export function isBracketFinished(fixture: BracketFixture): boolean {
  return fixture.status === "FINISHED";
}

export function bracketWinnerSide(fixture: BracketFixture): "home" | "away" | null {
  const w = fixture.score?.winner?.toUpperCase() ?? "";
  if (w === "HOME_TEAM" || w === "HOME") return "home";
  if (w === "AWAY_TEAM" || w === "AWAY") return "away";
  if (!isBracketFinished(fixture)) return null;
  const h = fixture.score?.home;
  const a = fixture.score?.away;
  if (h == null || a == null) return null;
  if (h > a) return "home";
  if (a > h) return "away";
  return null;
}
