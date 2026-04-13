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
    ) {
      accessToken
      refreshToken
      user {
        id
        email
        displayName
      }
    }
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
      }
    }
  }
`;
