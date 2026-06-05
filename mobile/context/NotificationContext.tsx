import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type NotifToast = {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId: string | null;
  referenceType: string | null;
  postId: string | null;
  /** Actor profile image — omit for system/brand notifications. */
  actorAvatarUrl?: string | null;
};

type NotifCtx = {
  toast: NotifToast | null;
  showToast: (n: NotifToast) => void;
  dismissToast: () => void;
};

const NotificationContext = createContext<NotifCtx>({
  toast: null,
  showToast: () => {},
  dismissToast: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<NotifToast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const showToast = useCallback((n: NotifToast) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(n);
    timerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  return (
    <NotificationContext.Provider value={{ toast, showToast, dismissToast }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}
