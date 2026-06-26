import notifee, { AndroidImportance, AuthorizationStatus, EventType } from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { NativeModules } from "react-native";
import { router } from "expo-router";
import { apolloClient } from "./apolloClient";
import { SEND_MESSAGE, MARK_CONVERSATION_READ, REACT_MESSAGE } from "@ctrend/shared/graphql/messages";
import { PLAY_STORE_CLOSED_TESTING_URL } from "@ctrend/shared/lib/appUpdate";
import { setPendingChatNavigation } from "./activeConversation";
// Brand logo shown as the notification large icon when there's no actor avatar
// (e.g. system/announcement notifications) — mirrors the in-app notification list.
import BRAND_LOGO from "../assets/logo.png";

export const REPLY_ACTION_ID = "reply";
export const MARK_READ_ACTION_ID = "mark_read";
export const LIKE_ACTION_ID = "like";
// Emoji sent when the user taps "Like" on a chat notification — must be one of
// MESSAGE_REACTION_EMOJIS so the backend accepts it.
export const LIKE_EMOJI = "👍";
export const CHANNEL_ID = "default"; // MAX importance channel created by usePushNotifications

// Reply (inline text input) + Like action buttons shown on chat notifications (Android).
const MESSAGE_NOTIF_ACTIONS = [
  {
    title: "Reply",
    pressAction: { id: REPLY_ACTION_ID },
    input: { allowFreeFormInput: true, placeholder: "Reply…" },
  },
  {
    title: `${LIKE_EMOJI} Like`,
    pressAction: { id: LIKE_ACTION_ID },
  },
];

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
  messageId?: string | null,
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
      data: {
        type: "MESSAGE",
        conversationId: String(conversationId),
        messageId: messageId ? String(messageId) : "",
      },
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
        // Like needs a messageId target; Reply only needs the conversation.
        actions: messageId
          ? MESSAGE_NOTIF_ACTIONS
          : MESSAGE_NOTIF_ACTIONS.filter((a) => a.pressAction.id !== LIKE_ACTION_ID),
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
        data: {
          type: "MESSAGE",
          conversationId: String(conversationId),
          messageId: messageId ? String(messageId) : "",
        },
        sound: true,
      },
      trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
    });
    console.warn("[msg] posted via expo:", notifId);
  } catch (e) {
    console.warn("[msg] expo fallback failed:", e);
  }
}

/**
 * Posts a "bell" notification (likes, comments, friend requests, votes, …)
 * via Notifee so it can carry the actor's avatar as the Android large icon.
 * Falls back to Expo (no large icon) if Notifee fails.
 */
export async function postBellNotification(opts: {
  title: string;
  body: string;
  actorAvatar: string | null;
  notifType?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  postId?: string | null;
  commentId?: string | null;
}) {
  const id = `bell_${opts.postId || opts.referenceId || "general"}_${opts.notifType || "BELL"}`;
  const data = {
    type: "BELL",
    notifType: opts.notifType ?? "",
    referenceType: opts.referenceType ?? "",
    referenceId: opts.referenceId ?? "",
    postId: opts.postId ?? "",
    commentId: opts.commentId ?? "",
  };

  // Notifee first — supports actor avatar (largeIcon).
  const icon = await composedIcon(opts.actorAvatar);
  try {
    await notifee.displayNotification({
      id,
      title: opts.title,
      body: opts.body,
      data,
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        smallIcon: "ic_launcher_monochrome",
        ...(icon
          ? { largeIcon: icon, circularLargeIcon: true }
          : isHttpsUrl(opts.actorAvatar)
          ? { largeIcon: opts.actorAvatar, circularLargeIcon: true }
          : { largeIcon: BRAND_LOGO }),
        pressAction: { id: "default" },
        autoCancel: true,
        showTimestamp: true,
      },
      ios: { sound: "default" },
    });
    console.warn("[bell] posted via notifee:", id);
    return;
  } catch (e) {
    console.warn("[bell] notifee failed, trying expo:", e);
  }

  // Expo fallback (no large icon, but still delivered + tappable).
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: opts.title, body: opts.body, data, sound: true },
      trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
    });
    console.warn("[bell] posted via expo:", id);
  } catch (e) {
    console.warn("[bell] expo fallback failed:", e);
  }
}

export type NotifNavData = {
  type?: string;          // routing discriminator: "MESSAGE" | "BELL"
  notifType?: string;     // original notification type, e.g. POST_COMMENT, POST_HYPE
  conversationId?: string;
  messageId?: string;     // target message for the chat "Like" action
  referenceType?: string;
  referenceId?: string;
  postId?: string;
  commentId?: string;
};

// Comment-focused notifications → open the post scrolled to that comment.
const COMMENT_NOTIF_TYPES = new Set([
  "POST_COMMENT", "NEW_COMMENT", "COMMENT_REPLY", "COMMENT_REACTION", "COMMENT_LIKE",
]);
// Post-focused notifications → open the post.
const POST_NOTIF_TYPES = new Set([
  "POST_HYPE", "POST_VOTE", "NEW_POST_FRIEND",
  "VOTE_ENDED", "VOTE_WINNER", "POST_WINNER", "VOTE_PRIZE_CLAIMED",
]);
// Person-focused notifications → open that user's profile.
const PROFILE_NOTIF_TYPES = new Set([
  "FRIEND_REQUEST", "FRIEND_REQUEST_ACCEPTED", "NEW_FOLLOWER",
]);
// Referral-point notifications → open the points hub.
const POINTS_NOTIF_TYPES = new Set(["REFERRAL_JOINED", "REFERRAL_REDEEMED"]);
// Platform notifications → open the linked post if any, else the notifications list.
const ANNOUNCEMENT_NOTIF_TYPES = new Set([
  "ANNOUNCEMENT", "ADMIN_BROADCAST", "SYSTEM",
]);
// World Cup fixture notifications → open match detail screen.
const FIXTURE_NOTIF_TYPES = new Set(["LINEUP_AVAILABLE", "MATCH_START", "MATCH_END"]);

