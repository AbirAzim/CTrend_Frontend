import { gql } from "@apollo/client";

export const COMMENTS_BY_POST = gql`
  query CommentsByPost($postId: ID!) {
    commentsByPost(postId: $postId) {
      id
      content
      createdAt
      likeCount
      viewerHasLiked
      postId
      parentId
      viewerReaction
      reactions {
        emoji
        count
      }
      author {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

/** Variables: `{ postId, input: { content } }`; for replies add `input.parentId`. */
export const COMMENT_POST = gql`
  mutation CommentPost($postId: ID!, $input: CommentPostInput!) {
    commentPost(postId: $postId, input: $input) {
      id
      content
      postId
      parentId
      createdAt
    }
  }
`;

export const SET_COMMENT_LIKE = gql`
  mutation SetCommentLike($commentId: ID!, $liked: Boolean!) {
    setCommentLike(commentId: $commentId, liked: $liked) {
      id
      likeCount
      viewerHasLiked
    }
  }
`;

export const SET_COMMENT_REACTION = gql`
  mutation SetCommentReaction($commentId: ID!, $emoji: String) {
    setCommentReaction(commentId: $commentId, emoji: $emoji) {
      id
      viewerReaction
      reactions { emoji count }
    }
  }
`;
