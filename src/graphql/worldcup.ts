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
      autoScheduled
      hasDrawOption
      matchEndedAt
      winnerScheduledAt
    }
  }
`;

export const WORLD_CUP_FIXTURE_DETAILS = gql`
  query WorldCupFixtureDetails($id: ID!) {
    worldCupFixture(id: $id) {
      id
      externalId
      homeTeam { name shortName crest }
      awayTeam { name shortName crest }
      kickoff
      status
      rawStatus
      minute
      stage
      group
      score { home away winner }
      fullTime { home away }
      extraTime { home away }
      penalty { home away }
      wentToExtraTime
      wentToPenalties
      venue { name city }
      campaignPostId
      hasDrawOption
      matchEndedAt
      events {
        time
        timeExtra
        team
        type
        detail
        player { id name }
        assist { id name }
      }
      lineups {
        team
        formation
        startXI { id name number pos grid photo }
        substitutes { id name number pos grid photo }
        coach { id name photo }
      }
      stats {
        type
        home
        away
      }
      playerRatings {
        playerId
        name
        team
        rating
        photo
      }
      playerMatchStats {
        playerId name team photo number position minutes rating captain substitute
        goals assists shotsTotal shotsOn keyPasses passesTotal passAccuracy
        dribblesAttempts dribblesSuccess foulsDrawn foulsCommitted
        tacklesTotal interceptions duelsTotal duelsWon offsides yellow red
        penaltyScored penaltyMissed saves
      }
      detailsSyncedAt
    }
  }
`;

export const SYNC_FIXTURE_DETAILS = gql`
  mutation SyncFixtureDetails($fixtureId: ID!) {
    syncFixtureDetails(fixtureId: $fixtureId) {
      events
      stats
      lineups
      error
    }
  }
`;

export const SYNC_WORLD_CUP_FIXTURES = gql`
  mutation SyncWorldCupFixtures {
    syncWorldCupFixtures
  }
`;

export const SYNC_ALL_FINISHED_FIXTURES = gql`
  mutation SyncAllFinishedFixtures {
    syncAllFinishedFixtures
  }
`;

export const SYNC_LIVE_NOW = gql`
  mutation SyncLiveNow {
    syncLiveNow
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

export const WORLD_CUP_TOP_STATS = gql`
  query WorldCupTopStats {
    worldCupTopScorers {
      playerId
      name
      team
      teamCrest
      goals
      matchesPlayed
    }
    worldCupTopAssistants {
      playerId
      name
      team
      teamCrest
      assists
      matchesPlayed
    }
  }
`;
