import { gql } from "@apollo/client";

export const WORLD_CUP_FIXTURES = gql`
  query WorldCupFixtures($filter: FixtureFilterInput) {
    worldCupFixtures(filter: $filter) {
      id
      externalId
      homeTeam {
        name
        shortName
        crest
      }
      awayTeam {
        name
        shortName
        crest
      }
      kickoff
      status
      minute
      stage
      group
      matchday
      score {
        home
        away
        winner
      }
      campaignPostId
    }
  }
`;

export const SYNC_WORLD_CUP_FIXTURES = gql`
  mutation SyncWorldCupFixtures {
    syncWorldCupFixtures
  }
`;

export const CREATE_WORLD_CUP_CAMPAIGN_POST = gql`
  mutation CreateWorldCupCampaignPost($fixtureId: ID!) {
    createWorldCupCampaignPost(fixtureId: $fixtureId) {
      id
      contentText
      status
      scheduledAt
      votingEndsAt
    }
  }
`;

export const PROCESS_MATCH_RESULT = gql`
  mutation ProcessMatchResult($fixtureId: ID!) {
    processMatchResult(fixtureId: $fixtureId) {
      id
      fixtureId
      prize
      winningOption
      paid
      note
      user {
        id
        username
        displayName
      }
    }
  }
`;

export const CAMPAIGN_WINNERS = gql`
  query CampaignWinners {
    campaignWinners {
      id
      fixtureId
      postId
      prize
      winningOption
      paid
      note
      createdAt
      user {
        id
        username
        displayName
        email
      }
    }
  }
`;

export const MARK_CAMPAIGN_PRIZE_PAID = gql`
  mutation MarkCampaignPrizePaid($winnerId: ID!) {
    markCampaignPrizePaid(winnerId: $winnerId) {
      id
      paid
    }
  }
`;
