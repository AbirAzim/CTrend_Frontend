import { gql } from "@apollo/client";

export const COMMENTS_BY_POST = gql`
  query CommentsByPost($postId: ID!) {
    commentsByPost(postId: $postId) {
      id
      content
      createdAt
      postId
      parentId
      author {
        id
        username
        displayName
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
