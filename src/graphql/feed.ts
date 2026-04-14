import { gql } from "@apollo/client";

/** Real feed + voting — implement on backend per `backend_req.md` (Feed & votes). */
export const FEED_POSTS = gql`
  query FeedPosts {
    feedPosts {
      id
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

/** Single post for `/post/:id` — same selection shape as `feedPosts` items. */
export const GET_POST_BY_ID = gql`
  query GetPostById($id: ID!) {
    getPostById(id: $id) {
      id
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

/** CTrend API: `votePost(postId, selectedOptionIndex)` — not `voteOnPost` / `VoteDirection`. */
export const VOTE_POST = gql`
  mutation VotePost($postId: ID!, $selectedOptionIndex: Int!) {
    votePost(postId: $postId, selectedOptionIndex: $selectedOptionIndex) {
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
