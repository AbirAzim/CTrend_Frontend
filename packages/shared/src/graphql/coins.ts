import { gql } from "@apollo/client";

/** Viewer's lifetime coin balance. */
export const MY_COINS = gql`
  query MyCoins {
    myCoins
  }
`;

/** Referral / invite points earned (INVITE + joined-via-code rewards). */
export const REFERRAL_POINTS = gql`
  query ReferralPoints($userId: ID!) {
    referralPoints(userId: $userId)
  }
`;

/** Public coin history for any user (defaults to the viewer when omitted). */
export const COIN_HISTORY = gql`
  query CoinHistory($userId: ID, $skip: Int, $take: Int) {
    coinHistory(userId: $userId, skip: $skip, take: $take) {
      id
      type
      amount
      createdAt
    }
  }
`;

/** All-time leaderboard — top coin earners. */
export const COIN_LEADERBOARD = gql`
  query CoinLeaderboard($take: Int) {
    coinLeaderboard(take: $take) {
      rank
      coins
      user {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

/** Leaderboard position for a user (null if no coins earned). */
export const COIN_LEADERBOARD_RANK = gql`
  query CoinLeaderboardRank($userId: ID) {
    coinLeaderboardRank(userId: $userId)
  }
`;

/** Claim the once-a-day login streak bonus. */
export const CLAIM_DAILY_COINS = gql`
  mutation ClaimDailyCoins {
    claimDailyCoins {
      awarded
      balance
      streakDays
    }
  }
`;
