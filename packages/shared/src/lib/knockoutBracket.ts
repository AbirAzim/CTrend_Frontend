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
    "côte d'ivoire": "ivory coast",
    "cote d'ivoire": "ivory coast",
    "united states": "usa",
    "u.s.a.": "usa",
    "turkiye": "türkiye",
  };
  return aliases[raw] ?? raw;
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

/** Map R32 fixture → official bracket slot using FIFA draw pairings (not kickoff order). */
function assignR32Slots(
  columns: BracketSlot[][],
  fixtures: BracketFixture[],
  side: BracketSide,
): void {
  const col = columns[0]!;
  const pairs = side === "left" ? R32_LEFT_PAIRS : R32_RIGHT_PAIRS;

  for (const f of fixtures) {
    for (let i = 0; i < pairs.length; i++) {
      const [home, away] = pairs[i]!;
      if (fixtureMatchesPair(f, home, away)) {
        col[i] = { ...col[i]!, fixture: f };
        break;
      }
    }
  }
}

/** Place later-round fixtures by tracing teams back to feeder matches on the same side. */
function assignFeederSlots(
  columns: BracketSlot[][],
  fixtures: BracketFixture[],
  stageIdx: number,
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
      col[bestIdx] = { ...col[bestIdx]!, fixture: f };
      used.add(f.id);
    }
  }
}

function stageFixtures(fixtures: BracketFixture[], stage: string): BracketFixture[] {
  return fixtures.filter((f) => f.stage === stage);
}

function buildSideColumns(fixtures: BracketFixture[], side: BracketSide): BracketSlot[][] {
  const columns = emptySideColumns(side);

  assignR32Slots(columns, stageFixtures(fixtures, "LAST_32"), side);

  for (let stageIdx = 1; stageIdx < SIDE_STAGES.length; stageIdx++) {
    const stage = SIDE_STAGES[stageIdx]!;
    assignFeederSlots(columns, stageFixtures(fixtures, stage), stageIdx);
  }

  return columns;
}

/** Group knockout fixtures into left / center / right bracket columns. */
export function buildKnockoutBracket(fixtures: BracketFixture[]): KnockoutBracket {
  const knockout = fixtures.filter((f) => f.stage !== "GROUP_STAGE");
  const finals = stageFixtures(knockout, "FINAL");
  const third = stageFixtures(knockout, "THIRD_PLACE");

  return {
    left: buildSideColumns(knockout, "left"),
    right: buildSideColumns(knockout, "right"),
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
  return null;
}
