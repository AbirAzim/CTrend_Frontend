import { gql } from "@apollo/client";

export const GLOBAL_SEARCH = gql`
  query GlobalSearch($query: String!, $limit: Int) {
    globalSearch(query: $query, limit: $limit) {
      users {
        isFriend
        user {
          id
          username
          displayName
          profileImageUrl
        }
      }
      posts {
        id
        caption
        imageUrls
        options {
          label
          imageUrl
        }
      }
    }
  }
`;
