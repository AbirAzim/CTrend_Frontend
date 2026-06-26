import { gql } from "@apollo/client";

export const INVITATION_SIGNUP_INFO = gql`
  query InvitationSignupInfo($token: String!) {
    invitationSignupInfo(token: $token) {
      email
      referralCode
      role
    }
  }
`;

export const REDEEM_REFERRAL_CODE = gql`
  mutation RedeemReferralCode($code: String!) {
    redeemReferralCode(code: $code) {
      inviteeCoins
      inviterCoins
      balance
    }
  }
`;

/** Paginated referral-point history (INVITE + REFERRAL_INVITEE). */
export const REFERRAL_POINTS_HISTORY = gql`
  query ReferralPointsHistory($userId: ID, $skip: Int, $take: Int) {
    referralPointsHistory(userId: $userId, skip: $skip, take: $take) {
      id
      type
      amount
      createdAt
      relatedUserId
      relatedUserName
    }
  }
`;
