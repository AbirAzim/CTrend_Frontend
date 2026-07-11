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
  MESSAGE_READ_SUB,
  MESSAGE_REACTION_CHANGED,
  PRESENCE_CHANGED,
  REACT_MESSAGE,
  START_DIRECT_CONVERSATION,
} from "../graphql/messages";
import { useAuth } from "./AuthContext";
import { playMessageSound } from "../lib/notificationSound";
import { MODERATOR_BRAND_NAME } from "../lib/moderatorBrand";

const MODERATOR_SENDER_ID = "moderator";

function conversationStubFromMessage(
  msg: Message,
  openWindowIds: string[],
): Conversation {
  const isModerator = msg.senderId === MODERATOR_SENDER_ID;
  return {
    id: msg.conversationId,
    type: isModerator ? "moderator" : "direct",
    name: isModerator ? MODERATOR_BRAND_NAME : msg.senderName || "Chat",
    participantIds: [],
    participants: [
      {
        id: msg.senderId,
        displayName: msg.senderName || (isModerator ? MODERATOR_BRAND_NAME : "User"),
        avatarUrl: msg.senderAvatar ?? (isModerator ? "/logo.png" : null),
        online: false,
      },
    ],
    lastMessageText: msg.text || "📷 Image",
    lastMessageAt: msg.createdAt,
    unreadCount: openWindowIds.includes(msg.conversationId) ? 0 : 1,
    createdAt: msg.createdAt,
  };
}