export function isAndroidUpdateNotification(data: NotifNavData): boolean {
  return (data.referenceType ?? "").toLowerCase() === "android_update_required";
}

export function openAndroidUpdateLink(): void {
  void Linking.openURL(PLAY_STORE_CLOSED_TESTING_URL);
}

/** Returns true when the tap was handled (Play Store link), false to continue in-app routing. */
export function handleAndroidUpdateNotificationTap(data: NotifNavData): boolean {
  if (!isAndroidUpdateNotification(data)) return false;
  openAndroidUpdateLink();
  return true;
}

/**
 * Resolves the in-app route for a notification payload — shared by every tap path
 * (Notifee foreground/background/cold-start and the Expo fallback handler).
 * Mirrors the in-app notification list's `navigateFromNotif`.
 */
export function resolveNotificationRoute(data: NotifNavData): string | null {
  if (isAndroidUpdateNotification(data)) return null;

  // Chat messages
  const chatId =
    (data.type === "MESSAGE" && data.conversationId) ||
    (data.type === "MESSAGE" &&
      data.referenceType === "moderator_conversation" &&
      data.referenceId) ||
    (data.referenceType === "CONVERSATION" && data.referenceId) ||
    (data.referenceType === "MESSAGE" && data.referenceId) ||
    null;
  if (chatId) return `/chat/${chatId}`;

  const nt = data.notifType ?? "";
  const refType = (data.referenceType ?? "").toUpperCase();
  const postTarget = data.postId || (refType === "POST" ? data.referenceId : undefined) || null;
  const postRoute = (base: string) => (data.commentId ? `${base}?commentId=${data.commentId}` : base);

  // World Cup fixture → match detail screen
  if (FIXTURE_NOTIF_TYPES.has(nt) && data.referenceId) {
    const tab = nt === "LINEUP_AVAILABLE" ? "?tab=lineup" : "";
    return `/world-cup/match/${data.referenceId}${tab}`;
  }
  if (refType === "FIXTURE" && data.referenceId) {
    return `/world-cup/match/${data.referenceId}`;
  }

  if (COMMENT_NOTIF_TYPES.has(nt) && postTarget) {
    return postRoute(`/comments/${postTarget}`);
  }
  if (POST_NOTIF_TYPES.has(nt) && postTarget) return `/post/${postTarget}`;
  if (POINTS_NOTIF_TYPES.has(nt)) return "/points";
  if (PROFILE_NOTIF_TYPES.has(nt) && data.referenceId) return `/profile/${data.referenceId}`;
  if (ANNOUNCEMENT_NOTIF_TYPES.has(nt)) {
    return postTarget ? `/post/${postTarget}` : "/notifications";
  }

  // Fallback by data shape (unknown/missing type)
  if (postTarget) return postRoute(`/post/${postTarget}`);
  if (refType === "USER" && data.referenceId) return `/profile/${data.referenceId}`;
  return "/notifications";
}

/** Navigates to the route for a tapped notification (foreground path). */
export function navigateForNotification(data: NotifNavData) {
  if (handleAndroidUpdateNotificationTap(data)) return;
  const route = resolveNotificationRoute(data);
  if (!route) return;
  if (route.startsWith("/chat/")) clearConversationNotification(route.slice("/chat/".length));
  setTimeout(() => router.push(route as `/${string}`), 300);
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

/** Reacts to a message with 👍 when the user taps "Like" on its notification. */
export async function handleLikeAction(messageId: string): Promise<void> {
  try {
    await apolloClient.mutate({
      mutation: REACT_MESSAGE,
      variables: { messageId, emoji: LIKE_EMOJI },
    });
  } catch (e) {
    console.warn("[notifee] like reaction failed:", e);
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

  // Notifee foreground handler — routes taps and reply/like actions while the app is open.
  notifee.onForegroundEvent(async ({ type, detail }) => {
    const data = detail.notification?.data as NotifNavData | undefined;
    if (!data) return;

    // Reply / Like action buttons on a chat notification.
    if (type === EventType.ACTION_PRESS && data.type === "MESSAGE" && data.conversationId) {
      const actionId = detail.pressAction?.id;
      if (actionId === REPLY_ACTION_ID && detail.input?.trim()) {
        await handleInlineReply(data.conversationId, detail.input.trim());
      } else if (actionId === LIKE_ACTION_ID && data.messageId) {
        await handleLikeAction(data.messageId);
      } else if (actionId === MARK_READ_ACTION_ID) {
        await handleMarkReadAction(data.conversationId);
      }
      // Clear the notification (also dismisses the inline-reply spinner).
      if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
      return;
    }

    if (type !== EventType.PRESS) return;
    if (data.type === "MESSAGE" && data.conversationId) {
      navigateToChat(data.conversationId);
      return;
    }
    if (data.type === "BELL") {
      navigateForNotification(data);
    }
  });
}

export function handleNotifeeBackgroundPress(conversationId: string) {
  clearConversationNotification(conversationId);
  setPendingChatNavigation(conversationId);
}
