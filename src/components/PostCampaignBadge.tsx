import { Link } from "react-router-dom";
import type { FeedPostCampaignView } from "../types/feed";

type Props = {
  campaign: FeedPostCampaignView;
};

/** Campaign ribbon on compare posts linked to a promotion. */
export function PostCampaignBadge({ campaign }: Props) {
  return (
    <Link
      to={`/campaign/${campaign.slug}`}
      className="cx-post-campaign-ribbon"
      aria-label={`Campaign: ${campaign.name}`}
    >
      {campaign.bannerImageUrl ? (
        <span
          className="cx-post-campaign-ribbon-bg"
          style={{ backgroundImage: `url(${campaign.bannerImageUrl})` }}
          aria-hidden
        />
      ) : null}
      <span className="cx-post-campaign-ribbon-inner">
        <span className="cx-post-campaign-ribbon-kicker">Campaign</span>
        <span className="cx-post-campaign-ribbon-name">{campaign.name}</span>
        {campaign.prizePerWinner > 0 ? (
          <span className="cx-post-campaign-ribbon-prize">
            🎁 {campaign.prizePerWinner} BDT prize draw
          </span>
        ) : null}
      </span>
    </Link>
  );
}
