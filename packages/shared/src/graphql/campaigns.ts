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
    }
  }
`;
