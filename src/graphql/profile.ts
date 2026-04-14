import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      displayName
      username
      bio
      interests
      profileImageUrl
    }
  }
`;

export const UPDATE_PROFILE = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      email
      displayName
      username
      bio
      interests
      profileImageUrl
    }
  }
`;

/** Thumbnail grid — includes `category` for schema completeness. */
export const USER_POSTS = gql`
  query UserPosts($userId: ID!) {
    getPostsByUser(userId: $userId) {
      id
      imageUrls
      caption
      createdAt
      totalVotes
      category {
        id
        name
        slug
      }
    }
  }
`;
