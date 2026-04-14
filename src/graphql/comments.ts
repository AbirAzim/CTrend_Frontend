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

export const COMMENT_POST = gql`
  mutation CommentPost($input: CommentPostInput!) {
    commentPost(input: $input) {
      id
      content
      createdAt
      postId
      author {
        id
        username
        displayName
      }
    }
  }
`;
