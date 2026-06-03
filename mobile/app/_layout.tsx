import { ApolloProvider, useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import notifee, { EventType } from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apolloClient } from "../lib/apolloClient";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { TabBarProvider } from "../context/TabBarContext";
import { SoundProvider, useSounds } from "../context/SoundContext";
import { NotificationProvider, useNotification, type NotifToast } from "../context/NotificationContext";
import { OfflineBanner } from "../components/OfflineBanner";
import { InAppNotificationBanner } from "../components/InAppNotificationBanner";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { NEW_NOTIFICATION_SUB, UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { MESSAGE_RECEIVED, MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { GET_USER_PROFILE } from "@ctrend/shared/graphql/friends";
import {
  postOrUpdateMessageNotification,
  postBellNotification,
  resolveNotificationRoute,
  clearConversationNotification,
  initMessageNotifications,
  registerNotifeeHandlers,
  handleNotifeeBackgroundPress,
  handleInlineReply,
  handleMarkReadAction,
  REPLY_ACTION_ID,
  MARK_READ_ACTION_ID,
  type NotifNavData,
} from "../lib/messageNotifications";
import {
  consumePendingChatNavigation,
  consumePendingNavigationRoute,
  setPendingNavigationRoute,
  getActiveConversationId,
  setActiveConversationId,
} from "../lib/activeConversation";

// Background event handler — must be registered at module level (runs when app is killed/bg)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const data = detail.notification?.data as NotifNavData | undefined;
  if (!data) return;

  // Chat messages: inline reply / mark-read actions + tap navigation.
  if (data.type === "MESSAGE" && data.conversationId) {
    const conversationId = data.conversationId;
    if (type === EventType.PRESS) {
      handleNotifeeBackgroundPress(conversationId);
      return;
    }
    if (type === EventType.ACTION_PRESS) {
      if (detail.pressAction?.id === REPLY_ACTION_ID && detail.input?.trim()) {
        await handleInlineReply(conversationId, detail.input.trim());
      } else if (detail.pressAction?.id === MARK_READ_ACTION_ID) {
        await handleMarkReadAction(conversationId);
      }
    }
    return;
  }

  // Bell notifications (likes, comments, friend requests, votes, …):
  // stash the resolved route to navigate once the app is active.
  if (data.type === "BELL" && type === EventType.PRESS) {
    setPendingNavigationRoute(resolveNotificationRoute(data));
  }
});

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

// Syncs unread notification count to the app icon badge.
function BadgeSync() {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery(UNREAD_NOTIFICATION_COUNT, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
    pollInterval: 30000,
  });

  useEffect(() => {
    const count: number = data?.unreadNotificationCount ?? 0;
    void Notifications.setBadgeCountAsync(count);
  }, [data]);

  return null;
}

/**
 * Builds the system-notification title/body.
 * The backend `body` already reads like "<name> commented on your post", so we
 * surface the actor's name as the (bold) title and the action as the body —
 * matching how social apps show "Name" + "did X". Brand/system notifications
 * (no actor) keep the backend title/body as-is.
 */
function buildBellText(
  actorName: string | null,
  title: string,
  body: string,
): { title: string; body: string } {
  if (!actorName) return { title: title || body || "Notification", body: body || "" };
  const trimmed = (body || "").trim();
  const phrase = trimmed.startsWith(actorName) ? trimmed.slice(actorName.length).trim() : trimmed;
  return { title: actorName, body: phrase || title || "" };
}

/**
 * Resolves the actor's avatar for a notification. The realtime `newNotification`
 * subscription doesn't always include `latestActorAvatar` (unlike the query), so
 * fall back to fetching the actor's profile when it's missing.
 */
