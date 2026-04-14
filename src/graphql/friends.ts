import { gql } from "@apollo/client";

export const ADD_FRIEND = gql`
  mutation AddFriend($userId: ID!) {
    addFriend(userId: $userId)
  }
`;

export const MY_FRIENDS = gql`
  query MyFriends {
    myFriends {
      id
      username
      displayName
      profileImageUrl
    }
  }
`;

export const FRIEND_SUGGESTIONS = gql`
  query FriendSuggestions($limit: Int) {
    friendSuggestions(limit: $limit) {
      id
      username
      displayName
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
