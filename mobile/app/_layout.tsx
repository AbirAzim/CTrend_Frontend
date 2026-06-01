import { ApolloProvider, useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import notifee, { EventType } from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { AppState, Platform, View } from "react-native";
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
import { MESSAGE_RECEIVED, MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import {
  postOrUpdateMessageNotification,
  clearConversationNotification,
  initMessageNotifications,
  registerNotifeeHandlers,
  handleNotifeeBackgroundPress,
  handleInlineReply,
  handleMarkReadAction,
  REPLY_ACTION_ID,
  MARK_READ_ACTION_ID,
} from "../lib/messageNotifications";
import {
  consumePendingChatNavigation,
  getActiveConversationId,
  setActiveConversationId,
} from "../lib/activeConversation";

// Background event handler — must be registered at module level (runs when app is killed/bg)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const data = detail.notification?.data as { type?: string; conversationId?: string } | undefined;
  if (data?.type !== "MESSAGE" || !data.conversationId) return;
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
});

const BELL_CHANNEL_ID = "default";

async function postSystemNotification(
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  try {
    const safeData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      safeData[k] = v == null ? "" : String(v);
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || "Ke Jitbe",
        body: body || " ",
        data: safeData,
        sound: true,
      },
      trigger: Platform.OS === "android" ? { channelId: BELL_CHANNEL_ID } : null,
    });
    console.warn("[bell] posted:", title);
  } catch (e) {
    console.warn("[bell] postSystemNotification failed:", e);
  }
}

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
      console.warn("[bell] received:", n.type, n.title);

      // In-app banner
      playNotification();
      showToast({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        referenceId: n.referenceId,
        referenceType: n.referenceType,
        postId: (n as unknown as Record<string, unknown>).postId as string | null ?? null,
      });

      const raw = n as unknown as Record<string, unknown>;
      void postSystemNotification(
        n.title || n.body || "Notification",
        n.body || "",
        {
          referenceType: n.referenceType ?? "",
          referenceId: n.referenceId ?? "",
          postId: raw.postId ?? "",
        },
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
      return false;
    }

    if (openPendingOrInitial()) return;

    void notifee.getInitialNotification().then((initial) => {
      if (!initial) return;
      const data = initial.notification?.data as { type?: string; conversationId?: string } | undefined;
      if (data?.type === "MESSAGE" && data.conversationId) {
        navigateFromMessageNotification(data.conversationId);
      }
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const pending = consumePendingChatNavigation();
      if (pending) navigateFromMessageNotification(pending);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
