import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BRACKET_BOARD_GAP,
  BRACKET_CARD_H,
  BRACKET_CENTER_CARD_H,
  BRACKET_CENTER_W,
  BRACKET_COL_W,
  BRACKET_CONN_W,
  BRACKET_STAGE_META,
  type BracketFixture,
  type BracketSlot,
  type BracketTeam,
  bracketChampionshipWidth,
  bracketFinalCenterY,
  bracketBoardWidth,
  bracketBoardHeight,
  bracketSemiCenterY,
  bracketSlotCenterY,
  bracketSlotTop,
  bracketTeamLabel,
  bracketThirdCenterY,
  bracketTreeHeight,
  bracketWinnerSide,
  buildKnockoutBracket,
  isBracketFinished,
  isBracketLive,
  isBracketSynthetic,
  isBracketTeamKnown,
} from "@ctrend/shared/lib/knockoutBracket";
import type { WcFixture } from "../lib/worldCupFixtures";

const TREE_H = bracketTreeHeight();
const BOARD_W = bracketBoardWidth();
const BOARD_H = bracketBoardHeight();
const SIDE_STAGES = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS"] as const;

type BracketViewportMode = "desktop" | "mobile-portrait" | "mobile-landscape";

function useBracketViewportMode(): BracketViewportMode {
  const [mode, setMode] = useState<BracketViewportMode>("desktop");

  useEffect(() => {
    const mobileMq = window.matchMedia("(max-width: 900px)");
    const landscapeMq = window.matchMedia("(orientation: landscape)");

    const sync = () => {
      if (!mobileMq.matches) {
        setMode("desktop");
        return;
      }
      setMode(landscapeMq.matches ? "mobile-landscape" : "mobile-portrait");
    };

    sync();
    mobileMq.addEventListener("change", sync);
    landscapeMq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      mobileMq.removeEventListener("change", sync);
      landscapeMq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return mode;
}

function clampTouchPan(
  tx: number,
  ty: number,
  scale: number,
  viewportW: number,
  viewportH: number,
) {
  const contentW = BOARD_W * scale;
  const contentH = BOARD_H * scale;
  const maxX = Math.max(0, (contentW - viewportW) / 2);
  const maxY = Math.max(0, (contentH - viewportH) / 2);
  return {
    x: Math.min(Math.max(tx, -maxX), maxX),
    y: Math.min(Math.max(ty, -maxY), maxY),
  };
}

type TouchGesture = {
  mode: "none" | "pan" | "pinch";
  startDist: number;
  startScale: number;
  startTx: number;
  startTy: number;
  startCx: number;
  startCy: number;
};

function BracketTouchZoomViewport({
  viewportW,
  viewportH,
  children,
}: {
  viewportW: number;
  viewportH: number;
  children: ReactNode;
}) {
  const baseScale =
    viewportW > 0 && viewportH > 0 ? Math.min(viewportW / BOARD_W, viewportH / BOARD_H) : 1;
  const minScale = baseScale * 0.92;
  const maxScale = Math.max(baseScale * 3.5, 2);
  const [scale, setScale] = useState(baseScale);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const gesture = useRef<TouchGesture>({
    mode: "none",
    startDist: 1,
    startScale: baseScale,
    startTx: 0,
    startTy: 0,
    startCx: 0,
    startCy: 0,
  });

  useEffect(() => {
    setScale(baseScale);
    setTx(0);
    setTy(0);
    gesture.current.startScale = baseScale;
  }, [baseScale, viewportW, viewportH]);

  function setupGesture(touches: TouchList) {
    if (touches.length >= 2) {
      const a = touches[0]!;
      const b = touches[1]!;
      gesture.current = {
        mode: "pinch",
        startDist: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startCx: (a.clientX + b.clientX) / 2,
        startCy: (a.clientY + b.clientY) / 2,
      };
    } else if (touches.length === 1) {
      const t = touches[0]!;
      gesture.current = {
        mode: "pan",
        startDist: 1,
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startCx: t.clientX,
        startCy: t.clientY,
      };
    }
  }

  return (
    <div
      className="wc-brk-touch-viewport"
      style={{ width: viewportW, height: viewportH }}
      onTouchStart={(e) => setupGesture(e.touches)}
      onTouchMove={(e) => {
        const touches = e.touches;
        if (touches.length >= 2) {
          if (gesture.current.mode !== "pinch") setupGesture(touches);
          const a = touches[0]!;
          const b = touches[1]!;
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const mx = (a.clientX + b.clientX) / 2;
          const my = (a.clientY + b.clientY) / 2;
          const nextScale = Math.min(
            maxScale,
            Math.max(minScale, gesture.current.startScale * (dist / gesture.current.startDist)),
          );
          const clamped = clampTouchPan(
            gesture.current.startTx + (mx - gesture.current.startCx),
            gesture.current.startTy + (my - gesture.current.startCy),
            nextScale,
            viewportW,
            viewportH,
          );
          setScale(nextScale);
          setTx(clamped.x);
          setTy(clamped.y);
        } else if (touches.length === 1) {
          if (gesture.current.mode !== "pan") setupGesture(touches);
          const t = touches[0]!;
          const clamped = clampTouchPan(
            gesture.current.startTx + (t.clientX - gesture.current.startCx),
            gesture.current.startTy + (t.clientY - gesture.current.startCy),
            scale,
            viewportW,
            viewportH,
          );
          setTx(clamped.x);
          setTy(clamped.y);
        }
      }}
      onTouchEnd={() => {
        gesture.current.mode = "none";
      }}
    >
      <div className="wc-brk-touch-stage">
        <div
          className="wc-brk-touch-board"
          style={{
            width: BOARD_W,
            height: BOARD_H,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function BracketScaleViewport({
  children,
  viewportMode,
}: {
  children: ReactNode;
  viewportMode: BracketViewportMode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [needsScroll, setNeedsScroll] = useState(false);
  const isMobileLandscape = viewportMode === "mobile-landscape";
  const isMobilePortrait = viewportMode === "mobile-portrait";

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const update = () => {
      const availableW = vp.clientWidth;
      const availableH = vp.clientHeight;
      const minScale = isMobileLandscape ? 0.28 : 0.82;
      const fitScaleW = availableW / BOARD_W;
      const fitScale =
        isMobileLandscape && availableH > 0
          ? Math.min(fitScaleW, availableH / BOARD_H)
          : fitScaleW;
      const nextScale = Math.min(1, Math.max(minScale, fitScale));
      setScale(nextScale);
      setNeedsScroll(!isMobileLandscape && BOARD_W * nextScale > availableW + 2);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [isMobileLandscape]);

  const frameW = BOARD_W * scale;
  const frameH = BOARD_H * scale;

  return (
    <div
      className={`wc-brk-viewport-wrap${isMobileLandscape ? " wc-brk-viewport-wrap--landscape" : ""}${isMobilePortrait ? " wc-brk-viewport-wrap--portrait" : ""}`}
    >
      {needsScroll && !isMobilePortrait && (
        <p className="wc-brk-scroll-hint">Swipe sideways to explore the full road map</p>
      )}
      <div className="wc-brk-viewport" ref={viewportRef}>
        <div
          className="wc-brk-scale-frame"
          style={{ width: frameW, height: frameH }}
        >
          <div
            className="wc-brk-scale-inner"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `scale(${scale})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function BracketCrest({ team }: { team: BracketTeam }) {
  const label = bracketTeamLabel(team);
  if (!isBracketTeamKnown(team) || !team.crest) {
    return (
      <span className="wc-brk-crest wc-brk-crest--ph" aria-hidden>
        {label === "TBD" ? "?" : label.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={team.crest}
      alt=""
      className="wc-brk-crest"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function BracketTeamsBody({
  home,
  away,
  homeWin,
  awayWin,
  hasScore,
  homeScore,
  awayScore,
}: {
  home: BracketTeam;
  away: BracketTeam;
  homeWin: boolean;
  awayWin: boolean;
  hasScore: boolean;
  homeScore?: number | null;
  awayScore?: number | null;
}) {
  return (
    <div className="wc-brk-card-body">
      <div className={`wc-brk-team-cell${homeWin ? " wc-brk-team-cell--win" : ""}`}>
        <BracketCrest team={home} />
        <span className="wc-brk-name" title={bracketTeamLabel(home)}>
          {bracketTeamLabel(home)}
        </span>
        {hasScore && (
          <span className={`wc-brk-cell-score${homeWin ? " wc-brk-cell-score--win" : ""}`}>
            {homeScore ?? "–"}
          </span>
        )}
      </div>
      <div className="wc-brk-vs-col" aria-hidden>
        {hasScore ? (
          <span className="wc-brk-score-dot">:</span>
        ) : (
          <span className="wc-brk-vs">VS</span>
        )}
      </div>
      <div className={`wc-brk-team-cell${awayWin ? " wc-brk-team-cell--win" : ""}`}>
        <BracketCrest team={away} />
        <span className="wc-brk-name" title={bracketTeamLabel(away)}>
          {bracketTeamLabel(away)}
        </span>
        {hasScore && (
          <span className={`wc-brk-cell-score${awayWin ? " wc-brk-cell-score--win" : ""}`}>
            {awayScore ?? "–"}
          </span>
        )}
      </div>
    </div>
  );
}

function stageFootnote(stage: string): string | null {
  if (stage === "SEMI_FINALS") return "Win → Final · Lose → 3rd";
  if (stage === "FINAL") return "Semi winners only";
  if (stage === "THIRD_PLACE") return "Semi losers only";
  return null;
}

function BracketMatchCard({
  slot,
  onOpen,
}: {
  slot: BracketSlot;
  onOpen: (id: string) => void;
}) {
  const fixture = slot.fixture;
  const stageMeta = BRACKET_STAGE_META[slot.stage as keyof typeof BRACKET_STAGE_META];
  const clickable =
    fixture &&
    !isBracketSynthetic(fixture) &&
    (isBracketLive(fixture) || isBracketFinished(fixture));

  const tbd: BracketTeam = { name: null, shortName: null, crest: null };

  const content = !fixture ? (
    <div className="wc-brk-card wc-brk-card--empty">
      <div
        className="wc-brk-card-head"
        style={{ ["--stage-accent" as string]: stageMeta?.color }}
      >
        <div className="wc-brk-card-head-text">
          <span>{slot.label}</span>
          {stageFootnote(slot.stage) ? (
            <span className="wc-brk-card-footnote">{stageFootnote(slot.stage)}</span>
          ) : null}
        </div>
      </div>
      <BracketTeamsBody home={tbd} away={tbd} homeWin={false} awayWin={false} hasScore={false} />
    </div>
  ) : (
    <BracketFixtureCard
      fixture={fixture}
      label={slot.label}
      stage={slot.stage}
      stageColor={stageMeta?.color ?? "#6366f1"}
    />
  );

  if (!clickable || !fixture) return content;

  return (
    <button
      type="button"
      className="wc-brk-card-btn"
      onClick={() => onOpen(fixture.id)}
      aria-label={`Open ${bracketTeamLabel(fixture.homeTeam)} vs ${bracketTeamLabel(fixture.awayTeam)}`}
    >
      {content}
    </button>
  );
}

function BracketFixtureCard({
  fixture,
  label,
  stage,
  stageColor,
}: {
  fixture: BracketFixture;
  label: string;
  stage: string;
  stageColor: string;
}) {
  const live = isBracketLive(fixture);
  const finished = isBracketFinished(fixture);
  const winner = bracketWinnerSide(fixture);
  const hasScore = live || finished;
  const footnote = stageFootnote(stage);

  return (
    <div
      className={`wc-brk-card${live ? " wc-brk-card--live" : ""}${finished ? " wc-brk-card--done" : ""}${stage === "FINAL" ? " wc-brk-card--final" : ""}${stage === "THIRD_PLACE" ? " wc-brk-card--third" : ""}${stage === "SEMI_FINALS" ? " wc-brk-card--semi" : ""}`}
    >
      <div
        className="wc-brk-card-head"
        style={{ ["--stage-accent" as string]: stageColor }}
      >
        <div className="wc-brk-card-head-text">
          <span>{label}</span>
          {footnote ? <span className="wc-brk-card-footnote">{footnote}</span> : null}
        </div>
        {live && <span className="wc-brk-live-pill">LIVE</span>}
        {finished && !live && <span className="wc-brk-ft-pill">FT</span>}
      </div>
      <BracketTeamsBody
        home={fixture.homeTeam}
        away={fixture.awayTeam}
        homeWin={winner === "home"}
        awayWin={winner === "away"}
        hasScore={hasScore}
        homeScore={fixture.score?.home}
        awayScore={fixture.score?.away}
      />
    </div>
  );
}

function BracketColumn({
  stage,
  slots,
  onOpen,
  align,
}: {
  stage: string;
  slots: BracketSlot[];
  onOpen: (id: string) => void;
  align: "left" | "right";
}) {
  const meta = BRACKET_STAGE_META[stage as keyof typeof BRACKET_STAGE_META];
  const count = slots.length;

  return (
    <div className={`wc-brk-col wc-brk-col--${align}`}>
      <div
        className="wc-brk-col-title"
        style={{ ["--stage-accent" as string]: meta?.color ?? "#6366f1" }}
      >
        {meta?.label ?? stage}
      </div>
      <div className="wc-brk-col-track" style={{ height: TREE_H }}>
        {slots.map((slot) => (
          <div
            key={`${stage}-${slot.index}`}
            className="wc-brk-slot"
            style={{
              top: bracketSlotTop(slot.index, count),
              height: BRACKET_CARD_H,
            }}
          >
            <BracketMatchCard slot={slot} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnector({
  fromCount,
  toCount,
  side,
}: {
  fromCount: number;
  toCount: number;
  side: "left" | "right";
}) {
  const paths: string[] = [];
  for (let i = 0; i < toCount; i++) {
    const yParent = bracketSlotCenterY(i, toCount);
    const yA = bracketSlotCenterY(i * 2, fromCount);
    const yB = bracketSlotCenterY(i * 2 + 1, fromCount);
    if (side === "left") {
      paths.push(`M 0 ${yA} H 9 V ${yParent} H 18`);
      paths.push(`M 0 ${yB} H 9 V ${yParent}`);
    } else {
      paths.push(`M 18 ${yA} H 9 V ${yParent} H 0`);
      paths.push(`M 18 ${yB} H 9 V ${yParent}`);
    }
  }

  return (
    <div className="wc-brk-connector">
      <div className="wc-brk-connector-head" aria-hidden />
      <svg
        className="wc-brk-connector-svg"
        viewBox={`0 0 18 ${TREE_H}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {paths.map((d, i) => (
          <path key={i} d={d} className="wc-brk-line" />
        ))}
      </svg>
    </div>
  );
}

function BracketSide({
  columns,
  onOpen,
  side,
}: {
  columns: BracketSlot[][];
  onOpen: (id: string) => void;
  side: "left" | "right";
}) {
  const counts = [8, 4, 2, 1];
  const stages = side === "left" ? [...SIDE_STAGES] : [...SIDE_STAGES].reverse();

  return (
    <div className={`wc-brk-side wc-brk-side--${side}`}>
      {stages.map((stage, idx) => {
        const stageIdx = SIDE_STAGES.indexOf(stage);
        let connector: ReactNode = null;
        if (idx > 0) {
          const prevIdx = SIDE_STAGES.indexOf(stages[idx - 1]!);
          const fromCount = side === "left" ? counts[prevIdx]! : counts[stageIdx]!;
          const toCount = side === "left" ? counts[stageIdx]! : counts[prevIdx]!;
          connector = (
            <BracketConnector
              key={`conn-${stage}`}
              fromCount={fromCount}
              toCount={toCount}
              side={side}
            />
          );
        }
        return (
          <Fragment key={stage}>
            {connector}
            <BracketColumn stage={stage} slots={columns[stageIdx] ?? []} onOpen={onOpen} align={side} />
          </Fragment>
        );
      })}
    </div>
  );
}

function BracketChampionshipZone({
  slots,
  onOpen,
}: {
  slots: BracketSlot[];
  onOpen: (id: string) => void;
}) {
  const finalSlot = slots.find((s) => s.stage === "FINAL");
  const thirdSlot = slots.find((s) => s.stage === "THIRD_PLACE");
  const sfY = bracketSemiCenterY();
  const finalY = bracketFinalCenterY();
  const thirdY = bracketThirdCenterY();
  const hubW = bracketChampionshipWidth();
  const midX = hubW / 2;
  const cardLeft = (hubW - BRACKET_CENTER_W) / 2;
  const cardRight = cardLeft + BRACKET_CENTER_W;

  const winnerPaths = [
    `M 0 ${sfY} H ${cardLeft - 6} V ${finalY} H ${midX}`,
    `M ${hubW} ${sfY} H ${cardRight + 6} V ${finalY} H ${midX}`,
  ];
  const loserPaths = [
    `M 0 ${sfY} H ${cardLeft - 10} V ${thirdY} H ${midX}`,
    `M ${hubW} ${sfY} H ${cardRight + 10} V ${thirdY} H ${midX}`,
  ];

  return (
    <div
      className="wc-brk-championship"
      style={{ ["--brk-champ-w" as string]: `${hubW}px`, ["--brk-center-w" as string]: `${BRACKET_CENTER_W}px` }}
    >
      <div className="wc-brk-championship-head">
        <span className="wc-brk-championship-title">Road to the Trophy</span>
        <span className="wc-brk-championship-sub">
          Winners play the Final · Losers play for bronze
        </span>
      </div>
      <div
        className="wc-brk-championship-track"
        style={{
          height: TREE_H,
          ["--brk-tree-h" as string]: `${TREE_H}px`,
          ["--brk-center-card-h" as string]: `${BRACKET_CENTER_CARD_H}px`,
        }}
      >
        <svg
          className="wc-brk-championship-svg"
          viewBox={`0 0 ${hubW} ${TREE_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {winnerPaths.map((d, i) => (
            <path key={`w-${i}`} d={d} className="wc-brk-line wc-brk-line--winner" />
          ))}
          {loserPaths.map((d, i) => (
            <path key={`l-${i}`} d={d} className="wc-brk-line wc-brk-line--loser" />
          ))}
        </svg>

        <div className="wc-brk-championship-stack">
          {finalSlot && (
            <div className="wc-brk-center-card">
              <BracketMatchCard slot={finalSlot} onOpen={onOpen} />
            </div>
          )}

          <div className="wc-brk-center-bridge" aria-hidden>
            <span className="wc-brk-center-bridge-line wc-brk-center-bridge-line--win" />
            <span className="wc-brk-center-bridge-label">Semi losers ↓</span>
            <span className="wc-brk-center-bridge-line wc-brk-center-bridge-line--lose" />
          </div>

          {thirdSlot && (
            <div className="wc-brk-center-card">
              <BracketMatchCard slot={thirdSlot} onOpen={onOpen} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketGuide() {
  const stages = Object.entries(BRACKET_STAGE_META) as [
    keyof typeof BRACKET_STAGE_META,
    (typeof BRACKET_STAGE_META)[keyof typeof BRACKET_STAGE_META],
  ][];

  return (
    <aside className="wc-brk-guide" aria-label="How to read the knockout road map">
      <p className="wc-brk-guide-lead">How to read this map</p>
      <div className="wc-brk-guide-rows">
        <div className="wc-brk-guide-row">
          <span className="wc-brk-guide-row-label">Lines</span>
          <div className="wc-brk-guide-chips">
            <span className="wc-brk-guide-chip">
              <span className="wc-brk-guide-line wc-brk-guide-line--win" aria-hidden />
              Semi winners → Final
            </span>
            <span className="wc-brk-guide-chip">
              <span className="wc-brk-guide-line wc-brk-guide-line--lose" aria-hidden />
              Semi losers → Third place
            </span>
            <span className="wc-brk-guide-chip">
              <span className="wc-brk-guide-line wc-brk-guide-line--std" aria-hidden />
              Winners advance
            </span>
          </div>
        </div>
        <div className="wc-brk-guide-row">
          <span className="wc-brk-guide-row-label">Rounds</span>
          <div className="wc-brk-guide-chips">
            {stages.map(([key, meta]) => (
              <span
                key={key}
                className="wc-brk-guide-chip wc-brk-guide-chip--stage"
                style={{ ["--stage-accent" as string]: meta.color }}
              >
                <span className="wc-brk-guide-dot" aria-hidden />
                {meta.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function WorldCupKnockoutBracket({ fixtures }: { fixtures: WcFixture[] }) {
  const navigate = useNavigate();
  const viewportMode = useBracketViewportMode();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewRotated, setViewRotated] = useState(false);
  const bracket = useMemo(() => buildKnockoutBracket(fixtures as BracketFixture[]), [fixtures]);
  const hasKnockout = fixtures.some((f) => f.stage !== "GROUP_STAGE");
  const isMobile = viewportMode !== "desktop";

  const onOpen = (id: string) => navigate(`/world-cup/match/${id}`);

  useEffect(() => {
    if (!isMobile) return;
    document.body.classList.add("wc-road-map-active");
    return () => document.body.classList.remove("wc-road-map-active");
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const el = bodyRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setViewportSize({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, [isMobile]);

  const bracketViewport = useMemo(() => {
    const { width: w, height: h } = viewportSize;
    if (w <= 0 || h <= 0) return viewportSize;
    return viewRotated ? { width: h, height: w } : viewportSize;
  }, [viewportSize, viewRotated]);

  const toggleRotate = () => setViewRotated((v) => !v);

  if (!hasKnockout) {
    return (
      <p className="wc-status-msg">
        Knockout fixtures are not available yet. They will appear once the group stage ends.
      </p>
    );
  }

  const board = (
    <div
      className="wc-brk-board"
      style={{
        ["--brk-tree-h" as string]: `${TREE_H}px`,
        ["--brk-card-h" as string]: `${BRACKET_CARD_H}px`,
        ["--brk-col-w" as string]: `${BRACKET_COL_W}px`,
        ["--brk-conn-w" as string]: `${BRACKET_CONN_W}px`,
        ["--brk-center-w" as string]: `${BRACKET_CENTER_W}px`,
        ["--brk-champ-w" as string]: `${bracketChampionshipWidth()}px`,
        ["--brk-board-gap" as string]: `${BRACKET_BOARD_GAP}px`,
      }}
    >
      <div className="wc-brk-half">
        <BracketSide columns={bracket.left} onOpen={onOpen} side="left" />
      </div>
      <BracketChampionshipZone slots={bracket.center} onOpen={onOpen} />
      <div className="wc-brk-half">
        <BracketSide columns={bracket.right} onOpen={onOpen} side="right" />
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <section className="wc-brk wc-brk--mobile-app">
        <div className="wc-brk-mobile-bar">
          <span className="wc-brk-mobile-spacer" aria-hidden />
          <h2 className="wc-brk-mobile-title">Knockout Road Map</h2>
          <button type="button" className="wc-brk-rotate-btn" onClick={toggleRotate}>
            {viewRotated ? "Portrait" : "Rotate"}
          </button>
        </div>
        <div className="wc-brk-body wc-brk-body--mobile">
          <div
            className="wc-brk-rotate-stage"
            ref={bodyRef}
            onTouchStart={(e) => {
              if (e.touches.length === 2) e.preventDefault();
            }}
          >
            <div
              className={`wc-brk-rotate-host${viewRotated ? " wc-brk-rotate-host--on" : ""}`}
              style={
                viewRotated && viewportSize.width > 0 && viewportSize.height > 0
                  ? { width: viewportSize.height, height: viewportSize.width }
                  : undefined
              }
            >
              <div className="wc-brk-mobile-viewport">
                {bracketViewport.width > 0 && bracketViewport.height > 0 ? (
                  <BracketTouchZoomViewport
                    viewportW={bracketViewport.width}
                    viewportH={bracketViewport.height}
                  >
                    {board}
                  </BracketTouchZoomViewport>
                ) : null}
              </div>
            </div>
          </div>
          <p className="wc-brk-zoom-hint">
            {viewRotated
              ? "Pinch to zoom · drag to pan · double-tap to reset"
              : "Pinch to zoom · Rotate widens the bracket in-app"}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="wc-brk">
      <div className="wc-brk-head">
        <div>
          <h2 className="wc-brk-head-title">Knockout Road Map</h2>
          <p className="wc-brk-head-sub">
            Round of 32 to the Final — semi winners play for the trophy, semi losers for bronze.
          </p>
        </div>
      </div>
      <div className="wc-brk-body">
        <BracketGuide />
        <BracketScaleViewport viewportMode={viewportMode}>{board}</BracketScaleViewport>
      </div>
    </section>
  );
}
