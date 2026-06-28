import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { WORLD_CUP_FIXTURES } from "../graphql/worldcup";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";
import {
  type WcFixture,
  liveFixtures,
  nextUpcoming,
  finishedFixtures,
  liveBadgeLabel,
  formatTime,
  involvesTeam,
} from "../lib/worldCupFixtures";
import { useFollowedTeam } from "../lib/wcTeam";

const DISMISSED_KEY = "ctrend_wc_banner_dismissed";

type Campaign = { id: string; name: string; fixturesEnabled?: boolean };

export function WorldCupBanner() {
  const navigate = useNavigate();
  const followed = useFollowedTeam();
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(DISMISSED_KEY); } catch { return false; }
  });

  const { data: campData } = useQuery<{ activeCampaigns: Campaign[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network", errorPolicy: "all",
  });
  const wcCampaign = (campData?.activeCampaigns ?? []).find((c) => c.fixturesEnabled);

  const { data } = useQuery<{ worldCupFixtures: WcFixture[] }>(WORLD_CUP_FIXTURES, {
    fetchPolicy: "cache-and-network", errorPolicy: "all",
    pollInterval: 30_000, skip: !wcCampaign,
  });

  const fixtures = data?.worldCupFixtures ?? [];
  const filtered = fixtures.filter((f) => involvesTeam(f, followed));
  const live = liveFixtures(filtered.length ? filtered : fixtures);
  const next = nextUpcoming(filtered.length ? filtered : fixtures, 1)[0] ?? null;
  const recent = finishedFixtures(filtered.length ? filtered : fixtures).slice(0, 1)[0] ?? null;

  // Re-show banner when a match goes live (even if previously dismissed)
  useEffect(() => {
    if (live.length > 0 && dismissed) {
      try { localStorage.removeItem(DISMISSED_KEY); } catch { /* ignore */ }
      setDismissed(false);
    }
  }, [live.length, dismissed]);

  if (!wcCampaign || dismissed) return null;
  if (fixtures.length === 0) return null;

  const liveMatch = live[0] ?? null;
  const feature = liveMatch ?? next ?? recent;
  if (!feature) return null;

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation();
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  function handleClick() {
    if (liveMatch) {
      navigate("/world-cup/results");
    } else {
      navigate("/world-cup");
    }
  }

  const isLive = live.length > 0;
  const isResult = !liveMatch && !next && !!recent;

  return (
    <div className={`wcb${isLive ? " wcb--live" : ""}`} onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}>
      {/* Left: badge + teams */}
      <div className="wcb-left">
        <div className="wcb-trophy">
          <img src="/worldcup-trophy.png" alt="" className="wcb-trophy-img" />
        </div>
        <div className="wcb-info">
          <span className="wcb-label">
            {isLive
              ? <><span className="wcb-dot" />{liveBadgeLabel(liveMatch!)}</>
              : isResult
              ? "Recent Result"
              : "Next Match"}
          </span>
          <div className="wcb-match">
            {feature.homeTeam.crest && <img src={feature.homeTeam.crest} alt="" className="wcb-flag" />}
            <span className="wcb-team">{feature.homeTeam.shortName}</span>
            {isLive || isResult
              ? <span className="wcb-score">{feature.score?.home ?? 0}–{feature.score?.away ?? 0}</span>
              : <span className="wcb-vs">vs</span>}
            <span className="wcb-team">{feature.awayTeam.shortName}</span>
            {feature.awayTeam.crest && <img src={feature.awayTeam.crest} alt="" className="wcb-flag" />}
          </div>
          {!isLive && !isResult && next && (
            <span className="wcb-time">{formatTime(next.kickoff)}</span>
          )}
        </div>
      </div>

      {/* Right: CTA + dismiss */}
      <div className="wcb-right">
        <span className="wcb-cta">
          {isLive ? "Watch Live →" : isResult ? "See Result →" : "View →"}
        </span>
        <button type="button" className="wcb-close" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
