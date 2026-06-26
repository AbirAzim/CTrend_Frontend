import { ApolloProvider, useApolloClient, useQuery, useSubscription } from "@apollo/client/react";
import notifee, { EventType } from "@notifee/react-native";
import * as Notifications from "expo-notifications";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, type ReactNode } from "react";
import { AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze } from "react-native-screens";
import { apolloClient, onWsConnected } from "../lib/apolloClient";

// Freeze off-screen screens so background routes (the feed, World Cup, etc.) stop
// re-rendering while they're not visible — keeps navigation smooth (e.g. the feed
// doesn't keep working while you're on World Cup, and vice-versa).
enableFreeze(true);
import { onAuthExpired, clearAuthExpired } from "../lib/authExpiredState";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { TabBarProvider } from "../context/TabBarContext";
import { SoundProvider, useSounds } from "../context/SoundContext";
import { NotificationProvider, useNotification, type NotifToast } from "../context/NotificationContext";
import { OfflineBanner } from "../components/OfflineBanner";
import { ForceUpdateModal } from "../components/ForceUpdateModal";
import { WorldCupFloating } from "../components/WorldCupFloating";
import { CoinsProvider } from "../context/CoinsContext";
import { useForceUpdateRequired } from "../hooks/useForceUpdateRequired";
import { InAppNotificationBanner } from "../components/InAppNotificationBanner";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { MY_NOTIFICATIONS, NEW_NOTIFICATION_SUB, UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import { REFERRAL_POINTS } from "@ctrend/shared/graphql/coins";
import { REFERRAL_POINTS_HISTORY } from "@ctrend/shared/graphql/referrals";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { MESSAGE_RECEIVED, MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { FRIEND_REQUESTS, FRIEND_SUGGESTIONS, GET_USER_PROFILE, MY_FRIENDS } from "@ctrend/shared/graphql/friends";
import {
  postOrUpdateMessageNotification,
  postBellNotification,
  resolveNotificationRoute,
  handleAndroidUpdateNotificationTap,
  clearConversationNotification,
  initMessageNotifications,
  registerNotifeeHandlers,
  handleNotifeeBackgroundPress,
  handleInlineReply,
  handleMarkReadAction,
  handleLikeAction,
  REPLY_ACTION_ID,
  MARK_READ_ACTION_ID,
  LIKE_ACTION_ID,
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
      const actionId = detail.pressAction?.id;
      if (actionId === REPLY_ACTION_ID && detail.input?.trim()) {
        await handleInlineReply(conversationId, detail.input.trim());
      } else if (actionId === LIKE_ACTION_ID && data.messageId) {
        await handleLikeAction(data.messageId);
      } else if (actionId === MARK_READ_ACTION_ID) {
        await handleMarkReadAction(conversationId);
      }
      // Clear the notification — also dismisses the inline-reply progress spinner.
      if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
    }
    return;
  }

  // Bell notifications (likes, comments, friend requests, votes, …):
  // stash the resolved route to navigate once the app is active.
  if (data.type === "BELL" && type === EventType.PRESS) {
    if (handleAndroidUpdateNotificationTap(data)) return;
    setPendingNavigationRoute(resolveNotificationRoute(data));
  }
});

// NOTE: background/killed chat pushes are rendered natively by CtrendMessagingService
// (Reply/👍 Like included). Expo's FCM service is removed in AndroidManifest, so a JS
// background notification task would never fire — the native path is the source of truth.

function AppStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

// Root container painted with the active theme background. Without this the
// edge-to-edge window default (white) shows through behind the Android system
// nav bar — the "white box" at the bottom of dark-themed screens.
function ThemedRoot({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
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
      const commentId = (raw.commentId as string | null | undefined) ?? null;
      const { title, body } = buildBellText(actorName, n.title, n.body);
      console.warn("[bell] received:", n.type, "actorAvatar?", !!raw.latestActorAvatar);

      playNotification();

      // Resolve avatar once — used for in-app banner + Android status-bar notification.
      void resolveActorAvatar(
        client,
        raw.latestActorAvatar as string | null | undefined,
        actorId,
      ).then((actorAvatar) => {
        showToast({
          id: n.id,
          type: n.type,
          title,
          body,
          referenceId: n.referenceId,
          referenceType: n.referenceType,
          postId,
          actorAvatarUrl: actorAvatar,
        });
        void postBellNotification({
          title,
          body,
          actorAvatar,
          notifType: n.type ?? null,
          referenceType: n.referenceType ?? null,
          referenceId: n.referenceId ?? null,
          postId,
          commentId,
        });
      });

      // Refresh bell badge count
      void client.refetchQueries({ include: [UNREAD_NOTIFICATION_COUNT] });

      if (n.type === "REFERRAL_JOINED" || n.type === "REFERRAL_REDEEMED") {
        void client.refetchQueries({
          include: [REFERRAL_POINTS, REFERRAL_POINTS_HISTORY],
        });
      }

      // Friend graph changed → refresh any friend lists that are on screen
      // (Received/Sent/Friends/Suggestions on the Friends + Profile screens).
      // `include` only refetches active queries, so it's a no-op off-screen.
      if (
        n.type === "FRIEND_REQUEST" ||
        n.type === "FRIEND_REQUEST_ACCEPTED" ||
        n.type === "NEW_FOLLOWER"
      ) {
        void client.refetchQueries({
          include: [FRIEND_REQUESTS, MY_FRIENDS, FRIEND_SUGGESTIONS],
        });
      }
    },
  });

  return null;
}

