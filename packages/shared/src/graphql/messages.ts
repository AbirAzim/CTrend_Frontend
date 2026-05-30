import { gql } from "@apollo/client";

export const MY_CONVERSATIONS = gql`
  query MyConversations {
    myConversations {
      id
      type
      name
      participantIds
      participants {
        id
        displayName
        avatarUrl
        online
      }
      lastMessageText
      lastMessageAt
      unreadCount
      createdAt
    }
  }
`;

export const GET_MESSAGES = gql`
  query GetMessages($conversationId: ID!, $skip: Int, $take: Int) {
    messages(conversationId: $conversationId, skip: $skip, take: $take) {
      id
      conversationId
      senderId
      senderName
      senderAvatar
      text
      imageUrl
      readBy {
        userId
        readAt
      }
      createdAt
    }
  }
`;

export const ONLINE_USER_IDS = gql`
  query OnlineUserIds {
    onlineUserIds
  }
`;

export const START_DIRECT_CONVERSATION = gql`
  mutation StartDirectConversation($userId: ID!) {
    startDirectConversation(userId: $userId) {
      id
      type
      name
      participantIds
      participants {
        id
        displayName
        avatarUrl
        online
      }
      lastMessageText
      lastMessageAt
      unreadCount
      createdAt
    }
  }
`;

export const CREATE_GROUP_CONVERSATION = gql`
  mutation CreateGroupConversation($memberIds: [ID!]!, $name: String!) {
    createGroupConversation(memberIds: $memberIds, name: $name) {
      id
      type
      name
      participantIds
      participants {
        id
        displayName
        avatarUrl
        online
      }
      lastMessageText
      lastMessageAt
      unreadCount
      createdAt
    }
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($conversationId: ID!, $text: String!, $imageUrl: String) {
    sendMessage(conversationId: $conversationId, text: $text, imageUrl: $imageUrl) {
      id
      conversationId
      senderId
      senderName
      senderAvatar
      text
      imageUrl
      readBy {
        userId
        readAt
      }
      createdAt
    }
  }
`;

export const MARK_CONVERSATION_READ = gql`
  mutation MarkConversationRead($conversationId: ID!) {
    markConversationRead(conversationId: $conversationId)
  }
`;

export const SET_TYPING = gql`
  mutation SetTyping($conversationId: ID!, $isTyping: Boolean!) {
    setTyping(conversationId: $conversationId, isTyping: $isTyping)
  }
`;

export const MESSAGE_RECEIVED = gql`
  subscription MessageReceived {
    messageReceived {
      id
      conversationId
      senderId
      senderName
      senderAvatar
      text
      imageUrl
      readBy {
        userId
        readAt
      }
      createdAt
    }
  }
`;

export const TYPING_INDICATOR_SUB = gql`
  subscription TypingIndicator($conversationId: ID!) {
    typingIndicator(conversationId: $conversationId) {
      conversationId
      userId
      isTyping
    }
  }
`;

export const MESSAGE_READ_SUB = gql`
  subscription MessageRead {
    messageRead {
      conversationId
      userId
      readAt
    }
  }
`;

export const PRESENCE_CHANGED = gql`
  subscription PresenceChanged {
    presenceChanged {
      userId
      online
    }
  }
`;
