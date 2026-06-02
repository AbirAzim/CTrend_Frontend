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
      role
      voteSoundId
      notificationSoundId
      messageSoundId
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
      voteSoundId
      notificationSoundId
      messageSoundId
    }
  }
`;

/** Thumbnail grid — includes `category` for schema completeness. */
export const MY_VOTED_POSTS = gql`
  query MyVotedPosts($anonymousOnly: Boolean) {
    myVotedPosts(anonymousOnly: $anonymousOnly) {
      id
      authorId
      authorProfileImageUrl
      imageUrls
      caption
      createdAt
      totalVotes
      upvoteCount
      downvoteCount
      commentCount
      likeCount
      hypeCount
      saveCount
      viewerHasSaved
      votingEndsAt
      isVotingOpen
      options {
        label
      }
      category {
        id
        name
        slug
      }
    }
  }
`;

export const USER_POSTS = gql`
  query UserPosts($userId: ID!) {
    getPostsByUser(userId: $userId) {
      id
      authorId
      authorProfileImageUrl
      imageUrls
      caption
      createdAt
      totalVotes
      upvoteCount
      downvoteCount
      commentCount
      likeCount
      hypeCount
      saveCount
      viewerHasSaved
      votingEndsAt
      isVotingOpen
      options {
        label
      }
      category {
        id
        name
        slug
      }
      campaign {
        id
        name
        slug
      }
    }
  }
`;
