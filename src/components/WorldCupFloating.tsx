import { useEffect, useState } from "react";
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

type Campaign = { id: string; name: string; slug: string; fixturesEnabled?: boolean };

/**
 * Fixed World Cup trophy tab pinned to the right edge (half-peeking). Tap to
 * slide out the live/upcoming card; the tab hides while the card is open.
 */
export function WorldCupFloating() {
  const navigate = useNavigate();
  const followed = useFollowedTeam();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
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

  if (!wcCampaign) return null;
  if (live.length === 0 && nextDays.length === 0) return null;

  function openMatch(f: WcFixture) {
    setOpen(false);
    // With a vote post → open it. Otherwise jump to the schedule page and focus
    // this exact match (so the click always lands somewhere visible).
    navigate(f.campaignPostId ? `/post/${f.campaignPostId}` : `/world-cup?focus=${f.id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={`wc-tab${live.length > 0 ? " wc-tab--live" : ""}`}
        aria-label="Open World Cup matches"
        onClick={() => setOpen(true)}
      >
        <img src="/worldcup-trophy.png" className="wc-tab-img" alt="" />
        {live.length > 0 && <span className="wc-tab-live-dot" />}
      </button>
    );
  }

  return (
    <>
      <div className="wc-float-card wc-float-card--right wc-float-card--bottom" role="dialog" aria-label="World Cup matches">
        <div className="wc-float-head">
          <button type="button" className="wc-float-title" onClick={() => { setOpen(false); navigate("/world-cup"); }}>
            <img src="/worldcup-trophy.png" className="wc-float-head-trophy" alt="" />
            <span className="wc-float-title-text">
              {wcCampaign?.name || "World Cup"}
              {followed ? ` · ${followed}` : ""}
            </span>
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
                  <span className="wc-float-live-badge">LIVE {liveMinute(f.kickoff)}&apos;</span>
                  <span className="wc-float-teams">
                    {f.homeTeam.shortName ?? "TBD"} {f.score?.home ?? 0}–{f.score?.away ?? 0} {f.awayTeam.shortName ?? "TBD"}
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
                    {f.homeTeam.shortName ?? "TBD"} <span className="wc-float-v">v</span> {f.awayTeam.shortName ?? "TBD"}
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
    </>
  );
}