/**
 * Notification delivery resilience (Phase 33).
 *
 * The bell is delivered live over the `newNotification` WS subscription, but the
 * in-process PubSub has no replay, so anything fired while the socket was down
 * (backgrounded app, lost network) is lost until something refetches. We recover
 * by refetching the bell queries when:
 *   • the app returns to the foreground (AppState → active), and
 *   • the WS (re)connects.
 * `reconnectWs()` on login/logout (AuthContext) already prevents the stale-auth
 * socket that would silently drop every event. MY_NOTIFICATIONS only refetches
 * when the notifications screen is mounted (otherwise it's a no-op).
 */
function NotificationResilience() {
  const { isAuthenticated } = useAuth();
  const client = useApolloClient();

  useEffect(() => {
    if (!isAuthenticated) return;
    const refetchBell = () =>
      void client
        .refetchQueries({ include: [UNREAD_NOTIFICATION_COUNT, MY_NOTIFICATIONS] })
        .catch(() => {});

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") refetchBell();
    });
    const unsubWs = onWsConnected(refetchBell);

    return () => {
      appStateSub.remove();
      unsubWs();
    };
  }, [isAuthenticated, client]);

  return null;
}

function isViewingConversation(conversationId: string, pathname: string): boolean {
  if (getActiveConversationId() === conversationId) return true;
  return pathname.includes(`/chat/${conversationId}`);
}

// Fires for incoming chat messages on every screen.
function GlobalMessageSubscription() {
  const { isAuthenticated, user } = useAuth();
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
        // Only render from JS while the app is foreground. When backgrounded or
        // killed the native CtrendMessagingService renders the push itself (same
        // Reply/👍 Like actions), so posting here too would be a duplicate.
        if (AppState.currentState === "active") {
          playMessage();
          void initMessageNotifications();

          // Notifee notification with sender avatar + Reply/👍 Like actions.
          void postOrUpdateMessageNotification(
            msg.conversationId,
            senderName,
            senderAvatar,
            body,
            msg.id,
          );
        }

        // No in-app envelope banner / no duplicate toast — one notification only.

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
        if (handleAndroidUpdateNotificationTap(data)) return;
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

      const data = response.notification.request.content.data as NotifNavData | undefined;
      if (!data) return;

      // Small delay lets Expo Router finish mounting the initial route so the
      // back stack is never empty (avoids "stuck with no back button" on cold start).
      setTimeout(() => {
        if (handleAndroidUpdateNotificationTap(data)) return;
        const route = resolveNotificationRoute(data);
        if (!route) { router.push("/notifications"); return; }
        if (route.startsWith("/chat/")) {
          const chatId = route.slice("/chat/".length);
          if (pathnameRef.current.includes(`/chat/${chatId}`)) return;
          clearConversationNotification(chatId);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(route as any);
      }, 300);
    });

    return () => sub.remove();
  }, []);

  return null;
}

function AuthExpiredGate() {
  const { logout, isAuthenticated } = useAuth();
  useEffect(() => {
    return onAuthExpired(() => {
      clearAuthExpired();
      void logout().then(() => {
        router.replace("/auth/login");
      });
    });
  }, [logout]);
  void isAuthenticated; // consumed so lint doesn't complain
  return null;
}

function ForceUpdateGate() {
  const { needsUpdate, installedVersionCode, minRequiredVersionCode, updateTitle, updateBody } =
    useForceUpdateRequired();
  return (
    <ForceUpdateModal
      visible={needsUpdate}
      installedVersionCode={installedVersionCode}
      minRequiredVersionCode={minRequiredVersionCode}
      title={updateTitle}
      body={updateBody}
    />
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ApolloProvider client={apolloClient}>
          <AuthProvider>
            <ThemeProvider>
              <TabBarProvider>
                <SoundProvider>
                  <NotificationProvider>
                    <KeyboardProvider>
                      <ThemedRoot>
                        <CoinsProvider>
                          <AppServices />
                          <AppStatusBar />
                          <NotificationResponseHandler />
                          <BadgeSync />
                          <GlobalNotificationSubscription />
                          <NotificationResilience />
                          <GlobalMessageSubscription />
                          <Stack screenOptions={{ headerShown: false }} />
                          <OfflineBanner />
                          <InAppNotificationBanner />
                          <WorldCupFloating />
                          <AuthExpiredGate />
                          <ForceUpdateGate />
                        </CoinsProvider>
                      </ThemedRoot>
                    </KeyboardProvider>
                  </NotificationProvider>
                </SoundProvider>
              </TabBarProvider>
            </ThemeProvider>
          </AuthProvider>
        </ApolloProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
