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

/**
 * Set when a (non-chat) bell notification is tapped while the app is
 * backgrounded/killed and the router isn't ready yet. Holds the resolved
 * in-app route (e.g. "/post/123") to push once the app becomes active.
 */
let pendingRoute: string | null = null;

export function setPendingNavigationRoute(route: string | null) {
  pendingRoute = route;
}

export function consumePendingNavigationRoute(): string | null {
  const route = pendingRoute;
  pendingRoute = null;
  return route;
}
