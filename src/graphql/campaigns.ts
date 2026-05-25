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
      ctaUrl
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

export const CAMPAIGNS_ADMIN = gql`
  query CampaignsAdmin {
    campaigns {
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
    }
  }
`;
