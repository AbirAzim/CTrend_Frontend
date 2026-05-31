import { gql } from "@apollo/client";

export const COMMENT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export const COMMENTS_BY_POST = gql`
  query CommentsByPost($postId: ID!) {
    commentsByPost(postId: $postId) {
      id
      content
      createdAt
      postId
      parentId
      reactions {
        emoji
        count
      }
      viewerReaction
      author {
        id
        username
        displayName
        profileImageUrl
        email
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
      reactions {
        emoji
        count
      }
      viewerReaction
      author {
        id
        username
        displayName
        profileImageUrl
        email
      }
    }
  }
`;

export const SET_COMMENT_REACTION = gql`
  mutation SetCommentReaction($commentId: ID!, $emoji: String) {
    setCommentReaction(commentId: $commentId, emoji: $emoji) {
      id
      reactions {
        emoji
        count
      }
      viewerReaction
    }
  }
`;

/** @deprecated use SET_COMMENT_REACTION */
export const SET_COMMENT_LIKE = gql`
  mutation SetCommentLike($commentId: ID!, $liked: Boolean!) {
    setCommentLike(commentId: $commentId, liked: $liked) {
      id
      likeCount
      viewerHasLiked
    }
  }
`;
