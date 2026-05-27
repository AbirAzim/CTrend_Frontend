import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { onWsConnected, reconnectWs } from "../lib/apolloClient";
import {
  MY_CONVERSATIONS,
  SEND_MESSAGE,
  MARK_CONVERSATION_READ,
  SET_TYPING,
  MESSAGE_RECEIVED,
  PRESENCE_CHANGED,
} from "../graphql/messages";
import { useAuth } from "./AuthContext";
import { playMessageSound } from "../lib/notificationSound";

export type Participant = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  online: boolean;
};

export type Conversation = {
  id: string;
  type: string;
  name?: string | null;
  participantIds: string[];
  participants: Participant[];
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
  createdAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  readBy: { userId: string; readAt: string }[];
  createdAt: string;
};

type MessengerContextValue = {
  conversations: Conversation[];
  openWindowIds: string[];
  messagesByConvo: Record<string, Message[]>;
  onlineUserIds: Set<string>;
  totalUnread: number;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  markRead: (conversationId: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  prependMessages: (conversationId: string, msgs: Message[]) => void;
  ensureConversation: (convo: Conversation) => void;
  refetchConversations: () => void;
};

const MessengerContext = createContext<MessengerContextValue | null>(null);

const MAX_OPEN_WINDOWS = 3;

export function MessengerProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user: authUser } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [openWindowIds, setOpenWindowIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByConvo, setMessagesByConvo] = useState<Record<string, Message[]>>({});
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: convosData, refetch: refetchConversations } = useQuery(MY_CONVERSATIONS, {
    skip: !isAuthenticated,
    fetchPolicy: "network-only",
  });

  useEffect(() => {
    if (convosData?.myConversations) {
      const convos = convosData.myConversations as Conversation[];
      setConversations(convos);
      // Bootstrap onlineUserIds from fresh server data so we don't miss users
      // who came online before our presenceChanged subscription was established.
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        for (const c of convos) {
          for (const p of c.participants) {
            if (p.online) next.add(p.id);
          }
        }
        return next;
      });
    }
  }, [convosData]);

  // Refetch conversations (and therefore presence) every time the WS
  // (re)connects. This catches the "missed event" race: if the other user
  // came online before our subscription was established we'd never receive
  // their presenceChanged event, so the initial query result would be stale.
  useEffect(() => {
    if (!isAuthenticated) return;

    // Reconnect WS immediately so this session gets a fresh auth connection
    // (handles users who were already logged-in before this fix was deployed).
    reconnectWs();

    const unsubWs = onWsConnected(() => {
      void refetchConversations();
    });

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void refetchConversations();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      unsubWs();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sendMessageMut] = useMutation(SEND_MESSAGE);
  const [markReadMut] = useMutation(MARK_CONVERSATION_READ);
  const [setTypingMut] = useMutation(SET_TYPING);

  useSubscription(MESSAGE_RECEIVED, {
    skip: !isAuthenticated,
    onData({ data }) {
      const msg = data.data?.messageReceived as Message | undefined;
      if (!msg) return;
      setMessagesByConvo((prev) => {
        const existing = prev[msg.conversationId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [msg.conversationId]: [...existing, msg] };
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessageText: msg.text,
                lastMessageAt: msg.createdAt,
                unreadCount: openWindowIds.includes(c.id) ? 0 : c.unreadCount + 1,
              }
            : c,
        ),
      );
      // Play a soft ping for messages from other users
      if (msg.senderId !== authUser?.id) {
        playMessageSound();
      }
    },
  });

  useSubscription(PRESENCE_CHANGED, {
    skip: !isAuthenticated,
    onData({ data }) {
      const ev = data.data?.presenceChanged as { userId: string; online: boolean } | undefined;
      if (!ev) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (ev.online) next.add(ev.userId);
        else next.delete(ev.userId);
        return next;
      });
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          participants: c.participants.map((p) =>
            p.id === ev.userId ? { ...p, online: ev.online } : p,
          ),
        })),
      );
    },
  });

  const openChat = useCallback((conversationId: string) => {
    setOpenWindowIds((prev) => {
      if (prev.includes(conversationId)) return prev;
      const next = [conversationId, ...prev].slice(0, MAX_OPEN_WINDOWS);
      return next;
    });
    setPanelOpen(true);
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setOpenWindowIds((prev) => prev.filter((id) => id !== conversationId));
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, text: string) => {
      const { data } = await sendMessageMut({ variables: { conversationId, text } });
      const msg = data?.sendMessage as Message | undefined;
      if (!msg) return;
      setMessagesByConvo((prev) => {
        const existing = prev[conversationId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [conversationId]: [...existing, msg] };
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessageText: msg.text, lastMessageAt: msg.createdAt }
            : c,
        ),
      );
    },
    [sendMessageMut],
  );

  const markRead = useCallback(
    (conversationId: string) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c,
        ),
      );
      void markReadMut({ variables: { conversationId } });
    },
    [markReadMut],
  );

  const setTyping = useCallback(
    (conversationId: string, isTyping: boolean) => {
      if (typingTimers.current[conversationId]) {
        clearTimeout(typingTimers.current[conversationId]);
      }
      void setTypingMut({ variables: { conversationId, isTyping } });
      if (isTyping) {
        typingTimers.current[conversationId] = setTimeout(() => {
          void setTypingMut({ variables: { conversationId, isTyping: false } });
        }, 3000);
      }
    },
    [setTypingMut],
  );

  const prependMessages = useCallback(
    (conversationId: string, msgs: Message[]) => {
      setMessagesByConvo((prev) => {
        const existing = prev[conversationId] ?? [];
        const existingIds = new Set(existing.map((m) => m.id));
        const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
        return { ...prev, [conversationId]: [...newMsgs, ...existing] };
      });
    },
    [],
  );

  const ensureConversation = useCallback((convo: Conversation) => {
    setConversations((prev) => {
      if (prev.some((c) => c.id === convo.id)) return prev;
      return [convo, ...prev];
    });
  }, []);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [conversations],
  );

  const value = useMemo<MessengerContextValue>(
    () => ({
      conversations,
      openWindowIds,
      messagesByConvo,
      onlineUserIds,
      totalUnread,
      panelOpen,
      setPanelOpen,
      openChat,
      closeChat,
      sendMessage,
      markRead,
      setTyping,
      prependMessages,
      ensureConversation,
      refetchConversations,
    }),
    [
      conversations,
      openWindowIds,
      messagesByConvo,
      onlineUserIds,
      totalUnread,
      panelOpen,
      openChat,
      closeChat,
      sendMessage,
      markRead,
      setTyping,
      prependMessages,
      ensureConversation,
      refetchConversations,
    ],
  );

  return (
    <MessengerContext.Provider value={value}>
      {children}
    </MessengerContext.Provider>
  );
}

export function useMessenger(): MessengerContextValue {
  const ctx = useContext(MessengerContext);
  if (!ctx) throw new Error("useMessenger must be inside MessengerProvider");
  return ctx;
}
