/** Conversation the user is actively viewing (chat screen focused). */
let activeId: string | null = null;

export function setActiveConversationId(conversationId: string | null) {
  activeId = conversationId;
}

export function getActiveConversationId(): string | null {
  return activeId;
}

/** Set when user taps a message notification before navigation is ready. */
let pendingChatId: string | null = null;

export function setPendingChatNavigation(conversationId: string | null) {
  pendingChatId = conversationId;
}

export function consumePendingChatNavigation(): string | null {
  const id = pendingChatId;
  pendingChatId = null;
  return id;
}