async function resolveActorAvatar(
  client: ReturnType<typeof useApolloClient>,
  rawAvatar: string | null | undefined,
  actorId: string | null,
): Promise<string | null> {
  const direct = normalizeProfileImageUrl(rawAvatar);
  if (direct) return direct;
  if (!actorId) return null;
  try {
    const res = await client.query<{ getUserProfile?: { profileImageUrl?: string | null } }>({
      query: GET_USER_PROFILE,
      variables: { userId: actorId },
      fetchPolicy: "cache-first",
    });
    return normalizeProfileImageUrl(res.data?.getUserProfile?.profileImageUrl);
  } catch {
    return null;
  }
}

// Fires for bell-type notifications (votes, comments, friend requests, etc.) on every screen.
function GlobalNotificationSubscription() {
  const { isAuthenticated } = useAuth();
  const { showToast } = useNotification();
  const { playNotification } = useSounds();
  const client = useApolloClient();

  useSubscription(NEW_NOTIFICATION_SUB, {
    skip: !isAuthenticated,
    onData: ({ data }) => {
      const n = data.data?.newNotification as (NotifToast & { read?: boolean }) | null;
      if (!n) return;

      const raw = n as unknown as Record<string, unknown>;
      const actorName = (raw.latestActorName as string | null | undefined)?.trim() || null;
      const actorId = (raw.latestActorId as string | null | undefined) ?? null;
      const postId = (raw.postId as string | null | undefined) ?? null;
      const { title, body } = buildBellText(actorName, n.title, n.body);
      console.warn("[bell] received:", n.type, "actorAvatar?", !!raw.latestActorAvatar);

      // In-app banner
      playNotification();
      showToast({
        id: n.id,
        type: n.type,
        title,
        body,
        referenceId: n.referenceId,
        referenceType: n.referenceType,
        postId,
      });

      // Android system notification with the actor's avatar (fetched if the
      // subscription payload didn't include it).
      void resolveActorAvatar(
        client,
        raw.latestActorAvatar as string | null | undefined,
        actorId,
      ).then((actorAvatar) =>
        postBellNotification({
          title,
          body,
          actorAvatar,
          referenceType: n.referenceType ?? null,
          referenceId: n.referenceId ?? null,
          postId,
        }),
      );

      // Refresh bell badge count
      void client.refetchQueries({ include: [UNREAD_NOTIFICATION_COUNT] });
    },
  });

  return null;
}

function isViewingConversation(conversationId: string, pathname: string): boolean {
  if (getActiveConversationId() === conversationId) return true;
  return pathname.includes(`/chat/${conversationId}`);
}

// Fires for incoming chat messages on every screen.
function GlobalMessageSubscription() {
  const { isAuthenticated, user } = useAuth();
  const { showToast } = useNotification();
  const { playMessage } = useSounds();
  const client = useApolloClient();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  useSubscription<{
    messageReceived: {
      id: string;
      conversationId: string;
      senderId: string;
      senderName: string;
      senderAvatar?: string | null;
      text: string;
      imageUrl?: string | null;
    };
  }>(MESSAGE_RECEIVED, {
    skip: !isAuthenticated,
    onData: ({ data }) => {
      const msg = data.data?.messageReceived;
      if (!msg) return;
      if (msg.senderId && msg.senderId === userIdRef.current) return;

      const body = msg.text || (msg.imageUrl ? "📷 Image" : "New message");
      const alreadyInChat = isViewingConversation(
        msg.conversationId,
        pathnameRef.current,
      );
      const senderName = msg.senderName?.trim() || "Someone";
      const senderAvatar = msg.senderAvatar || null;

      if (!alreadyInChat) {
        playMessage();
        void initMessageNotifications();

        // Notifee MessagingStyle notification with sender avatar
        void postOrUpdateMessageNotification(
          msg.conversationId,
          senderName,
          senderAvatar,
          body,
        );

        showToast({
          id: msg.id,
          type: "NEW_MESSAGE",
          title: senderName,
          body,
          referenceId: msg.conversationId,
          referenceType: "CONVERSATION",
          postId: null,
        });

        void client.refetchQueries({ include: [MY_CONVERSATIONS] });
      }
    },
  });

  return null;
}

