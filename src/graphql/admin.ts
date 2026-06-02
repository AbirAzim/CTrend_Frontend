import { gql } from "@apollo/client";

// ── Categories (admin-only mutations) ─────────────────────────
export const CREATE_CATEGORY = gql`
  mutation CreateCategory($name: String!) {
    createCategory(name: $name) {
      id
      name
      slug
    }
  }
`;

export const UPDATE_CATEGORY = gql`
  mutation UpdateCategory($id: ID!, $name: String!) {
    updateCategory(id: $id, name: $name) {
      id
      name
      slug
    }
  }
`;

export const DELETE_CATEGORY = gql`
  mutation DeleteCategory($id: ID!) {
    deleteCategory(id: $id)
  }
`;

export const CATEGORY_POST_COUNT = gql`
  query CategoryPostCount($categoryId: ID!) {
    categoryPostCount(categoryId: $categoryId)
  }
`;

export const INVITE_USER = gql`
  mutation InviteUser($email: String!) {
    inviteUser(email: $email)
  }
`;

export const INVITE_ADMIN = gql`
  mutation InviteAdmin($email: String!) {
    inviteAdmin(email: $email)
  }
`;

export const REJECT_ADMIN_PROMOTION = gql`
  mutation RejectAdminPromotion($token: String!) {
    rejectAdminPromotion(token: $token)
  }
`;

export const PROMOTE_TO_ADMIN = gql`
  mutation PromoteToAdmin($email: String!) {
    promoteToAdmin(email: $email) {
      id
      email
      username
      displayName
      role
    }
  }
`;

export const LIST_USERS = gql`
  query ListUsers(
    $skip: Int
    $take: Int
    $role: String
    $search: String
    $searchBy: String
    $status: String
    $sortBy: String
    $sortOrder: String
  ) {
    listUsers(
      skip: $skip
      take: $take
      role: $role
      search: $search
      searchBy: $searchBy
      status: $status
      sortBy: $sortBy
      sortOrder: $sortOrder
    ) {
      id
      email
      username
      displayName
      role
      roles
      profileImageUrl
      emailVerified
      createdAt
    }
  }
`;

export const LIST_USERS_COUNT = gql`
  query ListUsersCount(
    $role: String
    $search: String
    $searchBy: String
    $status: String
  ) {
    listUsersCount(
      role: $role
      search: $search
      searchBy: $searchBy
      status: $status
    )
  }
`;

export const REMOVE_USER = gql`
  mutation RemoveUser($email: String!) {
    removeUser(email: $email)
  }
`;

export const REMOVE_ADMIN = gql`
  mutation RemoveAdmin($email: String!) {
    removeAdmin(email: $email) {
      id
      email
      username
      displayName
      role
    }
  }
`;

export const LIST_INVITATIONS = gql`
  query ListInvitations($status: InvitationStatus) {
    listInvitations(status: $status) {
      id
      email
      role
      status
      expiresAt
      createdAt
      invitedBy {
        id
        displayName
        username
        email
        role
        profileImageUrl
      }
    }
  }
`;

export const CANCEL_INVITATION = gql`
  mutation CancelInvitation($id: ID!) {
    cancelInvitation(id: $id)
  }
`;

export const RESEND_INVITATION = gql`
  mutation ResendInvitation($id: ID!) {
    resendInvitation(id: $id)
  }
`;

export const PREVIEW_INVITES = gql`
  query PreviewInvites($emails: [String!]!) {
    previewInvites(emails: $emails) {
      email
      hasPendingInvite
      existingUser {
        id
        username
        displayName
        profileImageUrl
      }
    }
  }
`;

export const INVITE_USERS_BULK = gql`
  mutation InviteUsers($emails: [String!]!) {
    inviteUsers(emails: $emails) {
      email
      status
      message
    }
  }
`;

