import { gql } from "@apollo/client";

export const ACTIVE_CAMPAIGNS = gql`
  query ActiveCampaigns {
    activeCampaigns {
      id
      name
      slug
      bannerText
      bannerImageUrl
      ctaLabel
      prizePerWinner
      fixturesEnabled
    }
  }
`;

export const CAMPAIGN_BY_SLUG = gql`
  query CampaignBySlug($slug: String!) {
    campaign(slug: $slug) {
      id
      name
      slug
      description
      bannerText
      bannerImageUrl
      ctaLabel
      ctaUrl
      isActive
      prizePerWinner
      rules
      rulesBn
      fixturesEnabled
      startDate
      endDate
    }
  }
`;
