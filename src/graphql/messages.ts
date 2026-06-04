import { gql } from "@apollo/client";

/** Same set as backend `MESSAGE_REACTION_EMOJIS`. */
export const MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

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
      reactions {
        emoji
        count
      }
      viewerReaction
      replyTo {
        messageId
        senderId
        senderName
        text
        imageUrl
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
  mutation SendMessage($conversationId: ID!, $text: String!, $imageUrl: String, $replyToId: ID) {
    sendMessage(conversationId: $conversationId, text: $text, imageUrl: $imageUrl, replyToId: $replyToId) {
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
      reactions {
        emoji
        count
      }
      viewerReaction
      replyTo {
        messageId
        senderId
        senderName
        text
        imageUrl
      }
      createdAt
    }
  }
`;

export const REACT_MESSAGE = gql`
  mutation ReactMessage($messageId: ID!, $emoji: String) {
    reactMessage(messageId: $messageId, emoji: $emoji) {
      id
      conversationId
      reactions {
        emoji
        count
      }
      viewerReaction
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
      reactions {
        emoji
        count
      }
      viewerReaction
      replyTo {
        messageId
        senderId
        senderName
        text
        imageUrl
      }
      createdAt
    }
  }
`;

export const MESSAGE_REACTION_CHANGED = gql`
  subscription MessageReactionChanged {
    messageReactionChanged {
      messageId
      conversationId
      reactions {
        emoji
        count
      }
      actorUserId
      actorEmoji
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
