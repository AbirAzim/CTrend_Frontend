import { gql } from "@apollo/client";

export const COMMENT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export const COMMENTS_BY_POST = gql`
  query CommentsByPost($postId: ID!) {
    commentsByPost(postId: $postId) {
      id
      content
      createdAt
      editedAt
      postId
      parentId
      replyToName
      replyToUserId
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
      replyToName
      replyToUserId
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

export const EDIT_COMMENT = gql`
  mutation EditComment($commentId: ID!, $content: String!) {
    editComment(commentId: $commentId, content: $content) {
      id
      content
      editedAt
    }
  }
`;

/** Returns the ids removed (the comment + its replies if it was top-level). */
export const DELETE_COMMENT = gql`
  mutation DeleteComment($commentId: ID!) {
    deleteComment(commentId: $commentId)
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
