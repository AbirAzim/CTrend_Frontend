import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import {
  MY_NOTIFICATIONS,
  MARK_NOTIFICATION_READ,
  MARK_ALL_NOTIFICATIONS_READ,
  ARCHIVE_NOTIFICATION,
  NEW_NOTIFICATION_SUB,
} from "../graphql/notifications";
import { onWsConnected, reconnectWs } from "../lib/apolloClient";
import { useAuth } from "./AuthContext";
import { playNotificationChime } from "../lib/notificationSound";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId?: string | null;
  referenceType?: string | null;
  postId?: string | null;
  actorCount?: number | null;
  latestActorId?: string | null;
  latestActorName?: string | null;
  latestActorAvatar?: string | null;
  commentId?: string | null;
  read: boolean;
  archived?: boolean;
  createdAt: string;
};

type NotificationContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  archiveNotification: (id: string) => void;
  updateNotification: (id: string, patch: Partial<NotificationItem>) => void;
  refetch: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const { loading, refetch } = useQuery(MY_NOTIFICATIONS, {
    skip: !isAuthenticated,
    variables: { skip: 0, take: 30 },
    fetchPolicy: "cache-and-network",
    // 25-second poll fallback so the bell stays fresh on Safari / background
    // tabs / flaky WS connections. The subscription handler still fires the
    // chime instantly when the WS path works.
    pollInterval: 25_000,
    onCompleted(data) {
      // Exclude MESSAGE-type entries — those are surfaced by the messenger
      // FAB badge, not the bell icon.
      const items: NotificationItem[] = data?.myNotifications?.items ?? [];
      setNotifications(
        items.filter((n) => n.type !== "MESSAGE" && !n.archived),
      );
    },
  });

  const [markReadMut] = useMutation(MARK_NOTIFICATION_READ);
  const [markAllReadMut] = useMutation(MARK_ALL_NOTIFICATIONS_READ);
  const [archiveMut] = useMutation(ARCHIVE_NOTIFICATION);

  // WebSocket resilience — mirror MessengerContext so the bell doesn't miss
  // real-time hype/comment/vote notifications.
  //
  // The `newNotification` subscription is delivered only when the backend can
  // read the subscriber's id from the WS auth context. If the socket connected
  // before login (stale/no token) the server filter silently drops every
  // notification, and the in-process PubSub has no replay for events fired
  // during a reconnect gap. We therefore (1) force a fresh authenticated WS on
  // mount, (2) refetch whenever the WS (re)connects, and (3) refetch when the
  // tab returns to the foreground. Without this, the bell only recovered via
  // the 25s poll — so notifications "sometimes" never seemed to arrive.
  useEffect(() => {
    if (!isAuthenticated) return;

    reconnectWs();

    const unsubWs = onWsConnected(() => {
      void refetch();
    });

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsubWs();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, refetch]);

  useSubscription(NEW_NOTIFICATION_SUB, {
    skip: !isAuthenticated,
    onData({ data }) {
      const n = data.data?.newNotification as NotificationItem | undefined;
      // MESSAGE notifications belong to the messenger FAB, not the bell
      if (!n || n.type === "MESSAGE" || n.archived) return;
      let skipChime = false;
      setNotifications((prev) => {
        // Grouped notifications (POST_HYPE / POST_COMMENT) reuse the same id
        // when updated — replace the existing entry rather than duplicating
        const existingIdx = prev.findIndex((p) => p.id === n.id);
        if (existingIdx >= 0) {
          if (n.type === 'FRIEND_REQUEST') skipChime = true;
          const merged = { ...prev[existingIdx], ...n, read: n.read ?? false };
          return [merged, ...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1)];
        }
        return [n, ...prev];
      });
      if (!skipChime) playNotificationChime();
    },
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      void markReadMut({ variables: { id } });
    },
    [markReadMut],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllReadMut();
  }, [markAllReadMut]);

  const archiveNotification = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      void archiveMut({ variables: { id } });
    },
    [archiveMut],
  );

  const updateNotification = useCallback(
    (id: string, patch: Partial<NotificationItem>) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      );
    },
    [],
  );

  const refetchNotifications = useCallback(() => {
    void refetch({ fetchPolicy: "network-only" });
  }, [refetch]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      markRead,
      markAllRead,
      archiveNotification,
      updateNotification,
      refetch: refetchNotifications,
    }),
    [
      notifications,
      unreadCount,
      loading,
      markRead,
      markAllRead,
      archiveNotification,
      updateNotification,
      refetchNotifications,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}
