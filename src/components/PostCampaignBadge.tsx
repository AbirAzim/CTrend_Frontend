import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { Link } from "react-router-dom";
import type { FeedPostCampaignView } from "../types/feed";
import { CAMPAIGN_BADGE_ICON } from "@ctrend/shared/lib/campaignUi";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";

type Props = {
  campaign: FeedPostCampaignView;
};
type CampaignListItem = {
  id: string;
  name: string;
  slug: string;
  isDefault?: boolean | null;
};

/** Campaign ribbon on compare posts linked to a promotion. */
export function PostCampaignBadge({ campaign }: Props) {
  const [openList, setOpenList] = useState(false);
  const { data } = useQuery<{ activeCampaigns: CampaignListItem[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-first",
  });
  const campaigns = useMemo(() => {
    const items = data?.activeCampaigns ?? [];
    return [...items].sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [data?.activeCampaigns]);

  return (
    <div className="cx-post-campaign-wrap">
      <Link
        to={`/campaign/${campaign.slug}`}
        className="cx-post-campaign-ribbon"
        aria-label={`Campaign: ${campaign.name}`}
      >
        <span aria-hidden style={{ fontSize: "0.78rem" }}>{CAMPAIGN_BADGE_ICON}</span>
        <span className="cx-post-campaign-ribbon-kicker">Campaign</span>
        <span className="cx-post-campaign-ribbon-name">{campaign.name}</span>
        {campaign.prizePerWinner > 0 ? (
          <span className="cx-post-campaign-ribbon-prize">
            · {campaign.prizePerWinner} BDT
          </span>
        ) : null}
        <span aria-hidden className="cx-post-campaign-ribbon-chevron">›</span>
      </Link>
      {campaigns.length > 1 ? (
        <div className="cx-post-campaign-links">
          <button
            type="button"
            className="cx-post-campaign-other-btn"
            onClick={() => setOpenList((prev) => !prev)}
            aria-expanded={openList}
          >
            See other campaigns
          </button>
          {openList ? (
            <div className="cx-post-campaign-other-list" role="list">
              {campaigns.map((item) => (
                <Link
                  key={item.id}
                  to={`/?campaign=${item.id}`}
                  className="cx-post-campaign-other-item"
                  onClick={() => setOpenList(false)}
                >
                  <span>{item.name}</span>
                  {item.isDefault ? <span className="cx-post-campaign-default-pill">default</span> : null}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