export const ADMIN_PLATFORM_POSTS = gql`
  query AdminPlatformPosts(
    $query: AdminPlatformPostsQueryInput
    $skip: Int
    $take: Int
  ) {
    adminPlatformPosts(query: $query, skip: $skip, take: $take) {
      id
      type
      caption
      imageUrls
      createdAt
      updatedAt
      status
      scheduledAt
      votingEndsAt
      endingSoonLeadMinutes
      isVotingOpen
      isPrizeClaimed
      votePrizeClaimedAt
      canClaimPrize
      commentCount
      hypeCount
      saveCount
      totalVotes
      upvoteCount
      downvoteCount
      authorId
      authorUsername
      authorDisplayName
      authorEmail
      authorProfileImageUrl
      author {
        id
        username
        displayName
        email
        profileImageUrl
      }
      category {
        id
        name
        slug
      }
      campaign {
        id
        name
        slug
      }
      options {
        label
        imageUrl
      }
      optionStats {
        index
        label
        count
        percentage
      }
      voteWinner {
        selectedOptionIndex
        pickedAt
        user {
          id
          username
          displayName
          profileImageUrl
        }
      }
      editedBy {
        id
        displayName
        username
        email
        profileImageUrl
      }
      lastEditedBy {
        id
        displayName
        username
        email
        profileImageUrl
      }
    }
  }
`;

export const ADMIN_PLATFORM_POSTS_COUNT = gql`
  query AdminPlatformPostsCount($filter: AdminPlatformPostsFilterInput) {
    adminPlatformPostsCount(filter: $filter)
  }
`;

export const CREATE_SYSTEM_POST = gql`
  mutation CreateSystemPost($input: CreatePostInput!) {
    createSystemPost(input: $input) {
      id
      type
      imageUrls
      caption
      authorUsername
      authorDisplayName
      authorEmail
      createdAt
      upvoteCount
      downvoteCount
      viewerVote
      votingEndsAt
      isVotingOpen
    }
  }
`;

export const ADMIN_MODERATOR_THREADS = gql`
  query AdminModeratorThreads($skip: Int, $take: Int, $search: String) {
    adminModeratorThreads(skip: $skip, take: $take, search: $search) {
      conversationId
      recipientUserId
      recipientName
      recipientEmail
      recipientProfileImageUrl
      lastMessageText
      lastMessageAt
      messageCount
      unreadFromUserCount
    }
  }
`;

export const ADMIN_MODERATOR_MESSAGES = gql`
  query AdminModeratorMessages($skip: Int, $take: Int, $search: String) {
    adminModeratorMessages(skip: $skip, take: $take, search: $search) {
      id
      conversationId
      text
      imageUrl
      createdAt
      recipientUserId
      recipientName
      recipientEmail
      sentByAdminId
      sentByAdminName
      sentByAdminEmail
    }
  }
`;

export const ADMIN_MODERATOR_MESSAGES_COUNT = gql`
  query AdminModeratorMessagesCount($search: String) {
    adminModeratorMessagesCount(search: $search)
  }
`;

export const ADMIN_MODERATOR_THREAD_MESSAGES = gql`
  query AdminModeratorThreadMessages($userId: ID!) {
    adminModeratorThreadMessages(userId: $userId) {
      id
      conversationId
      senderId
      senderName
      senderAvatar
      sentByAdminId
      sentByAdminName
      sentByAdminEmail
      text
      imageUrl
      createdAt
    }
  }
`;

export const SEND_MODERATOR_MESSAGES = gql`
  mutation SendModeratorMessages($userIds: [ID!]!, $text: String!, $imageUrl: String) {
    sendModeratorMessages(userIds: $userIds, text: $text, imageUrl: $imageUrl) {
      id
      conversationId
      text
      imageUrl
      createdAt
      recipientUserId
      recipientName
      recipientEmail
      sentByAdminId
      sentByAdminName
      sentByAdminEmail
    }
  }
`;

export const MARK_MODERATOR_THREAD_READ = gql`
  mutation MarkModeratorThreadReadForAdmin($userId: ID!) {
    markModeratorThreadReadForAdmin(userId: $userId)
  }
`;

export const ADMIN_MODERATOR_USER_MESSAGE = gql`
  subscription AdminModeratorUserMessage {
    adminModeratorUserMessage {
      conversationId
      recipientUserId
      unreadFromUserCount
      lastMessageText
      lastMessageAt
      message {
        id
        conversationId
        senderId
        senderName
        senderAvatar
        sentByAdminId
        sentByAdminName
        sentByAdminEmail
        text
        imageUrl
        createdAt
      }
    }
  }
`;
