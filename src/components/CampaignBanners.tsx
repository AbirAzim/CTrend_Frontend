import { useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";

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
        <button
          type="button"
          className="cb-cta"
          onClick={(e) => { e.stopPropagation(); go(); }}
        >
          {campaign.ctaLabel}
        </button>
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
