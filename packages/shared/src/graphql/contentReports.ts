import { gql } from "@apollo/client";

export const REPORT_CONTENT = gql`
  mutation ReportContent($input: ReportContentInput!) {
    reportContent(input: $input)
  }
`;

export const ADMIN_REPORTED_POSTS = gql`
  query AdminReportedPosts(
    $query: AdminReportedPostsQueryInput
    $skip: Int
    $take: Int
  ) {
    adminReportedPosts(query: $query, skip: $skip, take: $take) {
      id
      type
      caption
      imageUrls
      createdAt
      updatedAt
      reportCount
      votingEndsAt
      isVotingOpen
      totalVotes
      authorId
      authorUsername
      authorDisplayName
      authorProfileImageUrl
      category {
        id
        name
      }
      options {
        label
        imageUrl
      }
    }
  }
`;

export const ADMIN_REPORTED_POSTS_COUNT = gql`
  query AdminReportedPostsCount($filter: AdminReportedPostsFilterInput) {
    adminReportedPostsCount(filter: $filter)
  }
`;

export const ADMIN_CONTENT_REPORTS = gql`
  query AdminContentReports($postId: ID!, $skip: Int, $take: Int) {
    adminContentReports(postId: $postId, skip: $skip, take: $take) {
      id
      targetType
      targetId
      reasonId
      details
      reporterId
      reporterUsername
      reporterDisplayName
      contextUrl
      createdAt
    }
  }
`;

export const ADMIN_CONTENT_REPORTS_COUNT = gql`
  query AdminContentReportsCount($postId: ID!) {
    adminContentReportsCount(postId: $postId)
  }
`;