function navigateFromMessageNotification(conversationId: string) {
  clearConversationNotification(conversationId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setTimeout(() => router.push(`/chat/${conversationId}` as any), 400);
}

function AppServices() {
  const { isAuthenticated } = useAuth();
  usePushNotifications(isAuthenticated);

  useEffect(() => {
    registerNotifeeHandlers();
    void initMessageNotifications();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void initMessageNotifications();
  }, [isAuthenticated]);

  // Prevent stale "viewing chat" blocking notifications after leaving the screen
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        setActiveConversationId(null);
      }
    });
    return () => sub.remove();
  }, []);

  // Cold start, background tap, or press before router is ready
  useEffect(() => {
    if (!isAuthenticated) return;

    function openPendingOrInitial() {
      const pending = consumePendingChatNavigation();
      if (pending) {
        navigateFromMessageNotification(pending);
        return true;
      }
      const pendingRoute = consumePendingNavigationRoute();
      if (pendingRoute) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTimeout(() => router.push(pendingRoute as any), 400);
        return true;
      }
      return false;
    }

    if (openPendingOrInitial()) return;

    void notifee.getInitialNotification().then((initial) => {
      if (!initial) return;
      const data = initial.notification?.data as NotifNavData | undefined;
      if (!data) return;
      if (data.type === "MESSAGE" && data.conversationId) {
        navigateFromMessageNotification(data.conversationId);
        return;
      }
      if (data.type === "BELL") {
        const route = resolveNotificationRoute(data);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (route) setTimeout(() => router.push(route as any), 400);
      }
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const pending = consumePendingChatNavigation();
      if (pending) {
        navigateFromMessageNotification(pending);
        return;
      }
      const route = consumePendingNavigationRoute();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (route) setTimeout(() => router.push(route as any), 400);
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  return null;
}

// Handles notification taps with path awareness so we never get stuck with no back stack.
function NotificationResponseHandler() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let lastId = "";

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      // Android sometimes fires this twice for a single tap — debounce by ID
      const id = response.notification.request.identifier;
      if (id === lastId) return;
      lastId = id;
      setTimeout(() => { lastId = ""; }, 2000);

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      const { referenceType, referenceId, postId, type, conversationId } = data as {
        referenceType?: string;
        referenceId?: string;
        postId?: string;
        type?: string;
        conversationId?: string;
      };

      // Small delay lets Expo Router finish mounting the initial route so the
      // back stack is never empty (avoids "stuck with no back button" on cold start).
      setTimeout(() => {
        const chatId =
          (type === "MESSAGE" && conversationId) ||
          (referenceType === "MESSAGE" && referenceId) ||
          (referenceType === "CONVERSATION" && referenceId) ||
          null;
        if (chatId) {
          if (pathnameRef.current.includes(`/chat/${chatId}`)) return;
          clearConversationNotification(String(chatId));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          router.push(`/chat/${chatId}` as any);
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (postId) { router.push(`/post/${postId}` as any); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (referenceType === "POST" && referenceId) { router.push(`/post/${referenceId}` as any); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (referenceType === "USER" && referenceId) { router.push(`/profile/${referenceId}` as any); return; }
        router.push("/notifications");
      }, 300);
    });

    return () => sub.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ApolloProvider client={apolloClient}>
        <AuthProvider>
          <ThemeProvider>
            <TabBarProvider>
              <SoundProvider>
                <NotificationProvider>
                  <KeyboardProvider>
                    <View style={{ flex: 1 }}>
                      <AppServices />
                      <AppStatusBar />
                      <NotificationResponseHandler />
                      <BadgeSync />
                      <GlobalNotificationSubscription />
                      <GlobalMessageSubscription />
                      <Stack screenOptions={{ headerShown: false }} />
                      <OfflineBanner />
                      <InAppNotificationBanner />
                    </View>
                  </KeyboardProvider>
                </NotificationProvider>
              </SoundProvider>
            </TabBarProvider>
          </ThemeProvider>
        </AuthProvider>
      </ApolloProvider>
    </SafeAreaProvider>
  );
}
