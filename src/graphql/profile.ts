import { gql } from "@apollo/client";
import { POST_OPTION_FIELDS, POST_CAMPAIGN_WINNER_FIELDS } from "./feed";

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

/** Feed-shaped — same field selection as `FEED_POSTS`, for rendering with `FeedPostCard`. */
export const MY_VOTED_POSTS = gql`
  query MyVotedPosts($anonymousOnly: Boolean) {
    myVotedPosts(anonymousOnly: $anonymousOnly) {
      id
      type
      format
      compareLayout
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      authorProfileImageUrl
      isUserGlobalBroadcast
      imageUrls
      caption
      createdAt
      scheduledAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      endingSoonLeadMinutes
      isVotingOpen
      isPrizeClaimed
      votePrizeClaimedAt
      canClaimPrize
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
      mySelectedOptionIndex
      myVoteAnonymous
      optionStats {
        index
        label
        count
        percentage
      }
      ${POST_OPTION_FIELDS}
      category {
        id
        name
        slug
        color
      }
      ${POST_CAMPAIGN_WINNER_FIELDS}
    }
  }
`;

/** Feed-shaped — same field selection as `FEED_POSTS`, for rendering with `FeedPostCard`. */
export const USER_POSTS = gql`
  query UserPosts($userId: ID!) {
    getPostsByUser(userId: $userId) {
      id
      type
      format
      compareLayout
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      authorProfileImageUrl
      isUserGlobalBroadcast
      imageUrls
      caption
      createdAt
      scheduledAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      endingSoonLeadMinutes
      isVotingOpen
      isPrizeClaimed
      votePrizeClaimedAt
      canClaimPrize
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
      mySelectedOptionIndex
      myVoteAnonymous
      optionStats {
        index
        label
        count
        percentage
      }
      ${POST_OPTION_FIELDS}
      category {
        id
        name
        slug
        color
      }
      ${POST_CAMPAIGN_WINNER_FIELDS}
    }
  }
`;
