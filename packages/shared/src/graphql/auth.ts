import { gql } from "@apollo/client";

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      refreshToken
      user {
        id
        email
        displayName
        username
        profileImageUrl
        role
      }
    }
  }
`;

export const SIGNUP = gql`
  mutation Signup(
    $email: String!
    $password: String!
    $displayName: String
  ) {
    signup(
      email: $email
      password: $password
      displayName: $displayName
    )
  }
`;

export const GOOGLE_LOGIN = gql`
  mutation GoogleLogin($idToken: String!) {
    googleLogin(idToken: $idToken) {
      accessToken
      refreshToken
      user {
        id
        email
        displayName
        username
        profileImageUrl
        role
      }
    }
  }
`;

export const VERIFY_EMAIL = gql`
  mutation VerifyEmail($email: String!, $code: String!, $referralCode: String) {
    verifyEmail(email: $email, code: $code, referralCode: $referralCode) {
      accessToken
      refreshToken
      user {
        id
        email
        displayName
        username
        profileImageUrl
        role
      }
    }
  }
`;

export const ACCEPT_INVITATION = gql`
  mutation AcceptInvitation($token: String!, $password: String!, $displayName: String) {
    acceptInvitation(token: $token, password: $password, displayName: $displayName) {
      accessToken
      user {
        id
        email
        username
        displayName
        profileImageUrl
        role
      }
    }
  }
`;

export const SWITCH_ACTIVE_ROLE = gql`
  mutation SwitchActiveRole($role: UserRole!) {
    switchActiveRole(role: $role) {
      accessToken
      user {
        id
        role
      }
    }
  }
`;

export const RESEND_VERIFICATION_EMAIL = gql`
  mutation ResendVerificationEmail($email: String!) {
    resendVerificationEmail(email: $email)
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

export const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword)
  }
`;
