import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";
import {
  type WcFixture,
  countdownToKickoff,
  formatTime,
  groupByDay,
  involvesTeam,
  liveFixtures,
  liveMinute,
  nextUpcoming,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";

const POS_KEY = "ctrend_wc_float_pos";
const BUBBLE = 54;
const MOVE_THRESHOLD = 6;

type Pos = { x: number; y: number };
type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Allow the bubble to sit half-off any edge (corner tuck). */
function clampTuck(p: Pos): Pos {
  const { w, h } = viewport();
  const half = BUBBLE / 2;
  return {
    x: Math.max(-half, Math.min(p.x, w - half)),
    y: Math.max(-half, Math.min(p.y, h - half)),
  };
}

/** Pull the bubble fully on-screen (used when opening the card). */
function clampVisible(p: Pos): Pos {
  const { w, h } = viewport();
  return {
    x: Math.max(8, Math.min(p.x, w - BUBBLE - 8)),
    y: Math.max(64, Math.min(p.y, h - BUBBLE - 12)),
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return clampTuck(JSON.parse(raw) as Pos);
  } catch {
    /* ignore */
  }
  const { w, h } = viewport();
  return { x: w - BUBBLE - 16, y: h - BUBBLE - 96 };
}

/**
 * App-wide draggable World Cup bubble (like a chat head). Drag it anywhere —
 * park it half-off any edge to tuck it away, tap to open the live/upcoming card.
 */
export function WorldCupFloating() {
  const navigate = useNavigate();
  const followed = useFollowedTeam();

  const [pos, setPos] = useState<Pos>(loadPos);
  const [expanded, setExpanded] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [, setTick] = useState(0);
  const drag = useRef<{ sx: number; sy: number; bx: number; by: number; moved: boolean } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => setPos((p) => clampTuck(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered);
  const nextDays = groupByDay(nextUpcoming(filtered, 3));

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y, moved: false };
    setGrabbing(true);
    navigator.vibrate?.(12);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) d.moved = true;
    if (d.moved) setPos(clampTuck({ x: d.bx + dx, y: d.by + dy }));
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    setGrabbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d) return;
    if (d.moved) {
      setPos((p) => {
        const c = clampTuck(p);
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(c));
        } catch {
          /* ignore */
        }
        return c;
      });
    } else {
      // Tap → toggle the card; pull the bubble on-screen first when opening.
      if (!expanded) setPos((p) => clampVisible(p));
      setExpanded((v) => !v);
    }
  }

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0) return null;

  const centerX = pos.x + BUBBLE / 2;
  const centerY = pos.y + BUBBLE / 2;
  const { w, h } = viewport();
  const sideRight = centerX > w / 2;
  const sideBottom = centerY > h / 2;
  const cardClass = `wc-float-card${sideRight ? " wc-float-card--right" : " wc-float-card--left"}${
    sideBottom ? " wc-float-card--bottom" : " wc-float-card--top"
  }`;

  function openMatch(f: WcFixture) {
    setExpanded(false);
    navigate(f.campaignPostId ? `/post/${f.campaignPostId}` : "/world-cup");
  }

  return (
    <>
      {expanded && <div className="wc-float-backdrop" onClick={() => setExpanded(false)} />}

      {expanded && (
        <div className={cardClass} role="dialog" aria-label="World Cup matches">
          <div className="wc-float-head">
            <button type="button" className="wc-float-title" onClick={() => { setExpanded(false); navigate("/world-cup"); }}>
              <span className="wc-float-trophy">🏆</span>
              <span className="wc-float-title-text">
                {wcCampaign?.name || "World Cup"}
                {followed ? ` · ${followed}` : ""}
              </span>
            </button>
            <button type="button" className="wc-float-icon-btn" aria-label="Close" onClick={() => setExpanded(false)}>
              ✕
            </button>
          </div>

          <div className="wc-float-body">
            {live.length > 0 && (
              <div className="wc-float-live">
                {live.map((f) => (
                  <button key={f.id} type="button" className="wc-float-row wc-float-row--live" onClick={() => openMatch(f)}>
                    <span className="wc-float-live-badge">LIVE {liveMinute(f.kickoff)}&apos;</span>
                    <span className="wc-float-teams">
                      {f.homeTeam.shortName} {f.score.home ?? 0}–{f.score.away ?? 0} {f.awayTeam.shortName}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {nextDays.map((g) => (
              <div className="wc-float-day" key={g.key}>
                <p className="wc-float-day-label">{g.label}</p>
                {g.fixtures.map((f) => (
                  <button key={f.id} type="button" className="wc-float-row" onClick={() => openMatch(f)}>
                    <span className="wc-float-teams">
                      {f.homeTeam.shortName} <span className="wc-float-v">v</span> {f.awayTeam.shortName}
                    </span>
                    <span className="wc-float-time">
                      {formatTime(f.kickoff)}
                      <span className="wc-float-countdown">{countdownToKickoff(f.kickoff)}</span>
                    </span>
                    {f.campaignPostId && <span className="wc-float-vote">Vote</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className={`wc-bubble${live.length > 0 ? " wc-bubble--live" : ""}${grabbing ? " wc-bubble--grabbing" : ""}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="World Cup matches — drag to move, tap to open"
      >
        ⚽
        {live.length > 0 && <span className="wc-bubble-live-dot" />}
      </button>
    </>
  );
}
