import { gql } from "@apollo/client";

/** Real feed + voting — implement on backend per `backend_req.md` (Feed & votes). */
export const FEED_POSTS = gql`
  query FeedPosts {
    feedPosts {
      id
      authorUsername
      authorDisplayName
      imageUrl
      caption
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
    }
  }
`;

export const VOTE_ON_POST = gql`
  mutation VoteOnPost($postId: ID!, $direction: VoteDirection!) {
    voteOnPost(postId: $postId, direction: $direction) {
      id
      upvoteCount
      downvoteCount
      viewerVote
    }
  }
`;
