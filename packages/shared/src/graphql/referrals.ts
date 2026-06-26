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
