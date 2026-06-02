import { gql } from "@apollo/client";

/** Campaign link summary attached to a compare post (Phase 22). */
export const POST_CAMPAIGN_FIELDS = `
  campaign {
    id
    name
    slug
    bannerText
    bannerImageUrl
    prizePerWinner
  }
`;

/** Random prize-draw winner drawn after voting closes (Phase 24). */
export const POST_VOTE_WINNER_FIELDS = `
  voteWinner {
    selectedOptionIndex
    pickedAt
    user {
      id
      username
      displayName
      profileImageUrl
    }
  }
`;

/** Real feed + voting — implement on backend per `backend_req.md` (Feed & votes). */
export const FEED_POSTS = gql`
  query FeedPosts($campaignId: ID) {
    feedPosts(campaignId: $campaignId) {
      id
      type
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      imageUrls
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
      endingSoonLeadMinutes
      commentCount
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
      }
      ${POST_CAMPAIGN_FIELDS}
      ${POST_VOTE_WINNER_FIELDS}
    }
  }
`;

/** Single post for `/post/:id` — same selection shape as `feedPosts` items. */
export const GET_POST_BY_ID = gql`
  query GetPostById($id: ID!) {
    getPostById(id: $id) {
      id
      type
      authorId
      authorUsername
      authorDisplayName

      authorEmail
      imageUrls
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
      endingSoonLeadMinutes
      commentCount
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
      }
      ${POST_CAMPAIGN_FIELDS}
      ${POST_VOTE_WINNER_FIELDS}
    }
  }
`;

/** CTrend API: `votePost(postId, selectedOptionIndex)` — not `voteOnPost` / `VoteDirection`. */
export const VOTE_POST = gql`
  mutation VotePost(
    $postId: ID!
    $selectedOptionIndex: Int!
    $anonymous: Boolean
  ) {
    votePost(
      postId: $postId
      selectedOptionIndex: $selectedOptionIndex
      anonymous: $anonymous
    ) {
      postId
      totalVotes
      countsPerOption
      percentages
    }
  }
`;

export const SET_POST_KEEP = gql`
  mutation SetPostKeep($postId: ID!, $keep: Boolean!) {
    setPostKeep(postId: $postId, keep: $keep)
  }
`;

export const SET_POST_LIKE = gql`
  mutation SetPostLike($postId: ID!, $active: Boolean!) {
    setPostLike(postId: $postId, active: $active)
  }
`;

export const SET_POST_HYPE = gql`
  mutation SetPostHype($postId: ID!, $active: Boolean!) {
    setPostHype(postId: $postId, active: $active)
  }
`;

export const MY_SAVED_POSTS = gql`
  query MySavedPosts {
    mySavedPosts {
      id
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      imageUrls
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
      endingSoonLeadMinutes
      commentCount
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
      }
    }
  }
`;

export const VOTERS_BY_POST = gql`
  query VotersByPost($postId: ID!, $optionIndex: Int, $search: String, $skip: Int, $take: Int) {
    votersByPost(postId: $postId, optionIndex: $optionIndex, search: $search, skip: $skip, take: $take) {
      voteId
      selectedOptionIndex
      anonymous
      createdAt
      user {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

export const REMOVE_VOTE = gql`
  mutation RemoveVote($postId: ID!) {
    removeVote(postId: $postId) {
      postId
      totalVotes
      countsPerOption
      percentages
    }
  }
`;

/** Match backend `CreatePostInput` — `imageUrls` optional on API; send 1 or 2+ URLs from create UI. */
export const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
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

export const MY_SCHEDULED_POSTS = gql`
  query MyScheduledPosts {
    myScheduledPosts {
      id
      contentText
      imageUrls
      options {
        label
        imageUrl
      }
      category {
        id
        name
      }
      status
      scheduledAt
      createdAt
    }
  }
`;

export const CANCEL_SCHEDULED_POST = gql`
  mutation CancelScheduledPost($postId: ID!) {
    cancelScheduledPost(postId: $postId)
  }
`;

/** Categories for create-post dropdown (uses backend ObjectId as `id`). */
export const CATEGORIES = gql`
  query Categories {
    categories: getAllCategories {
      id
      name
    }
  }
`;

export const EXTEND_POST_VOTING = gql`
  mutation ExtendVoting($postId: ID!, $newVotingEndsAt: DateTime!) {
    extendPostVoting(postId: $postId, newVotingEndsAt: $newVotingEndsAt) {
      id
      votingEndsAt
      isVotingOpen
    }
  }
`;

export const POST_VOTE_UPDATED = gql`
  subscription PostVoteUpdated($postId: ID!) {
    postVoteUpdated(postId: $postId) {
      id
      upvoteCount
      downvoteCount
      viewerVote
      mySelectedOptionIndex
      votingEndsAt
      isVotingOpen
      optionStats {
        index
        label
        count
        percentage
      }
    }
  }
`;

export const DELETE_POST = gql`
  mutation DeletePost($postId: ID!) {
    deletePost(postId: $postId)
  }
`;

/** Winner claims their post vote prize (friend/system posts) — Phase 26. */
export const CLAIM_POST_VOTE_PRIZE = gql`
  mutation ClaimPostVotePrize($postId: ID!) {
    claimPostVotePrize(postId: $postId) {
      id
      isPrizeClaimed
      votePrizeClaimedAt
      canClaimPrize
    }
  }
`;

export const NEW_POSTS = gql`
  subscription NewPosts {
    newPosts {
      postId
    }
  }
`;

export const POST_DELETED_SUB = gql`
  subscription PostDeleted {
    postDeleted {
      postId
    }
  }
`;

export const UPDATE_POST = gql`
  mutation UpdatePost($postId: ID!, $input: UpdatePostInput!) {
    updatePost(postId: $postId, input: $input) {
      id
      caption
      imageUrls
      options { label imageUrl }
      category { id name }
    }
  }
`;
