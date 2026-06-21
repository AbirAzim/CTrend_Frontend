import { gql } from "@apollo/client";

export const ACTIVE_CAMPAIGNS = gql`
  query ActiveCampaigns {
    activeCampaigns {
      id
      name
      slug
      isDefault
      bannerText
      bannerImageUrl
      ctaLabel
      ctaUrl
      prizePerWinner
      fixturesEnabled
    }
  }
`;

/** Campaigns a normal user may attach to a post (active + user-enabled). */
export const PUBLIC_CAMPAIGNS = gql`
  query PublicCampaigns {
    publicCampaigns {
      id
      name
      slug
      isActive
      isDefault
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

export const CAMPAIGNS_ADMIN = gql`
  query CampaignsAdmin {
    campaigns {
      id
      name
      slug
      isDefault
      description
      bannerText
      bannerImageUrl
      ctaLabel
      ctaUrl
      isActive
      isPublic
      prizePerWinner
      startDate
      endDate
      createdAt
    }
  }
`;

export const CREATE_CAMPAIGN = gql`
  mutation CreateCampaign($input: CreateCampaignInput!) {
    createCampaign(input: $input) {
      id
      name
      slug
      isActive
      isPublic
    }
  }
`;

export const TOGGLE_CAMPAIGN = gql`
  mutation ToggleCampaign($id: ID!, $isActive: Boolean!) {
    toggleCampaign(id: $id, isActive: $isActive) {
      id
      isActive
    }
  }
`;

export const UPDATE_CAMPAIGN = gql`
  mutation UpdateCampaign($id: ID!, $input: UpdateCampaignInput!) {
    updateCampaign(id: $id, input: $input) {
      id
      name
      bannerText
      ctaLabel
      ctaUrl
      isActive
      isDefault
      isPublic
    }
  }
`;
