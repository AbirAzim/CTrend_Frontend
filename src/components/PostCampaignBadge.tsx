import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@apollo/client";
import { Link, useNavigate } from "react-router-dom";
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

/** Campaign tag on feed posts — collapsed chip (mobile parity), expands to full ribbon. */
export function PostCampaignBadge({ campaign }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
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

  function applyFilter(id: string) {
    setListOpen(false);
    navigate(`/?campaign=${id}`);
  }

  return (
    <div className={`cx-post-campaign-wrap${expanded ? "" : " cx-post-campaign-wrap--collapsed"}`}>
      {!expanded ? (
        <button
          type="button"
          className="cx-post-campaign-chip"
          onClick={() => setExpanded(true)}
          aria-label={`Campaign: ${campaign.name}. Tap to expand.`}
        >
          <span aria-hidden className="cx-post-campaign-chip-icon">{CAMPAIGN_BADGE_ICON}</span>
          <span className="cx-post-campaign-chip-kicker">CAMPAIGN</span>
          <span aria-hidden className="cx-post-campaign-chip-chevron">▾</span>
        </button>
      ) : (
        <>
          <div className="cx-post-campaign-ribbon">
            <Link
              to={`/campaign/${campaign.slug}`}
              className="cx-post-campaign-ribbon-main"
              aria-label={`Open campaign: ${campaign.name}`}
            >
              <span aria-hidden className="cx-post-campaign-chip-icon">{CAMPAIGN_BADGE_ICON}</span>
              <span className="cx-post-campaign-ribbon-kicker">CAMPAIGN</span>
              <span className="cx-post-campaign-ribbon-name">{campaign.name}</span>
              {campaign.prizePerWinner > 0 ? (
                <span className="cx-post-campaign-ribbon-prize">
                  · {campaign.prizePerWinner} BDT
                </span>
              ) : null}
              <span aria-hidden className="cx-post-campaign-ribbon-chevron">›</span>
            </Link>
            <button
              type="button"
              className="cx-post-campaign-collapse"
              onClick={() => setExpanded(false)}
              aria-label="Collapse campaign ribbon"
            >
              ▴
            </button>
          </div>
          {campaigns.length > 1 ? (
            <button
              type="button"
              className="cx-post-campaign-other-btn"
              onClick={() => setListOpen(true)}
            >
              See other campaigns
            </button>
          ) : null}
        </>
      )}

      {listOpen
        ? createPortal(
            <div
              className="cx-post-campaign-modal-overlay"
              role="presentation"
              onClick={() => setListOpen(false)}
            >
              <div
                className="cx-post-campaign-modal-sheet"
                role="dialog"
                aria-label="Browse campaigns"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="cx-post-campaign-modal-handle" aria-hidden />
                <h3 className="cx-post-campaign-modal-title">Browse campaigns</h3>
                <div className="cx-post-campaign-modal-list">
                  {campaigns.map((item) => {
                    const current = item.id === campaign.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`cx-post-campaign-modal-row${current ? " cx-post-campaign-modal-row--current" : ""}`}
                        onClick={() => applyFilter(item.id)}
                      >
                        <span className="cx-post-campaign-modal-row-name">{item.name}</span>
                        {item.isDefault ? (
                          <span className="cx-post-campaign-default-pill">default</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
