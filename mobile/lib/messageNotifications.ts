/**
 * Messenger-style message notifications using @notifee/react-native.
 * Falls back to plain Notifee / Expo if MessagingStyle or remote avatars fail.
 */
import notifee, {
  AndroidImportance,
  AndroidStyle,
  AuthorizationStatus,
  EventType,
} from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { setPendingChatNavigation } from "./activeConversation";

export const CHANNEL_ID = "ctrend_messages";
const MAX_STYLE_MESSAGES = 12;

type ConvState = {
  senderName: string;
  senderAvatar: string | null;
  messages: Array<{ text: string; timestamp: number }>;
};
export const convNotifState = new Map<string, ConvState>();

function isHttpsUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("https://");
}

function notificationsAuthorized(status: AuthorizationStatus): boolean {
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

/** Android 13+ and iOS — request/check before displaying notifications. */
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

let channelsReady = false;

/** Create channels early so Android 13+ permission prompt can appear. */
export async function initMessageNotifications(): Promise<void> {
  if (channelsReady) return;

  const granted = await ensureNotifeePermissions();
  if (!granted) {
    console.warn("[notifee] notification permission not granted");
  }

  if (Platform.OS === "android") {
    try {
      await notifee.createChannel({
        id: CHANNEL_ID,
        name: "Messages",
        importance: AndroidImportance.HIGH,
        vibration: true,
        vibrationPattern: [250, 250, 250, 250],
        lights: true,
        lightColor: "#6366f1",
        sound: "default",
      });
    } catch (e) {
      console.warn("[notifee] createChannel failed:", e);
    }

    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Messages",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6366f1",
        sound: "default",
        showBadge: true,
      });
    } catch (e) {
      console.warn("[notifee] expo channel failed:", e);
    }
  }

  channelsReady = true;
  console.warn("[notifee] message channels ready");
}

async function postViaExpo(
  conversationId: string,
  senderName: string,
  messageText: string,
) {
  await Notifications.scheduleNotificationAsync({
    identifier: `msg_${conversationId}`,
    content: {
      title: senderName,
      body: messageText,
      data: { type: "MESSAGE", conversationId: String(conversationId) },
      sound: true,
      vibrate: [250, 250, 250, 250],
      color: "#6366f1",
    },
    trigger: { channelId: CHANNEL_ID },
  });
}

async function postViaNotifeeSimple(
  conversationId: string,
  senderName: string,
  messageText: string,
) {
  await notifee.displayNotification({
    id: `msg_${conversationId}`,
    title: senderName,
    body: messageText,
    data: { type: "MESSAGE", conversationId: String(conversationId) },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      pressAction: { id: "default" },
      autoCancel: true,
      showTimestamp: true,
    },
    ios: { sound: "default" },
  });
}

async function postViaNotifeeMessaging(
  conversationId: string,
  senderName: string,
  senderAvatar: string | null,
  messageText: string,
  messages: ConvState["messages"],
) {
  const person = {
    name: senderName,
    ...(isHttpsUrl(senderAvatar) ? { icon: senderAvatar } : {}),
  };

  await notifee.displayNotification({
    id: `msg_${conversationId}`,
    title: senderName,
    body: messageText,
    data: { type: "MESSAGE", conversationId: String(conversationId) },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      smallIcon: "ic_launcher",
      style: {
        type: AndroidStyle.MESSAGING,
        person,
        messages: messages.map((m) => ({
          text: m.text,
          timestamp: m.timestamp,
          person,
        })),
        group: false,
      },
      pressAction: { id: "default" },
      autoCancel: true,
      showTimestamp: true,
    },
    ios: { sound: "default" },
  });
}

export async function postOrUpdateMessageNotification(
  conversationId: string,
  senderName: string,
  senderAvatar: string | null,
  messageText: string,
) {
  const granted = await ensureNotifeePermissions();
  if (!granted) {
    console.warn("[notifee] skipping notification — permission denied");
    return;
  }

  if (Platform.OS === "android") {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: "Messages",
      importance: AndroidImportance.HIGH,
      sound: "default",
    });
  }

  const existing = convNotifState.get(conversationId);
  const nextMessages: ConvState["messages"] = existing
    ? [...existing.messages, { text: messageText, timestamp: Date.now() }]
    : [{ text: messageText, timestamp: Date.now() }];
  const messages = nextMessages.slice(-MAX_STYLE_MESSAGES);
  convNotifState.set(conversationId, { senderName, senderAvatar, messages });

  try {
    await postViaNotifeeMessaging(
      conversationId,
      senderName,
      senderAvatar,
      messageText,
      messages,
    );
    return;
  } catch (e) {
    console.warn("[notifee] MessagingStyle failed, trying simple:", e);
  }

  try {
    await postViaNotifeeSimple(conversationId, senderName, messageText);
    return;
  } catch (e) {
    console.warn("[notifee] simple display failed, trying expo:", e);
  }

  try {
    await postViaExpo(conversationId, senderName, messageText);
  } catch (e) {
    console.warn("[notifee] expo fallback failed:", e);
  }
}

export function clearConversationNotification(conversationId: string) {
  convNotifState.delete(conversationId);
  void notifee.cancelNotification(`msg_${conversationId}`).catch(() => {});
  void Notifications.cancelScheduledNotificationAsync(`msg_${conversationId}`).catch(() => {});
}

let _foregroundHandlerRegistered = false;

function navigateToChat(conversationId: string) {
  clearConversationNotification(conversationId);
  setTimeout(() => router.push(`/chat/${conversationId}` as `/${string}`), 300);
}

export function registerNotifeeHandlers() {
  if (_foregroundHandlerRegistered) return;
  _foregroundHandlerRegistered = true;

  notifee.onForegroundEvent(({ type, detail }) => {
    if (type !== EventType.PRESS) return;
    const data = detail.notification?.data as { type?: string; conversationId?: string } | undefined;
    if (data?.type === "MESSAGE" && data.conversationId) {
      navigateToChat(data.conversationId);
    }
  });
}

export function handleNotifeeBackgroundPress(conversationId: string) {
  clearConversationNotification(conversationId);
  setPendingChatNavigation(conversationId);
}
