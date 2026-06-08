import { gql } from "@apollo/client";
import { MY_NOTIFICATIONS } from "./notifications";

export const ADD_FRIEND = gql`
  mutation AddFriend($userId: ID!) {
    addFriend(userId: $userId)
  }
`;

export const CANCEL_FRIEND_REQUEST = gql`
  mutation CancelFriendRequest($userId: ID!) {
    cancelFriendRequest(userId: $userId)
  }
`;

export const MY_FRIENDS = gql`
  query MyFriends {
    myFriends {
      id
      username
      displayName
      email
      profileImageUrl
    }
  }
`;

export const FRIEND_SUGGESTIONS = gql`
  query FriendSuggestions($limit: Int, $search: String) {
    friendSuggestions(limit: $limit, search: $search) {
      id
      username
      displayName
      email
      profileImageUrl
    }
  }
`;

export const FRIEND_REQUESTS = gql`
  query FriendRequests {
    friendRequests {
      requestedByMe {
        id
        username
        displayName
        profileImageUrl
      }
      requestedMe {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

export const RESPOND_FRIEND_REQUEST = gql`
  mutation RespondFriendRequest($requesterId: ID!, $accept: Boolean!) {
    respondFriendRequest(requesterId: $requesterId, accept: $accept)
  }
`;

export const UNFRIEND = gql`
  mutation Unfriend($userId: ID!) {
    unfriend(userId: $userId)
  }
`;

export const FRIENDSHIP_STATUS = gql`
  query FriendshipStatus($userId: ID!) {
    friendshipStatus(userId: $userId)
  }
`;

/** Another user's mutual-friend list — shown on their profile. */
export const USER_FRIENDS = gql`
  query UserFriends($userId: ID!) {
    userFriends(userId: $userId) {
      id
      username
      displayName
      email
      profileImageUrl
    }
  }
`;

/** Count of non-anonymous votes a user has cast — shown on their profile. */
export const USER_VOTE_COUNT = gql`
  query UserVoteCount($userId: ID!) {
    userVoteCount(userId: $userId)
  }
`;

export const GET_USER_PROFILE = gql`
  query GetUserProfile($userId: ID!) {
    getUserProfile(userId: $userId) {
      id
      username
      displayName
      email
      bio
      profileImageUrl
      interests
    }
  }
`;

/** Refetch friend lists + bell after accept/decline/cancel. */
export const FRIEND_SOCIAL_REFETCH_QUERIES = [
  { query: FRIEND_REQUESTS },
  { query: MY_FRIENDS },
  { query: MY_NOTIFICATIONS, variables: { skip: 0, take: 30 } },
] as const;
