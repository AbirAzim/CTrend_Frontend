import { useEffect, useRef, useState } from "react";
import { useLazyQuery, useSubscription } from "@apollo/client";
import { useMessenger, type Conversation, type Message } from "../context/MessengerContext";
import { useAuth } from "../context/AuthContext";
import {
  GET_MESSAGES,
  TYPING_INDICATOR_SUB,
} from "../graphql/messages";

// ── Emoji picker (simple inline set) ────────────────────────────
const EMOJI_SET = ["😀","😂","❤️","👍","👎","😭","😍","🔥","🎉","😊","🙏","😎","🤔","😅","🥳","💯","👏","😢","😡","✨"];

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div className="msg-emoji-picker">
      {EMOJI_SET.map((e) => (
        <button key={e} type="button" className="msg-emoji-btn" onClick={() => onPick(e)}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ── Chat Window ──────────────────────────────────────────────────
function ChatWindow({ conversation }: { conversation: Conversation }) {
  const { user } = useAuth();
  const {
    messagesByConvo,
    sendMessage,
    markRead,
    setTyping,
    prependMessages,
    closeChat,
    refetchConversations,
    onlineUserIds,
  } = useMessenger();

  const messages = messagesByConvo[conversation.id] ?? [];
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [fetchMessages] = useLazyQuery(GET_MESSAGES, {
    fetchPolicy: "network-only",
  });

  // Typing indicator subscription per window
  useSubscription(TYPING_INDICATOR_SUB, {
    variables: { conversationId: conversation.id },
    onData({ data }) {
      const ev = data.data?.typingIndicator as
        | { conversationId: string; userId: string; isTyping: boolean }
        | undefined;
      if (!ev || ev.userId === user?.id) return;
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (ev.isTyping) next.add(ev.userId);
        else next.delete(ev.userId);
        return next;
      });
    },
  });

  // Load initial messages and mark read on open
  useEffect(() => {
    if (messages.length === 0) {
      setLoadingHistory(true);
      fetchMessages({ variables: { conversationId: conversation.id, skip: 0, take: 30 } })
        .then(({ data }) => {
          if (data?.messages) {
            prependMessages(conversation.id, data.messages as Message[]);
            if ((data.messages as Message[]).length < 30) setHasMore(false);
          }
        })
        .finally(() => setLoadingHistory(false));
    }
    markRead(conversation.id);
    void refetchConversations();
  }, [conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, minimized]);

  async function loadOlder() {
    if (loadingHistory || !hasMore) return;
    setLoadingHistory(true);
    const { data } = await fetchMessages({
      variables: { conversationId: conversation.id, skip: messages.length, take: 20 },
    });
    if (data?.messages) {
      prependMessages(conversation.id, data.messages as Message[]);
      if ((data.messages as Message[]).length < 20) setHasMore(false);
    }
    setLoadingHistory(false);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    setShowEmoji(false);
    setTyping(conversation.id, false);
    await sendMessage(conversation.id, trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleInput(val: string) {
    setText(val);
    setTyping(conversation.id, val.length > 0);
  }

  const otherParticipants = conversation.participants.filter((p) => p.id !== user?.id);
  const windowTitle =
    conversation.name ||
    otherParticipants.map((p) => p.displayName).join(", ") ||
    "Chat";
  const isOnline = otherParticipants.some((p) => onlineUserIds.has(p.id));

  const mySeenBy = messages
    .filter((m) => m.senderId === user?.id)
    .reverse()
    .find((m) => m.readBy.some((r) => r.userId !== user?.id));

  return (
    <div className={`cw-window${minimized ? " cw-window--min" : ""}`}>
      {/* Header */}
      <div className="cw-header" onClick={() => setMinimized((v) => !v)}>
        <div className="cw-header-avatar">
          {otherParticipants[0]?.avatarUrl ? (
            <img src={otherParticipants[0].avatarUrl} alt="" />
          ) : (
            <span>{(otherParticipants[0]?.displayName ?? "?")[0].toUpperCase()}</span>
          )}
          {isOnline && <span className="cw-online-dot" aria-hidden />}
        </div>
        <div className="cw-header-meta">
          <span className="cw-header-name">{windowTitle}</span>
          <span className="cw-header-status">{isOnline ? "Active now" : "Offline"}</span>
        </div>
        <button
          type="button"
          className="cw-close-btn"
          aria-label="Close chat"
          onClick={(e) => { e.stopPropagation(); closeChat(conversation.id); }}
        >
          ✕
        </button>
      </div>

      {!minimized && (
        <>
          {/* Message list */}
          <div className="cw-body" ref={scrollRef} onScroll={(e) => {
            if ((e.target as HTMLDivElement).scrollTop < 50) void loadOlder();
          }}>
            {loadingHistory && <p className="cw-loading">Loading…</p>}
            {!hasMore && messages.length > 0 && (
              <p className="cw-no-more">Beginning of conversation</p>
            )}
            {messages.map((msg, i) => {
              const isMine = msg.senderId === user?.id;
              const isLast = i === messages.length - 1;
              const seenByOther =
                isMine && msg.readBy.some((r) => r.userId !== user?.id);
              const showSeen =
                isLast && isMine && (seenByOther || mySeenBy?.id === msg.id);
              return (
                <div
                  key={msg.id}
                  className={`cw-msg${isMine ? " cw-msg--mine" : " cw-msg--theirs"}`}
                >
                  {!isMine && (
                    <div className="cw-msg-avatar">
                      {msg.senderAvatar ? (
                        <img src={msg.senderAvatar} alt="" />
                      ) : (
                        <span>{(msg.senderName ?? "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                  )}
                  <div className="cw-msg-content">
                    <div className="cw-bubble">{msg.text}</div>
                    {showSeen && <span className="cw-seen">Seen</span>}
                  </div>
                </div>
              );
            })}
            {typingUsers.size > 0 && (
              <div className="cw-typing-indicator">
                <span className="cw-typing-dots">
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Emoji picker */}
          {showEmoji && (
            <EmojiPicker
              onPick={(e) => {
                setText((t) => t + e);
                inputRef.current?.focus();
              }}
            />
          )}

          {/* Input */}
          <div className="cw-footer">
            <button
              type="button"
              className="cw-emoji-toggle"
              aria-label="Emoji"
              onClick={() => setShowEmoji((v) => !v)}
            >
              😊
            </button>
            <textarea
              ref={inputRef}
              className="cw-input"
              rows={1}
              value={text}
              placeholder="Aa"
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="cw-send-btn"
              aria-label="Send"
              disabled={!text.trim()}
              onClick={() => void handleSend()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Messenger Panel (conversation list + open chat windows) ─────
export function MessengerPanel() {
  const { isAuthenticated, user } = useAuth();
  const {
    conversations,
    openWindowIds,
    onlineUserIds,
    totalUnread,
    panelOpen,
    setPanelOpen,
    openChat,
    refetchConversations,
  } = useMessenger();
  if (!isAuthenticated) return null;

  const openConversations = openWindowIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as Conversation[];

  return (
    <div className="mp-root">
      {/* Open chat windows (right to left) */}
      <div className="mp-windows">
        {openConversations.map((convo) => (
          <ChatWindow key={convo.id} conversation={convo} />
        ))}
      </div>

      {/* Conversation list panel */}
      <div className="mp-panel-wrap">
        <button
          type="button"
          className="mp-toggle-btn"
          aria-label={`Messenger${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
          onClick={() => { setPanelOpen(!panelOpen); if (!panelOpen) refetchConversations(); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          {totalUnread > 0 && (
            <span className="mp-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
          )}
        </button>

        {panelOpen && (
          <div className="mp-panel">
            <div className="mp-panel-header">
              <span className="mp-panel-title">Messages</span>
            </div>
            {conversations.length === 0 ? (
              <p className="mp-empty">No conversations yet.<br />Go to a friend's profile and start a chat.</p>
            ) : (
              <ul className="mp-list">
                {conversations.map((c) => {
                  const others = c.participants.filter((p) => p.id !== user?.id);
                  const name = c.name || others.map((p) => p.displayName).join(", ") || "Chat";
                  const isOnline = others.some((p) => onlineUserIds.has(p.id));
                  return (
                    <li
                      key={c.id}
                      className={`mp-item${c.unreadCount > 0 ? " mp-item--unread" : ""}`}
                      onClick={() => { openChat(c.id); setPanelOpen(false); }}
                    >
                      <div className="mp-item-avatar">
                        {others[0]?.avatarUrl ? (
                          <img src={others[0].avatarUrl} alt="" />
                        ) : (
                          <span>{(name[0] ?? "?").toUpperCase()}</span>
                        )}
                        {isOnline && <span className="mp-online-dot" aria-hidden />}
                      </div>
                      <div className="mp-item-meta">
                        <span className="mp-item-name">{name}</span>
                        {c.lastMessageText && (
                          <span className="mp-item-last">
                            {c.lastMessageText.slice(0, 35)}
                            {c.lastMessageText.length > 35 ? "…" : ""}
                          </span>
                        )}
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="mp-item-badge">{c.unreadCount}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
