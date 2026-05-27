import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import {
  MY_NOTIFICATIONS,
  MARK_NOTIFICATION_READ,
  MARK_ALL_NOTIFICATIONS_READ,
  NEW_NOTIFICATION_SUB,
} from "../graphql/notifications";
import { useAuth } from "./AuthContext";
import { playNotificationChime } from "../lib/notificationSound";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId?: string | null;
  referenceType?: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
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
    onCompleted(data) {
      setNotifications(data?.myNotifications?.items ?? []);
    },
  });

  const [markReadMut] = useMutation(MARK_NOTIFICATION_READ);
  const [markAllReadMut] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  useSubscription(NEW_NOTIFICATION_SUB, {
    skip: !isAuthenticated,
    onData({ data }) {
      const n = data.data?.newNotification as NotificationItem | undefined;
      if (!n) return;
      setNotifications((prev) => [n, ...prev]);
      // Play a chime for every new real-time notification
      playNotificationChime();
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

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, unreadCount, loading, markRead, markAllRead, refetch }),
    [notifications, unreadCount, loading, markRead, markAllRead, refetch],
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