export type Participant = {
  id: string;
  displayName: string;
  /** For @mention autocomplete — moderator's synthetic participant has none. */
  username?: string | null;
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

export type MessageReactionCount = { emoji: string; count: number };

export type ReplyPreview = {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  text: string;
  imageUrl?: string | null;
  forwarded?: boolean | null;
  readBy: { userId: string; readAt: string }[];
  reactions: MessageReactionCount[];
  viewerReaction?: string | null;
  replyTo?: ReplyPreview | null;
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
  sendMessage: (
    conversationId: string,
    text: string,
    imageUrl?: string,
    replyToId?: string | null,
    forwarded?: boolean,
  ) => Promise<void>;
  reactMessage: (messageId: string, conversationId: string, emoji: string | null) => Promise<void>;
  markRead: (conversationId: string) => void;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  prependMessages: (conversationId: string, msgs: Message[]) => void;
  ensureConversation: (convo: Conversation) => void;
  refetchConversations: () => void;
  startDirectConversation: (userId: string) => Promise<void>;
  closeAllMessenger: () => void;
};

const MessengerContext = createContext<MessengerContextValue | null>(null);

const MAX_OPEN_WINDOWS = 3;

function normalizeMessage(msg: Message): Message {
  return {
    ...msg,
    reactions: msg.reactions ?? [],
    viewerReaction: msg.viewerReaction ?? null,
  };
}

function applyOptimisticMessageReaction(
  msg: Message,
  nextEmoji: string | null,
): Message {
  const prevEmoji = msg.viewerReaction ?? null;
  if (prevEmoji === nextEmoji) return msg;

  const reactionMap = new Map(msg.reactions.map((r) => [r.emoji, r.count]));

  if (prevEmoji) {
    const prevCount = reactionMap.get(prevEmoji) ?? 0;
    if (prevCount <= 1) reactionMap.delete(prevEmoji);
    else reactionMap.set(prevEmoji, prevCount - 1);
  }

  if (nextEmoji) {
    reactionMap.set(nextEmoji, (reactionMap.get(nextEmoji) ?? 0) + 1);
  }

  const reactions = [...reactionMap.entries()].map(([emoji, count]) => ({
    emoji,
    count,
  }));

  return {
    ...msg,
    viewerReaction: nextEmoji,
    reactions,
  };
}

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
  const [reactMessageMut] = useMutation(REACT_MESSAGE);
  const [markReadMut] = useMutation(MARK_CONVERSATION_READ);
  const [setTypingMut] = useMutation(SET_TYPING);
  const [startDirectMut] = useMutation(START_DIRECT_CONVERSATION);

  useSubscription(MESSAGE_RECEIVED, {
    skip: !isAuthenticated,
    onData({ data }) {
      const raw = data.data?.messageReceived as Message | undefined;
      if (!raw) return;
      const msg = normalizeMessage(raw);
      setMessagesByConvo((prev) => {
        const existing = prev[msg.conversationId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [msg.conversationId]: [...existing, msg] };
      });
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === msg.conversationId);
        if (!exists) {
          void refetchConversations();
          return [conversationStubFromMessage(msg, openWindowIds), ...prev];
        }
        return prev.map((c) =>
          c.id === msg.conversationId
            ? {
                ...c,
                lastMessageText: msg.text || "📷 Image",
                lastMessageAt: msg.createdAt,
                unreadCount: openWindowIds.includes(c.id) ? 0 : c.unreadCount + 1,
              }
            : c,
        );
      });
      // Play a soft ping for messages from other users
      if (msg.senderId !== authUser?.id) {
        playMessageSound();
      }
    },
  });

  // Real-time "Seen" — fires when any participant marks a conversation read.
  // We patch readBy on all messages in that convo so the sender's Seen badge
  // appears instantly without waiting for a full refetch.
  useSubscription(MESSAGE_REACTION_CHANGED, {
    skip: !isAuthenticated,
    onData({ data }) {
      const ev = data.data?.messageReactionChanged as
        | {
            messageId: string;
            conversationId: string;
            reactions: MessageReactionCount[];
            actorUserId: string;
            actorEmoji: string | null;
          }
        | undefined;
      if (!ev) return;
      setMessagesByConvo((prev) => {
        const msgs = prev[ev.conversationId];
        if (!msgs) return prev;
        const updated = msgs.map((m) => {
          if (m.id !== ev.messageId) return m;
          return {
            ...m,
            reactions: ev.reactions,
            viewerReaction:
              ev.actorUserId === authUser?.id ? ev.actorEmoji : m.viewerReaction,
          };
        });
        return { ...prev, [ev.conversationId]: updated };
      });
    },
  });

  useSubscription(MESSAGE_READ_SUB, {
    skip: !isAuthenticated,
    onData({ data }) {
      const ev = data.data?.messageRead as
        | { conversationId: string; userId: string; readAt: string }
        | undefined;
      if (!ev) return;
      setMessagesByConvo((prev) => {
        const msgs = prev[ev.conversationId];
        if (!msgs) return prev;
        const updated = msgs.map((m) => {
          // Only add a readBy entry on messages NOT sent by the reader,
          // and only if that reader isn't already in the readBy list.
          if (
            m.senderId === ev.userId ||
            m.readBy.some((r) => r.userId === ev.userId)
          ) {
            return m;
          }
          return {
            ...m,
            readBy: [...m.readBy, { userId: ev.userId, readAt: ev.readAt }],
          };
        });
        return { ...prev, [ev.conversationId]: updated };
      });
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
      return [conversationId, ...prev].slice(0, MAX_OPEN_WINDOWS);
    });
    setPanelOpen(true);
    // Optimistically zero the unread count the instant the user opens the
    // chat — the FAB badge drops immediately without waiting for ChatWindow's
    // useEffect → markRead mutation → setState round-trip.
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    );
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setOpenWindowIds((prev) => prev.filter((id) => id !== conversationId));
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      text: string,
      imageUrl?: string,
      replyToId?: string | null,
      forwarded?: boolean,
    ) => {
      const { data } = await sendMessageMut({
        variables: { conversationId, text, imageUrl, replyToId: replyToId ?? null, forwarded: forwarded ?? false },
      });
      const raw = data?.sendMessage as Message | undefined;
      if (!raw) return;
      const msg = normalizeMessage(raw);
      setMessagesByConvo((prev) => {
        const existing = prev[conversationId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return prev;
        return { ...prev, [conversationId]: [...existing, msg] };
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessageText: msg.text || "📷 Image",
                lastMessageAt: msg.createdAt,
              }
            : c,
        ),
      );
    },
    [sendMessageMut],
  );

  const reactMessage = useCallback(
    async (messageId: string, conversationId: string, emoji: string | null) => {
      setMessagesByConvo((prev) => {
        const msgs = prev[conversationId];
        if (!msgs) return prev;
        const updated = msgs.map((m) => {
          if (m.id !== messageId) return m;
          return applyOptimisticMessageReaction(m, emoji);
        });
        return { ...prev, [conversationId]: updated };
      });
      try {
        const { data } = await reactMessageMut({
          variables: { messageId, emoji },
        });
        const server = data?.reactMessage as
          | Pick<Message, "id" | "reactions" | "viewerReaction">
          | undefined;
        if (!server) return;
        setMessagesByConvo((prev) => {
          const msgs = prev[conversationId];
          if (!msgs) return prev;
          const updated = msgs.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  reactions: server.reactions ?? m.reactions,
                  viewerReaction: server.viewerReaction ?? null,
                }
              : m,
          );
          return { ...prev, [conversationId]: updated };
        });
      } catch {
        void refetchConversations();
      }
    },
    [reactMessageMut, refetchConversations],
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
        const newMsgs = msgs
          .filter((m) => !existingIds.has(m.id))
          .map(normalizeMessage);
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

  const closeAllMessenger = useCallback(() => {
    setPanelOpen(false);
    setOpenWindowIds([]);
  }, []);

  const startDirectConversation = useCallback(async (userId: string) => {
    const { data } = await startDirectMut({ variables: { userId } });
    const convo = data?.startDirectConversation as Conversation | undefined;
    if (!convo) return;
    setConversations((prev) =>
      prev.some((c) => c.id === convo.id) ? prev : [convo, ...prev],
    );
    setOpenWindowIds((prev) => {
      if (prev.includes(convo.id)) return prev;
      return [convo.id, ...prev].slice(0, MAX_OPEN_WINDOWS);
    });
    setPanelOpen(false);
  }, [startDirectMut]);

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
      reactMessage,
      markRead,
      setTyping,
      prependMessages,
      ensureConversation,
      refetchConversations,
      startDirectConversation,
      closeAllMessenger,
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
      closeAllMessenger,
      sendMessage,
      reactMessage,
      markRead,
      setTyping,
      prependMessages,
      ensureConversation,
      refetchConversations,
      startDirectConversation,
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
