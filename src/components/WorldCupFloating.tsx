import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";
import {
  type WcFixture,
  canVoteOnFixture,
  countdownToKickoff,
  finishedFixtures,
  formatTime,
  groupByDay,
  involvesTeam,
  liveBadgeLabel,
  liveFixtures,
  needsSecondTick,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";

type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };

const STORAGE_KEY_Y = "ctrend_wc_tab_pos_y";
const TAB_H = 68;
const CARD_APPROX_H = 430;
const TAB_OVERHANG = 0; // fully visible on web (unlike mobile which clips at the edge)

function loadPosY(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_Y);
    if (!raw) return null;
    const v = parseFloat(raw);
    return Number.isNaN(v) ? null : v;
  } catch {
    return null;
  }
}

function savePosY(y: number) {
  localStorage.setItem(STORAGE_KEY_Y, String(y));
}

function clampY(y: number): number {
  const minY = 60;
  const maxY = window.innerHeight - TAB_H - 20;
  return Math.max(minY, Math.min(maxY, y));
}

function clampCardY(y: number): number {
  const minY = 60;
  const maxY = window.innerHeight - CARD_APPROX_H - 20;
  return Math.max(minY, Math.min(Math.max(minY, maxY), y));
}

function defaultPosY(): number {
  return clampY(Math.round(window.innerHeight * 0.46));
}

