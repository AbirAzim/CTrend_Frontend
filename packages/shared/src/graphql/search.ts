import { gql } from "@apollo/client";

/** @mention autocomplete data source — lightweight user search (no isFriend/posts). */
export const SEARCH_USERS = gql`
  query SearchUsers($search: String!, $skip: Int, $take: Int) {
    searchUsers(search: $search, skip: $skip, take: $take) {
      id
      username
      displayName
      profileImageUrl
    }
  }
`;

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
