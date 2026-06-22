import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { ACTIVE_CAMPAIGNS, CAMPAIGN_WIN_LEADERBOARD } from "../graphql/campaigns";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";

type Campaign = {
  id: string;
  name: string;
  slug: string;
  bannerText: string;
  bannerImageUrl: string | null;
  ctaLabel: string;
  ctaUrl: string;
  prizePerWinner: number;
};

type LeaderRow = {
  rank: number;
  wins: number;
  user: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

/** Top-3 winners shown as a circular avatar cluster on the campaign banner. */
function BannerLeaders({ campaignId }: { campaignId: string }) {
  const { data } = useQuery<{ campaignWinLeaderboard: LeaderRow[] }>(
    CAMPAIGN_WIN_LEADERBOARD,
    { variables: { campaignId, take: 3 }, fetchPolicy: "cache-and-network" },
  );
  const rows = (data?.campaignWinLeaderboard ?? []).slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <div className="cb-leaders" aria-label="Top campaign winners">
      <span className="cb-leaders-label">🏆 Top winners</span>
      <div className="cb-leaders-avatars">
        {rows.map((row) => {
          const u = row.user;
          const name = u?.displayName?.trim() || u?.username || "User";
          const img = normalizeProfileImageUrl(u?.profileImageUrl ?? null);
          return (
            <span
              key={u?.id ?? row.rank}
              className={`cb-leader cb-leader--${row.rank}`}
              title={`#${row.rank} ${name} — ${row.wins} win${row.wins === 1 ? "" : "s"}`}
            >
              {img ? (
                <img src={img} alt="" />
              ) : (
                <span className="cb-leader-fallback">{name.charAt(0).toUpperCase()}</span>
              )}
              <span className="cb-leader-rank">{row.rank}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const navigate = useNavigate();
  const isWorldCup = campaign.slug?.includes("world-cup") || campaign.slug?.includes("worldcup");

  function go() {
    navigate(`/campaign/${campaign.slug}`);
  }

  return (
    <div
      className={`cb-card${isWorldCup ? " cb-card--wc" : ""}`}
      onClick={go}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && go()}
    >
      <div
        className="cb-card-inner"
        style={
          campaign.bannerImageUrl
            ? { backgroundImage: `url(${campaign.bannerImageUrl})` }
            : undefined
        }
      >
        <div className="cb-card-overlay" />
      </div>
      <div className="cb-card-body">
        <div className="cb-card-top">
          <span className="cb-badge">Campaign</span>
          <span className="cb-prize">🎁 Win {campaign.prizePerWinner} BDT</span>
        </div>
        <p className="cb-name">{campaign.name}</p>
        <p className="cb-text">{campaign.bannerText}</p>
        <div className="cb-card-actions">
          <button
            type="button"
            className="cb-cta"
            onClick={(e) => { e.stopPropagation(); go(); }}
          >
            {campaign.ctaLabel}
          </button>
          <BannerLeaders campaignId={campaign.id} />
        </div>
      </div>
      {isWorldCup && (
        <img
          src="/worldcup-players.png"
          className="cb-players-img"
          alt=""
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function CampaignBanners() {
  const { data } = useQuery<{ activeCampaigns: Campaign[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network",
  });

  const campaigns = data?.activeCampaigns ?? [];
  if (!campaigns.length) return null;

  return (
    <div className="cb-strip">
      <div className="cb-strip-head">
        <p className="cb-strip-title">Explore campaigns</p>
      </div>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </div>
  );
}