export function WorldCupFloating() {
  const navigate = useNavigate();
  const followed = useFollowedTeam();
  const [open, setOpen] = useState(true);
  const [, setTick] = useState(0);
  const [posY, setPosY] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const dragRef = useRef({ startY: 0, oy: 0, moved: false });
  const tabRef = useRef<HTMLDivElement>(null);

  // Card drag state
  const [cardY, setCardY] = useState<number | null>(null);
  const [cardDragging, setCardDragging] = useState(false);
  const cardDragRef = useRef({ startY: 0, oy: 0 });
  const lastCardY = useRef<number | null>(null);

  // Load saved tab position
  useEffect(() => {
    const saved = loadPosY();
    setPosY(saved !== null ? clampY(saved) : defaultPosY());
    // Show hint for 3 s on first load
    if (!localStorage.getItem("ctrend_wc_hint_seen")) {
      setShowHint(true);
      setTimeout(() => {
        setShowHint(false);
        localStorage.setItem("ctrend_wc_hint_seen", "1");
      }, 3000);
    }
  }, []);

  // Adaptive tick: 1 s when near kickoff, else 30 s
  const allFixturesRef = useRef<WcFixture[]>([]);
  useEffect(() => {
    function schedule() {
      const fast = needsSecondTick(allFixturesRef.current);
      const id = setTimeout(() => {
        setTick((n) => n + 1);
        schedule();
      }, fast ? 1000 : 30_000);
      return id;
    }
    const id = schedule();
    return () => clearTimeout(id);
  }, []);

  const { data: campData } = useQuery<{ activeCampaigns: Campaign[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
  });
  const wcCampaign = (campData?.activeCampaigns ?? []).find((c) => c.fixturesEnabled);

  const { data } = useQuery<{ worldCupFixtures: WcFixture[] }>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network",
    errorPolicy: "all",
    pollInterval: 60_000,
    skip: !wcCampaign,
  });

  const fixtures = data?.worldCupFixtures ?? [];
  allFixturesRef.current = fixtures;
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const nextDays = groupByDay(nextUpcoming(filtered, 3));
  const recent = finishedFixtures(filtered).slice(0, 2);

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0 && recent.length === 0) return null;

  // Flags are only shown when a match is live; trophy otherwise.
  const liveFixture = live[0] ?? null;

  function openMatch(f: WcFixture) {
    setOpen(false);
    navigate(f.campaignPostId ? `/post/${f.campaignPostId}` : `/world-cup?focus=${f.id}`);
  }

  // ── Tab drag handlers ─────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    if (open) return;
    dragRef.current = {
      startY: e.clientY,
      oy: posY ?? defaultPosY(),
      moved: false,
    };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dy) > 4) dragRef.current.moved = true;
    setPosY(clampY(dragRef.current.oy + dy));
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    setDragging(false);
    const dy = e.clientY - dragRef.current.startY;
    const next = clampY(dragRef.current.oy + dy);
    setPosY(next);
    savePosY(next);
    if (!dragRef.current.moved) openCard(next); // tap without drag → open
  }

  // ── Card open / drag handlers ─────────────────────────────────────────────
  function openCard(tabPosY?: number) {
    const baseY = tabPosY ?? posY ?? defaultPosY();
    const initial = lastCardY.current !== null
      ? lastCardY.current
      : clampCardY(baseY - 40);
    lastCardY.current = initial;
    setCardY(initial);
    setOpen(true);
  }

  function onCardHandleDown(e: React.PointerEvent) {
    cardDragRef.current = { startY: e.clientY, oy: cardY ?? 60 };
    setCardDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onCardHandleMove(e: React.PointerEvent) {
    if (!cardDragging) return;
    const dy = e.clientY - cardDragRef.current.startY;
    const next = clampCardY(cardDragRef.current.oy + dy);
    setCardY(next);
    lastCardY.current = next;
  }

  function onCardHandleUp() {
    setCardDragging(false);
  }

  if (posY === null) return null;

  if (!open) {
    return (
      <div
        ref={tabRef}
        className={`wc-tab${live.length > 0 ? " wc-tab--live" : ""}${dragging ? " wc-tab--dragging" : ""}`}
        style={{ right: -TAB_OVERHANG, top: posY }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label="Open World Cup fixtures — drag to move"
        onKeyDown={(e) => e.key === "Enter" && openCard()}
      >
        {liveFixture ? (
          <div className="wc-tab-flags">
            {liveFixture.homeTeam.crest
              ? <img src={liveFixture.homeTeam.crest} className="wc-tab-flag" alt={liveFixture.homeTeam.shortName ?? ""} />
              : <span className="wc-tab-flag wc-tab-flag--ph">{(liveFixture.homeTeam.shortName ?? "?").slice(0, 2)}</span>}
            <span className="wc-tab-flag-sep">v</span>
            {liveFixture.awayTeam.crest
              ? <img src={liveFixture.awayTeam.crest} className="wc-tab-flag" alt={liveFixture.awayTeam.shortName ?? ""} />
              : <span className="wc-tab-flag wc-tab-flag--ph">{(liveFixture.awayTeam.shortName ?? "?").slice(0, 2)}</span>}
          </div>
        ) : (
          <img src="/worldcup-trophy.png" className="wc-tab-img" alt="" />
        )}
        {live.length > 0 && <span className="wc-tab-live-dot" />}
        {showHint && (
          <div className="wc-tab-hint" aria-hidden>
            Tap for fixtures
            <span className="wc-tab-hint-arrow" />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="wc-float-card wc-float-card--right"
        style={{ top: cardY ?? 60 }}
        role="dialog"
        aria-label="World Cup matches"
      >
        {/* Drag handle */}
        <div
          className={`wc-float-drag-handle${cardDragging ? " wc-float-drag-handle--active" : ""}`}
          onPointerDown={onCardHandleDown}
          onPointerMove={onCardHandleMove}
          onPointerUp={onCardHandleUp}
          onPointerCancel={onCardHandleUp}
          aria-hidden
        />
        <div className="wc-float-head">
          <button type="button" className="wc-float-title" onClick={() => { setOpen(false); navigate("/world-cup"); }}>
            <img src="/worldcup-trophy.png" className="wc-float-head-trophy" alt="" />
            <div className="wc-float-title-stack">
              <span className="wc-float-title-text">
                {wcCampaign?.name || "World Cup"}
                {followed ? ` · ${followed}` : ""}
              </span>
              <span className="wc-float-title-hint">
                Tap to open full schedule
                <i className="wc-float-title-hint-arrow" aria-hidden>→</i>
              </span>
            </div>
          </button>
          <button type="button" className="wc-float-icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>

        <div className="wc-float-body">
          {live.length > 0 && (
            <div className="wc-float-live">
              {live.map((f) => (
                <button key={f.id} type="button" className="wc-float-row wc-float-row--live" onClick={() => openMatch(f)}>
                  <div className="wc-fr-teams">
                    {f.homeTeam.crest && <img src={f.homeTeam.crest} className="wc-fr-flag" alt="" />}
                    <span className="wc-fr-name">{f.homeTeam.shortName}</span>
                    <span className="wc-fr-vs">v</span>
                    <span className="wc-fr-name">{f.awayTeam.shortName}</span>
                    {f.awayTeam.crest && <img src={f.awayTeam.crest} className="wc-fr-flag" alt="" />}
                  </div>
                  <div className="wc-fr-time-block">
                    <span className="wc-float-live-badge">{liveBadgeLabel(f)}</span>
                    <span className="wc-fr-score">{f.score?.home ?? 0}–{f.score?.away ?? 0}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {nextDays.map((g) => (
            <div className="wc-float-day" key={g.key}>
              <p className="wc-float-day-label">{g.label}</p>
              {g.fixtures.map((f) => (
                <button key={f.id} type="button" className="wc-float-row" onClick={() => openMatch(f)}>
                  <div className="wc-fr-teams">
                    {f.homeTeam.crest && <img src={f.homeTeam.crest} className="wc-fr-flag" alt="" />}
                    <span className="wc-fr-name">{f.homeTeam.shortName}</span>
                    <span className="wc-fr-vs">v</span>
                    <span className="wc-fr-name">{f.awayTeam.shortName}</span>
                    {f.awayTeam.crest && <img src={f.awayTeam.crest} className="wc-fr-flag" alt="" />}
                  </div>
                  <div className="wc-fr-time-block">
                    <span className="wc-fr-time">{formatTime(f.kickoff)}</span>
                    <span className="wc-fr-cd">{countdownToKickoff(f.kickoff)}</span>
                  </div>
                  {canVoteOnFixture(f) && <span className="wc-float-vote">Vote</span>}
                </button>
              ))}
            </div>
          ))}
          {recent.length > 0 && (
            <div className="wc-float-day">
              <p className="wc-float-day-label wc-float-day-label--results">Results</p>
              {recent.map((f) => (
                <button key={f.id} type="button" className="wc-float-row wc-float-row--result" onClick={() => openMatch(f)}>
                  <div className="wc-fr-home">
                    {f.homeTeam.crest && <img src={f.homeTeam.crest} className="wc-fr-flag" alt="" />}
                    <span className={`wc-fr-name${f.score?.winner === "HOME_TEAM" ? " wc-fr-name--win" : " wc-fr-name--loss"}`}>
                      {f.homeTeam.shortName}
                    </span>
                  </div>
                  <div className="wc-fr-score-block">
                    <span className="wc-fr-score">{f.score?.home ?? "–"} – {f.score?.away ?? "–"}</span>
                    <span className="wc-fr-ft">FT</span>
                  </div>
                  <div className="wc-fr-away">
                    <span className={`wc-fr-name${f.score?.winner === "AWAY_TEAM" ? " wc-fr-name--win" : " wc-fr-name--loss"}`}>
                      {f.awayTeam.shortName}
                    </span>
                    {f.awayTeam.crest && <img src={f.awayTeam.crest} className="wc-fr-flag" alt="" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
