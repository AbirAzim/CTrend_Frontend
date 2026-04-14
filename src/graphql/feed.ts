import { gql } from "@apollo/client";

/** Real feed + voting — implement on backend per `backend_req.md` (Feed & votes). */
export const FEED_POSTS = gql`
  query FeedPosts {
    feedPosts {
      id
      authorUsername
      authorDisplayName
      imageUrls
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
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
      imageUrls
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
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
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
    }
  }
`;
