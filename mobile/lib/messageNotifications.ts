import notifee, { AndroidImportance, AuthorizationStatus, EventType } from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { NativeModules } from "react-native";
import { router } from "expo-router";
import { apolloClient } from "./apolloClient";
import { SEND_MESSAGE, MARK_CONVERSATION_READ } from "@ctrend/shared/graphql/messages";
import { setPendingChatNavigation } from "./activeConversation";

export const REPLY_ACTION_ID = "reply";
export const MARK_READ_ACTION_ID = "mark_read";
export const CHANNEL_ID = "default"; // MAX importance channel created by usePushNotifications

const _iconCache = new Map<string, string>();

function isHttpsUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://");
}

async function composedIcon(avatarUrl: string | null): Promise<string | null> {
  if (!isHttpsUrl(avatarUrl)) return null;
  if (_iconCache.has(avatarUrl)) return _iconCache.get(avatarUrl)!;
  const composer = NativeModules.NotificationIconComposer as { compose: (url: string) => Promise<string> } | undefined;
  if (!composer) return null;
  try {
    const result = await composer.compose(avatarUrl);
    if (result) _iconCache.set(avatarUrl, result);
    return result ?? null;
  } catch {
    return null;
  }
}

const MAX_STYLE_MESSAGES = 12;

type ConvState = {
  senderName: string;
  senderAvatar: string | null;
  messages: Array<{ text: string; timestamp: number }>;
  notifIds: string[];
};
export const convNotifState = new Map<string, ConvState>();

function notificationsAuthorized(status: AuthorizationStatus): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

export async function ensureNotifeePermissions(): Promise<boolean> {
  try {
    const current = await notifee.getNotificationSettings();
    if (notificationsAuthorized(current.authorizationStatus)) return true;
    const requested = await notifee.requestPermission();
    return notificationsAuthorized(requested.authorizationStatus);
  } catch (e) {
    console.warn("[notifee] ensureNotifeePermissions failed:", e);
    return false;
  }
}

export async function initMessageNotifications(): Promise<void> {
  // Channel is created by usePushNotifications with importance MAX.
  // Just ensure permission is requested early.
  await ensureNotifeePermissions();
}

let _notifSeq = 0;
function makeNotifId(conversationId: string) {
  // Counter ensures uniqueness even for messages arriving in the same millisecond.
  return `msg_${conversationId}_${Date.now()}_${++_notifSeq}`;
}

export async function postOrUpdateMessageNotification(
  conversationId: string,
  senderName: string,
  senderAvatar: string | null,
  messageText: string,
) {
  const existing = convNotifState.get(conversationId);
  const messages = [
    ...(existing?.messages ?? []),
    { text: messageText, timestamp: Date.now() },
  ].slice(-MAX_STYLE_MESSAGES);

  const notifId = makeNotifId(conversationId);
  const notifIds = [...(existing?.notifIds ?? []), notifId];
  convNotifState.set(conversationId, { senderName, senderAvatar, messages, notifIds });

  // Try Notifee first — it supports sender avatar (largeIcon).
  // Counter-based unique ID prevents the silent-update collision that affected earlier builds.
  const icon = await composedIcon(senderAvatar);
  try {
    await notifee.displayNotification({
      id: notifId,
      title: senderName,
      body: messageText,
      data: { type: "MESSAGE", conversationId: String(conversationId) },
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        smallIcon: "ic_launcher_monochrome",
        ...(icon
          ? { largeIcon: icon }
          : isHttpsUrl(senderAvatar)
          ? { largeIcon: senderAvatar, circularLargeIcon: true }
          : {}),
        pressAction: { id: "default" },
        autoCancel: true,
        showTimestamp: true,
      },
      ios: { sound: "default" },
    });
    console.warn("[msg] posted via notifee:", notifId);
    return;
  } catch (e) {
    console.warn("[msg] notifee failed, trying expo:", e);
  }

  // Expo fallback
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: notifId,
      content: {
        title: senderName,
        body: messageText,
        data: { type: "MESSAGE", conversationId: String(conversationId) },
        sound: true,
      },
      trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
    });
    console.warn("[msg] posted via expo:", notifId);
  } catch (e) {
    console.warn("[msg] expo fallback failed:", e);
  }
}

export async function handleInlineReply(conversationId: string, text: string): Promise<void> {
  try {
    await apolloClient.mutate({
      mutation: SEND_MESSAGE,
      variables: { conversationId, text },
    });
    clearConversationNotification(conversationId);
  } catch (e) {
    console.warn("[notifee] inline reply failed:", e);
  }
}

export async function handleMarkReadAction(conversationId: string): Promise<void> {
  try {
    await apolloClient.mutate({
      mutation: MARK_CONVERSATION_READ,
      variables: { conversationId },
    });
    clearConversationNotification(conversationId);
  } catch (e) {
    console.warn("[notifee] mark read failed:", e);
  }
}

export function clearConversationNotification(conversationId: string) {
  const state = convNotifState.get(conversationId);
  convNotifState.delete(conversationId);
  for (const id of state?.notifIds ?? []) {
    void Notifications.dismissNotificationAsync(id).catch(() => {});
    void Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
}

let _foregroundHandlerRegistered = false;

function navigateToChat(conversationId: string) {
  clearConversationNotification(conversationId);
  setTimeout(() => router.push(`/chat/${conversationId}` as `/${string}`), 300);
}

export function registerNotifeeHandlers() {
  if (_foregroundHandlerRegistered) return;
  _foregroundHandlerRegistered = true;

  // Notifee foreground handler — kept for any Notifee-posted notifications.
  notifee.onForegroundEvent(({ type, detail }) => {
    const data = detail.notification?.data as { type?: string; conversationId?: string } | undefined;
    if (data?.type !== "MESSAGE" || !data.conversationId) return;
    const conversationId = data.conversationId;
    if (type === EventType.PRESS) {
      navigateToChat(conversationId);
    }
  });
}

export function handleNotifeeBackgroundPress(conversationId: string) {
  clearConversationNotification(conversationId);
  setPendingChatNavigation(conversationId);
}
