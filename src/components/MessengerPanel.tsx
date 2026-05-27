import { useEffect, useRef, useState } from "react";
import { useLazyQuery, useSubscription } from "@apollo/client";
import { useMessenger, type Conversation, type Message } from "../context/MessengerContext";
import { useAuth } from "../context/AuthContext";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { useImageUpload } from "../lib/useImageUpload";
import {
  GET_MESSAGES,
  TYPING_INDICATOR_SUB,
} from "../graphql/messages";

// ── Emoji picker ────────────────────────────────────────────────────
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

// ── Image bubble ─────────────────────────────────────────────────────
function ImageBubble({ src, caption }: { src: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="cw-bubble-img-wrap">
        <img
          src={src}
          alt="Shared image"
          className="cw-bubble-img"
          onClick={() => setOpen(true)}
          loading="lazy"
        />
        {caption && <p className="cw-bubble-caption">{caption}</p>}
      </div>
      {open && (
        <div className="cw-lightbox" onClick={() => setOpen(false)}>
          <button
            type="button"
            className="cw-lightbox-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >×</button>
          <img src={src} alt="Full size" className="cw-lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// ── Chat Window ──────────────────────────────────────────────────────
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

  // Image state
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyFetched = useRef(false);

  const [fetchMessages] = useLazyQuery(GET_MESSAGES, { fetchPolicy: "no-cache" });
  const { uploadImage } = useImageUpload();

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

  useEffect(() => {
    if (!historyFetched.current) {
      historyFetched.current = true;
      setLoadingHistory(true);
      fetchMessages({ variables: { conversationId: conversation.id, skip: 0, take: 30 } })
        .then(({ data }) => {
          if (data?.messages) {
            prependMessages(conversation.id, data.messages as Message[]);
            if ((data.messages as Message[]).length < 30) setHasMore(false);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));
    }
    markRead(conversation.id);
    void refetchConversations();
  }, [conversation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, minimized]);

  // Mark as read whenever new messages land while the window is visible.
  // This covers the case where the window is already open when a message arrives
  // — the conversation.id effect above only fires on window open, not on new msgs.
  useEffect(() => {
    if (!minimized && messages.length > 0) {
      markRead(conversation.id);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // revoke old preview
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
    setUploadError(null);
    // reset so the same file can be re-picked
    e.target.value = "";
  }

  function removePendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setUploadError(null);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed && !pendingImage) return;

    setText("");
    setShowEmoji(false);
    setTyping(conversation.id, false);

    if (pendingImage) {
      setUploading(true);
      setUploadError(null);
      try {
        // Upload via backend REST endpoint (POST /uploads/image).
        // This avoids any CORS issues with direct R2 presigned URLs in production.
        const publicUrl = await uploadImage(pendingImage.file);

        await sendMessage(conversation.id, trimmed, publicUrl);

        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Image upload failed.";
        setUploadError(msg + " Please try again.");
        setText(trimmed); // restore caption text
      } finally {
        setUploading(false);
      }
    } else {
      await sendMessage(conversation.id, trimmed);
    }
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

  const canSend = (text.trim().length > 0 || pendingImage !== null) && !uploading;

  return (
    <div className={`cw-window${minimized ? " cw-window--min" : ""}`}>
      {/* Header */}
      <div className="cw-header" onClick={() => setMinimized((v) => !v)}>
        <div className="cw-header-avatar-wrap">
          <div className="cw-header-avatar">
            {otherParticipants[0]?.avatarUrl ? (
              <img src={otherParticipants[0].avatarUrl} alt="" />
            ) : (
              <span>{(otherParticipants[0]?.displayName ?? "?")[0].toUpperCase()}</span>
            )}
          </div>
          {isOnline && <span className="cw-online-dot" aria-label="Online" />}
        </div>
        <div className="cw-header-meta">
          <span className="cw-header-name">{windowTitle}</span>
          <span className={`cw-header-status${isOnline ? " cw-header-status--online" : ""}`}>
            {isOnline ? "● Active now" : "○ Offline"}
          </span>
        </div>
        <div className="cw-header-actions">
          <button
            type="button"
            className="cw-header-btn"
            aria-label={minimized ? "Expand" : "Minimise"}
            onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="13" height="13" aria-hidden>
              {minimized ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
            </svg>
          </button>
          <button
            type="button"
            className="cw-header-btn cw-header-btn--close"
            aria-label="Close chat"
            onClick={(e) => { e.stopPropagation(); closeChat(conversation.id); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="13" height="13" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Message list */}
          <div
            className="cw-body"
            ref={scrollRef}
            onClick={() => markRead(conversation.id)}
            onScroll={(e) => {
              if ((e.target as HTMLDivElement).scrollTop < 50) void loadOlder();
            }}
          >
            {loadingHistory && (
              <div className="cw-loading">
                <span className="cw-loading-dots"><span/><span/><span/></span>
              </div>
            )}
            {!hasMore && messages.length > 0 && (
              <p className="cw-no-more">Beginning of conversation</p>
            )}

            {messages.map((msg, i) => {
              const isMine = msg.senderId === user?.id;
              const prevMsg = messages[i - 1];
              const nextMsg = messages[i + 1];
              const isGroupStart = !prevMsg || prevMsg.senderId !== msg.senderId;
              const isGroupEnd   = !nextMsg || nextMsg.senderId !== msg.senderId;
              const isLast = i === messages.length - 1;
              const seenByOther = isMine && msg.readBy.some((r) => r.userId !== user?.id);
              const showSeen = isLast && isMine && (seenByOther || mySeenBy?.id === msg.id);
              const hasImage = Boolean(msg.imageUrl);
              const hasText = Boolean(msg.text?.trim());

              return (
                <div
                  key={msg.id}
                  className={[
                    "cw-msg",
                    isMine ? "cw-msg--mine" : "cw-msg--theirs",
                    !isGroupStart ? "cw-msg--grouped" : "",
                    isGroupEnd   ? "cw-msg--group-end" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {/* Avatar — only on last message of a group (theirs) */}
                  {!isMine && (
                    <div className={`cw-msg-avatar${!isGroupEnd ? " cw-msg-avatar--hidden" : ""}`}>
                      {msg.senderAvatar ? (
                        <img src={msg.senderAvatar} alt="" />
                      ) : (
                        <span>{(msg.senderName ?? "?")[0].toUpperCase()}</span>
                      )}
                    </div>
                  )}

                  <div className="cw-msg-content">
                    {/* Image-only or image+caption bubble */}
                    {hasImage ? (
                      <div className={[
                        "cw-bubble",
                        "cw-bubble--img",
                        isMine ? "cw-bubble--mine" : "cw-bubble--theirs",
                        isGroupStart && !isMine ? "cw-bubble--tail-left"  : "",
                        isGroupStart &&  isMine ? "cw-bubble--tail-right" : "",
                      ].filter(Boolean).join(" ")}>
                        <ImageBubble src={msg.imageUrl!} caption={hasText ? msg.text : undefined} />
                        <span className="cw-bubble-time">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>
                    ) : (
                      /* Text-only bubble */
                      <div className={[
                        "cw-bubble",
                        isMine ? "cw-bubble--mine" : "cw-bubble--theirs",
                        isGroupStart && !isMine ? "cw-bubble--tail-left"  : "",
                        isGroupStart &&  isMine ? "cw-bubble--tail-right" : "",
                      ].filter(Boolean).join(" ")}>
                        {msg.text}
                        <span className="cw-bubble-time">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {showSeen && (
                      <span className="cw-seen">
                        {otherParticipants[0]?.avatarUrl ? (
                          <img src={otherParticipants[0].avatarUrl} alt="Seen" className="cw-seen-avatar" />
                        ) : (
                          <span className="cw-seen-initial">
                            {(otherParticipants[0]?.displayName ?? "?")[0].toUpperCase()}
                          </span>
                        )}
                        Seen
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingUsers.size > 0 && (
              <div className="cw-msg cw-msg--theirs">
                <div className="cw-msg-avatar">
                  {otherParticipants[0]?.avatarUrl ? (
                    <img src={otherParticipants[0].avatarUrl} alt="" />
                  ) : (
                    <span>{(otherParticipants[0]?.displayName ?? "?")[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="cw-typing-bubble">
                  <span className="cw-typing-dot" /><span className="cw-typing-dot" /><span className="cw-typing-dot" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Pending image preview */}
          {pendingImage && (
            <div className="cw-img-preview-bar">
              <div className="cw-img-preview-thumb-wrap">
                <img
                  src={pendingImage.previewUrl}
                  alt="Preview"
                  className="cw-img-preview-thumb"
                />
                {uploading && (
                  <div className="cw-img-preview-spinner">
                    <span className="cw-upload-spinner" />
                  </div>
                )}
              </div>
              <div className="cw-img-preview-meta">
                <span className="cw-img-preview-name">{pendingImage.file.name}</span>
                <span className="cw-img-preview-size">
                  {(pendingImage.file.size / 1024).toFixed(0)} KB
                </span>
                {uploadError && <span className="cw-img-preview-error">{uploadError}</span>}
              </div>
              {!uploading && (
                <button
                  type="button"
                  className="cw-img-preview-remove"
                  aria-label="Remove image"
                  onClick={removePendingImage}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <EmojiPicker onPick={(e) => { setText((t) => t + e); inputRef.current?.focus(); }} />
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            style={{ display: "none" }}
            onChange={handlePickImage}
            aria-label="Choose image"
          />

          {/* Footer */}
          <div className="cw-footer">
            <button
              type="button"
              className={`cw-emoji-toggle${showEmoji ? " cw-emoji-toggle--active" : ""}`}
              aria-label="Emoji"
              onClick={() => setShowEmoji((v) => !v)}
            >
              {showEmoji ? "😊" : "🙂"}
            </button>

            {/* Image attach button */}
            <button
              type="button"
              className={`cw-img-btn${pendingImage ? " cw-img-btn--active" : ""}`}
              aria-label="Attach image"
              title="Send image"
              onClick={() => { setShowEmoji(false); fileInputRef.current?.click(); }}
              disabled={uploading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>

            <div className="cw-input-wrap">
              <textarea
                ref={inputRef}
                className="cw-input"
                rows={1}
                value={text}
                placeholder={pendingImage ? "Add a caption…" : "Message…"}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={uploading}
              />
            </div>
            <button
              type="button"
              className={`cw-send-btn${canSend ? " cw-send-btn--active" : ""}`}
              aria-label="Send"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              {uploading ? (
                <span className="cw-upload-spinner cw-upload-spinner--sm" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden>
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Messenger Panel ──────────────────────────────────────────────────
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

  const [search, setSearch] = useState("");

  if (!isAuthenticated) return null;

  const openConversations = openWindowIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter(Boolean) as Conversation[];

  const filteredConvos = search.trim()
    ? conversations.filter((c) => {
        const others = c.participants.filter((p) => p.id !== user?.id);
        const name = c.name || others.map((p) => p.displayName).join(", ") || "";
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : conversations;

  return (
    <div className="mp-root">
      {/* Open chat windows */}
      <div className="mp-windows">
        {openConversations.map((convo) => (
          <ChatWindow key={convo.id} conversation={convo} />
        ))}
      </div>

      {/* FAB + conversation panel */}
      <div className="mp-panel-wrap">
        {/* FAB toggle */}
        <button
          type="button"
          className={`mp-toggle-btn${panelOpen ? " mp-toggle-btn--open" : ""}`}
          aria-label={`Messenger${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
          onClick={() => { setPanelOpen(!panelOpen); if (!panelOpen) refetchConversations(); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {totalUnread > 0 && (
            <span className="mp-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
          )}
        </button>

        {panelOpen && (
          <div className="mp-panel">
            {/* Panel header */}
            <div className="mp-panel-header">
              <span className="mp-panel-title">Messages</span>
              <div className="mp-panel-header-actions">
                {totalUnread > 0 && (
                  <span className="mp-panel-unread-chip">{totalUnread} new</span>
                )}
                <button
                  type="button"
                  className="mp-panel-close-btn"
                  aria-label="Close"
                  onClick={() => setPanelOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="mp-search-wrap">
              <svg className="mp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14" aria-hidden>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search"
                className="mp-search-input"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Conversation list */}
            {filteredConvos.length === 0 ? (
              <div className="mp-empty">
                {search.trim() ? (
                  <p>No conversations match "<strong>{search}</strong>"</p>
                ) : (
                  <p>No conversations yet.<br />Visit a friend's profile to start chatting.</p>
                )}
              </div>
            ) : (
              <ul className="mp-list">
                {filteredConvos.map((c) => {
                  const others = c.participants.filter((p) => p.id !== user?.id);
                  const name = c.name || others.map((p) => p.displayName).join(", ") || "Chat";
                  const isOnline = others.some((p) => onlineUserIds.has(p.id));
                  const initial = (name[0] ?? "?").toUpperCase();
                  const timeAgo = c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : "";
                  return (
                    <li
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      className={`mp-item${c.unreadCount > 0 ? " mp-item--unread" : ""}${openWindowIds.includes(c.id) ? " mp-item--active" : ""}`}
                      onClick={() => { openChat(c.id); setPanelOpen(false); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openChat(c.id); setPanelOpen(false); } }}
                    >
                      <div className="mp-item-avatar-wrap">
                        <div className="mp-item-avatar">
                          {others[0]?.avatarUrl ? (
                            <img src={others[0].avatarUrl} alt="" />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </div>
                        {isOnline && <span className="mp-online-dot" aria-label="Online" />}
                      </div>

                      <div className="mp-item-meta">
                        <div className="mp-item-row">
                          <span className="mp-item-name">{name}</span>
                          {timeAgo && <span className="mp-item-time">{timeAgo}</span>}
                        </div>
                        {c.lastMessageText && (
                          <span className="mp-item-last">
                            {c.lastMessageText.length > 38
                              ? c.lastMessageText.slice(0, 38) + "…"
                              : c.lastMessageText}
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
