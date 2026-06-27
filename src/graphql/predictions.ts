import { gql } from "@apollo/client";

const PREDICTION_FIELDS = `
  id
  homeScore
  awayScore
  createdAt
  isWinner
  user {
    id
    username
    displayName
    profileImageUrl
  }
`;

/** Viewer-scoped prediction state for one match post. */
export const MATCH_PREDICTION_STATE = gql`
  query MatchPredictionState($postId: ID!) {
    matchPredictionState(postId: $postId) {
      count
      predictionsOpen
      predictionsResolved
      fixtureStage
      predictionsPendingResult
      wentToExtraTime
      wentToPenalties
      myPrediction {
        ${PREDICTION_FIELDS}
      }
    }
  }
`;

/** All predictions for a match post (visible to everyone). */
export const MATCH_PREDICTIONS = gql`
  query MatchPredictions($postId: ID!, $skip: Int, $take: Int) {
    matchPredictions(postId: $postId, skip: $skip, take: $take) {
      ${PREDICTION_FIELDS}
    }
  }
`;

/** Users whose exact score matched the final result (after the match). */
export const MATCH_PREDICTION_WINNERS = gql`
  query MatchPredictionWinners($postId: ID!) {
    matchPredictionWinners(postId: $postId) {
      ${PREDICTION_FIELDS}
    }
  }
`;

export const SUBMIT_MATCH_PREDICTION = gql`
  mutation SubmitMatchPrediction($postId: ID!, $homeScore: Int!, $awayScore: Int!) {
    submitMatchPrediction(postId: $postId, homeScore: $homeScore, awayScore: $awayScore) {
      ${PREDICTION_FIELDS}
    }
  }
`;

export const DELETE_MATCH_PREDICTION = gql`
  mutation DeleteMatchPrediction($postId: ID!) {
    deleteMatchPrediction(postId: $postId)
  }
`;

/** Fires whenever any prediction on the post changes (live list updates). */
export const MATCH_PREDICTION_UPDATED = gql`
  subscription MatchPredictionUpdated($postId: ID!) {
    matchPredictionUpdated(postId: $postId) {
      postId
    }
  }
`;
