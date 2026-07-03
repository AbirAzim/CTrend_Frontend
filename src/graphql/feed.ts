import { gql } from "@apollo/client";

/** Per-compare-column image framing (object-position). */
export const POST_OPTION_FIELDS = `
  options {
    label
    imageUrl
    imageFocalX
    imageFocalY
  }
`;

/** Campaign link + post-vote prize draw winner (shared across feed queries). */
export const POST_CAMPAIGN_WINNER_FIELDS = `
  campaign {
    id
    name
    slug
    isDefault
    bannerText
    bannerImageUrl
    prizePerWinner
    hasWinner
    hasRewards
  }
  campaignWinner {
    id
    winningOption
    note
    prize
    createdAt
    user {
      id
      username
      displayName
      profileImageUrl
    }
  }
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
  matchType
  matchScore {
    home
    away
    status
    minute
    phase
    fullTime { home away }
    extraTime { home away }
    penalty { home away }
    wentToExtraTime
    wentToPenalties
  }
  fixtureWinnerAt
  fixtureId
  lineupAvailable
  fixtureStage
  hasDrawOption
  pinned
`;

/** Real feed + voting — implement on backend per `backend_req.md` (Feed & votes). */
export const FEED_POSTS = gql`
  query FeedPosts($campaignId: ID, $postFilter: FeedPostFilter, $skip: Int, $take: Int) {
    feedPosts(campaignId: $campaignId, postFilter: $postFilter, skip: $skip, take: $take) {
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

/** Single post for `/post/:id` — same selection shape as `feedPosts` items. */
export const GET_POST_BY_ID = gql`
  query GetPostById($id: ID!) {
    getPostById(id: $id) {
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
  query MySavedPosts($skip: Int, $take: Int) {
    mySavedPosts(skip: $skip, take: $take) {
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

export const UPDATE_POST = gql`
  mutation UpdatePost($postId: ID!, $input: UpdatePostInput!) {
    updatePost(postId: $postId, input: $input) {
      id
      imageUrls
      caption
      isUserGlobalBroadcast
      status
      scheduledAt
      ${POST_OPTION_FIELDS}
      category {
        id
        name
        slug
        color
      }
      isVotingOpen
      votingEndsAt
      endingSoonLeadMinutes
      ${POST_CAMPAIGN_WINNER_FIELDS}
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

/** Users who hyped a post — Instagram-style "hyped by" list. */
export const HYPERS_BY_POST = gql`
  query HypersByPost($postId: ID!, $search: String, $skip: Int, $take: Int) {
    hypersByPost(postId: $postId, search: $search, skip: $skip, take: $take) {
      id
      username
      displayName
      profileImageUrl
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
  query MyScheduledPosts($skip: Int, $take: Int) {
    myScheduledPosts(skip: $skip, take: $take) {
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
      contentText
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
      status
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
      slug
      color
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
      myVoteAnonymous
      votingEndsAt
      isVotingOpen
      matchScore {
        status
        home
        away
        minute
        phase
        fullTime { home away }
        extraTime { home away }
        penalty { home away }
        wentToExtraTime
        wentToPenalties
      }
      optionStats {
        index
        label
        count
        percentage
      }
    }
  }
`;

/**
 * Live post edits — emitted whenever an author/admin edits a post. Returns the
 * full post shape so Apollo merges it into the normalized cache by id, updating
 * the feed and the detail view in real time (new options, caption, end date,
 * category, post type, and reset vote stats).
 */
export const POST_UPDATED = gql`
  subscription PostUpdated($postId: ID!) {
    postUpdated(postId: $postId) {
      id
      type
      format
      compareLayout
      isUserGlobalBroadcast
      imageUrls
      caption
      scheduledAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      endingSoonLeadMinutes
      isVotingOpen
      mySelectedOptionIndex
      myVoteAnonymous
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
      optionStats {
        index
        label
        count
        percentage
      }
      category {
        id
        name
        slug
        color
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

export const DELETE_POST = gql`
  mutation DeletePost($postId: ID!) {
    deletePost(postId: $postId)
  }
`;

/** Admin-only: pin a post to the top of the All + Community feeds. */
export const PIN_POST = gql`
  mutation PinPost($postId: ID!) {
    pinPost(postId: $postId) {
      id
      pinned
    }
  }
`;

/** Admin-only: remove a post's pin. */
export const UNPIN_POST = gql`
  mutation UnpinPost($postId: ID!) {
    unpinPost(postId: $postId) {
      id
      pinned
    }
  }
`;

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
