import { gql } from "@apollo/client";

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($skip: Int, $take: Int) {
    myNotifications(skip: $skip, take: $take) {
      items {
        id
        type
        title
        body
        referenceId
        referenceType
        postId
        actorCount
        latestActorId
        latestActorName
        read
        createdAt
      }
      totalCount
      unreadCount
    }
  }
`;

export const UNREAD_NOTIFICATION_COUNT = gql`
  query UnreadNotificationCount {
    unreadNotificationCount
  }
`;

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export const SEND_ADMIN_BROADCAST = gql`
  mutation SendAdminBroadcast($title: String!, $body: String!) {
    sendAdminBroadcast(title: $title, body: $body)
  }
`;

export const REGISTER_PUSH_TOKEN = gql`
  mutation RegisterPushToken($token: String!, $platform: String) {
    registerPushToken(token: $token, platform: $platform)
  }
`;

export const NEW_NOTIFICATION_SUB = gql`
  subscription NewNotification {
    newNotification {
      id
      type
      title
      body
      referenceId
      referenceType
      read
      createdAt
    }
  }
`;
