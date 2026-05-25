import { gql } from "@apollo/client";

export const INVITE_USER = gql`
  mutation InviteUser($email: String!) {
    inviteUser(email: $email)
  }
`;

export const INVITE_ADMIN = gql`
  mutation InviteAdmin($email: String!) {
    inviteAdmin(email: $email)
  }
`;

export const PROMOTE_TO_ADMIN = gql`
  mutation PromoteToAdmin($email: String!) {
    promoteToAdmin(email: $email) {
      id
      email
      username
      displayName
      role
    }
  }
`;

export const LIST_USERS = gql`
  query ListUsers($skip: Int, $take: Int) {
    listUsers(skip: $skip, take: $take) {
      id
      email
      username
      displayName
      role
      profileImageUrl
    }
  }
`;

export const REMOVE_USER = gql`
  mutation RemoveUser($email: String!) {
    removeUser(email: $email)
  }
`;

export const REMOVE_ADMIN = gql`
  mutation RemoveAdmin($email: String!) {
    removeAdmin(email: $email) {
      id
      email
      username
      displayName
      role
    }
  }
`;

export const PREVIEW_INVITES = gql`
  query PreviewInvites($emails: [String!]!) {
    previewInvites(emails: $emails) {
      email
      hasPendingInvite
      existingUser {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

export const INVITE_USERS_BULK = gql`
  mutation InviteUsers($emails: [String!]!) {
    inviteUsers(emails: $emails) {
      email
      status
      message
    }
  }
`;

export const CREATE_SYSTEM_POST = gql`
  mutation CreateSystemPost($input: CreatePostInput!) {
    createSystemPost(input: $input) {
      id
      imageUrls
      caption
      authorUsername
      authorDisplayName
      authorEmail
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
    }
  }
`;
