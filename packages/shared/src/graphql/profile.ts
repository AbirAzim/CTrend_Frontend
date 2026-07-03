import { gql } from "@apollo/client";
import { POST_CAMPAIGN_FIELDS, POST_VOTE_WINNER_FIELDS } from "./feed";

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
    }
  }
`;

/** Feed-shaped — same field selection as `FEED_POSTS`, for rendering with `FeedPostCard`. */
export const MY_VOTED_POSTS = gql`
  query MyVotedPosts($anonymousOnly: Boolean) {
    myVotedPosts(anonymousOnly: $anonymousOnly) {
      id
      type
      category {
        id
        name
        slug
        color
      }
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      authorProfileImageUrl
      isUserGlobalBroadcast
      format
      compareLayout
      imageUrls
      caption
      createdAt
      status
      scheduledAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
      endingSoonLeadMinutes
      commentCount
      recentComments {
        id
        content
        createdAt
        likeCount
        author {
          id
          username
          displayName
          profileImageUrl
        }
      }
      likeCount
      hypeCount
      saveCount
      viewerHasSaved
      viewerHasHyped
      myVoteAnonymous
      mySelectedOptionIndex
      optionStats {
        index
        label
        count
        percentage
      }
      options {
        label
        imageUrl
        imageFocalX
        imageFocalY
      }
      ${POST_CAMPAIGN_FIELDS}
      ${POST_VOTE_WINNER_FIELDS}
    }
  }
`;

/** Feed-shaped — same field selection as `FEED_POSTS`, for rendering with `FeedPostCard`. */
export const USER_POSTS = gql`
  query UserPosts($userId: ID!) {
    getPostsByUser(userId: $userId) {
      id
      type
      category {
        id
        name
        slug
        color
      }
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      authorProfileImageUrl
      isUserGlobalBroadcast
      format
      compareLayout
      imageUrls
      caption
      createdAt
      status
      scheduledAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
      endingSoonLeadMinutes
      commentCount
      recentComments {
        id
        content
        createdAt
        likeCount
        author {
          id
          username
          displayName
          profileImageUrl
        }
      }
      likeCount
      hypeCount
      saveCount
      viewerHasSaved
      viewerHasHyped
      myVoteAnonymous
      mySelectedOptionIndex
      optionStats {
        index
        label
        count
        percentage
      }
      options {
        label
        imageUrl
        imageFocalX
        imageFocalY
      }
      ${POST_CAMPAIGN_FIELDS}
      ${POST_VOTE_WINNER_FIELDS}
    }
  }
`;
