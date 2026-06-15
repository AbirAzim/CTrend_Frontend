import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ADMIN_MODERATOR_MESSAGES,
  ADMIN_MODERATOR_MESSAGES_COUNT,
  ADMIN_MODERATOR_THREAD_MESSAGES,
  ADMIN_MODERATOR_THREADS,
  ADMIN_MODERATOR_USER_MESSAGE,
  LIST_USERS,
  MARK_MODERATOR_THREAD_READ,
  SEND_MODERATOR_MESSAGES,
} from "../graphql/admin";
import { REACT_MESSAGE, DELETE_MESSAGE, MESSAGE_REACTION_EMOJIS } from "../graphql/messages";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { playMessageSound } from "../lib/notificationSound";
import { useImageUpload } from "../lib/useImageUpload";
import { MODERATOR_BRAND_NAME } from "../lib/moderatorBrand";

const PAGE_SIZE = 25;

type UserRow = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

type ModeratorThreadRow = {
  conversationId: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  recipientProfileImageUrl?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  unreadFromUserCount: number;
};

type ModeratorMessageRow = {
  id: string;
  conversationId: string;
  text: string;
  imageUrl?: string | null;
  createdAt: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  sentByAdminId: string;
  sentByAdminName: string;
  sentByAdminEmail: string;
};

type ReplyPreviewRow = {
  messageId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string | null;
};

type ThreadMessageRow = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  sentByAdminId?: string | null;
  sentByAdminName?: string | null;
  sentByAdminEmail?: string | null;
  text: string;
  imageUrl?: string | null;
  deleted?: boolean | null;
  reactions?: { emoji: string; count: number }[] | null;
  viewerReaction?: string | null;
  replyTo?: ReplyPreviewRow | null;
  createdAt: string;
};

function AdminAvatar({
  user,
  compact = false,
}: {
  user: UserRow;
  compact?: boolean;
}) {
  const initials = (user.displayName || user.username || user.email)[0]!.toUpperCase();
  const src = user.profileImageUrl?.trim();
  const className = compact
    ? "admin-mod-msg-avatar"
    : "admin-user-avatar admin-user-avatar--img";
  if (src) {
    return <img src={src} alt="" className={className} />;
  }
  return (
    <span className={compact ? "admin-mod-msg-avatar admin-mod-msg-avatar--initial" : "admin-user-avatar"}>
      {initials}
    </span>
  );
}

function isValidMongoObjectId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

function AdminSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="admin-toolbar-search-wrap">
      <span className="admin-toolbar-search-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="admin-toolbar-input admin-toolbar-search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AdminMessagesTab({
  initialUserId,
  onInitialUserConsumed,
}: {
  initialUserId: string | null;
  onInitialUserConsumed: () => void;
}) {
  const [logSkip, setLogSkip] = useState(0);
  const [logSearch, setLogSearch] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [threadUserId, setThreadUserId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [replyTarget, setReplyTarget] = useState<ThreadMessageRow | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadUserIdRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const { uploadImage } = useImageUpload();

  function openAdminSenderProfile(adminId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/profile/${adminId}`);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  useEffect(() => {
    if (initialUserId && isValidMongoObjectId(initialUserId)) {
      setThreadUserId(initialUserId);
      setRecipientIds([initialUserId]);
      onInitialUserConsumed();
    } else if (initialUserId) {
      onInitialUserConsumed();
    }
  }, [initialUserId, onInitialUserConsumed]);

  const { data: threadsData, refetch: refetchThreads } = useQuery<{
    adminModeratorThreads: ModeratorThreadRow[];
  }>(ADMIN_MODERATOR_THREADS, {
    variables: { skip: 0, take: 50, search: threadSearch.trim() || undefined },
    fetchPolicy: "network-only",
    pollInterval: 15000,
  });

  const { data: threadData, loading: threadLoading, refetch: refetchThreadMessages } = useQuery<{
    adminModeratorThreadMessages: ThreadMessageRow[];
  }>(ADMIN_MODERATOR_THREAD_MESSAGES, {
    variables: { userId: threadUserId ?? "" },
    skip: !isValidMongoObjectId(threadUserId),
    fetchPolicy: "network-only",
    pollInterval: isValidMongoObjectId(threadUserId) ? 10000 : 0,
  });

  const userListVariables = useMemo(
    () => ({
      skip: 0,
      take: 50,
      role: "member",
      search: userSearch.trim() || undefined,
    }),
    [userSearch],
  );

  const { data: usersData, loading: usersLoading } = useQuery<{ listUsers: UserRow[] }>(
    LIST_USERS,
    { variables: userListVariables, fetchPolicy: "network-only" },
  );

  const logVariables = useMemo(
    () => ({
      skip: logSkip,
      take: PAGE_SIZE,
      search: logSearch.trim() || undefined,
    }),
    [logSkip, logSearch],
  );

  const { data: logData, loading: logLoading } = useQuery<{
    adminModeratorMessages: ModeratorMessageRow[];
  }>(ADMIN_MODERATOR_MESSAGES, {
    variables: logVariables,
    skip: !showLog,
    fetchPolicy: "network-only",
  });

  const { data: logCountData } = useQuery<{ adminModeratorMessagesCount: number }>(
    ADMIN_MODERATOR_MESSAGES_COUNT,
    {
      variables: { search: logSearch.trim() || undefined },
      skip: !showLog,
      fetchPolicy: "network-only",
    },
  );

  const [sendModeratorMessages, { loading: sending }] = useMutation(SEND_MODERATOR_MESSAGES);
  const [markThreadRead] = useMutation(MARK_MODERATOR_THREAD_READ);
  const [reactMut] = useMutation(REACT_MESSAGE);
  const [deleteMut] = useMutation(DELETE_MESSAGE);

  const [liveThreadMessages, setLiveThreadMessages] = useState<ThreadMessageRow[]>([]);

  useEffect(() => {
    setLiveThreadMessages(threadData?.adminModeratorThreadMessages ?? []);
  }, [threadData?.adminModeratorThreadMessages]);

  useSubscription(ADMIN_MODERATOR_USER_MESSAGE, {
    onData({ data }) {
      const ev = data.data?.adminModeratorUserMessage;
      if (!ev) return;

      playMessageSound();

      void refetchThreads();

      if (threadUserIdRef.current === ev.recipientUserId) {
        setLiveThreadMessages((prev) => {
          if (prev.some((m) => m.id === ev.message.id)) return prev;
          return [...prev, ev.message as ThreadMessageRow];
        });
        void markThreadRead({ variables: { userId: ev.recipientUserId } });
      }
    },
  });

  const threads = threadsData?.adminModeratorThreads ?? [];
  const threadMessages = liveThreadMessages;
  const userOptions = usersData?.listUsers ?? [];
  const messages = logData?.adminModeratorMessages ?? [];
  const totalLogCount = logCountData?.adminModeratorMessagesCount ?? 0;
  const totalUnreadFromUsers = threads.reduce(
    (sum, t) => sum + (t.unreadFromUserCount ?? 0),
    0,
  );

  const activeThread = threads.find((t) => t.recipientUserId === threadUserId) ?? null;
  const selectedUsers = userOptions.filter((u) => recipientIds.includes(u.id));

  threadUserIdRef.current = threadUserId;

  const scrollToBottom = useCallback(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [threadMessages.length, scrollToBottom]);

  useEffect(() => {
    setLogSkip(0);
  }, [logSearch]);

  function toggleRecipient(userId: string) {
    setRecipientIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function toggleSelectAll() {
    const allIds = userOptions.map((u) => u.id);
    const allSelected = allIds.every((id) => recipientIds.includes(id));
    if (allSelected) {
      setRecipientIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setRecipientIds((prev) => [...new Set([...prev, ...allIds])]);
    }
  }

  function handleReact(msg: ThreadMessageRow, emoji: string) {
    const isRemove = msg.viewerReaction === emoji;
    void reactMut({ variables: { messageId: msg.id, emoji: isRemove ? null : emoji } })
      .then(() => void refetchThreadMessages())
      .catch(() => {});
  }

  function handleCopyMsg(msg: ThreadMessageRow) {
    const text = (msg.text ?? "").trim();
    if (!text) return;
    void navigator.clipboard.writeText(text);
  }

  function handleDeleteMsg(msg: ThreadMessageRow) {
    if (!confirm("Delete this message for everyone?")) return;
    void deleteMut({ variables: { messageId: msg.id } })
      .then(() => void refetchThreadMessages())
      .catch(() => {});
  }

  function openThread(userId: string) {
    if (!isValidMongoObjectId(userId)) return;
    setThreadUserId(userId);
    setReplyTarget(null);
    if (!recipientIds.includes(userId)) {
      setRecipientIds((prev) => [...prev, userId]);
    }
    void markThreadRead({ variables: { userId } }).then(() => {
      void refetchThreads();
    });
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const targets =
      recipientIds.length > 0
        ? recipientIds
        : threadUserId
          ? [threadUserId]
          : [];
    if (targets.length === 0) {
      setSendError("Select at least one recipient.");
      return;
    }
    if (!messageText.trim() && !pendingImage) {
      setSendError("Write a message or attach an image.");
      return;
    }

    // A quoted reply only applies to a single-thread conversation, never a
    // multi-recipient broadcast.
    const replyToId =
      replyTarget && targets.length === 1 ? replyTarget.id : undefined;

    setSendError(null);
    setUploading(Boolean(pendingImage));
    try {
      let imageUrl: string | undefined;
      if (pendingImage) {
        imageUrl = await uploadImage(pendingImage.file);
      }
      await sendModeratorMessages({
        variables: {
          userIds: targets,
          text: messageText.trim(),
          imageUrl,
          replyToId,
        },
      });
      setMessageText("");
      setReplyTarget(null);
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
        setPendingImage(null);
      }
      if (targets.length === 1) setThreadUserId(targets[0]!);
      void refetchThreads();
      if (threadUserId || targets.length === 1) {
        void refetchThreadMessages();
      }
    } catch (err: unknown) {
      setSendError(getApolloErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  function handlePickImage(file: File | null) {
    if (!file) return;
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  const canSend =
    (recipientIds.length > 0 || threadUserId) &&
    (messageText.trim().length > 0 || pendingImage) &&
    !sending &&
    !uploading;

  return (
    <div className="admin-mod-page">
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">Admin Messages</h2>
          <p className="muted small">
            Chat as <strong>{MODERATOR_BRAND_NAME}</strong> — users see the app logo. Hover moderator messages to see which admin sent them.
          </p>
        </div>
        <button
          type="button"
          className="admin-toolbar-reset"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? "Hide log" : "Show message log"}
        </button>
      </div>

      <div className="admin-mod-layout">
        <aside className="admin-mod-sidebar">
          <div className="admin-mod-sidebar-section">
            <span className="admin-toolbar-label">
              Conversations
              {totalUnreadFromUsers > 0 ? (
                <span className="admin-mod-thread-unread-total">{totalUnreadFromUsers} new</span>
              ) : null}
            </span>
            <AdminSearchInput
              value={threadSearch}
              onChange={setThreadSearch}
              placeholder="Search threads…"
            />
            <ul className="admin-mod-thread-menu">
              {threads.length === 0 ? (
                <li className="muted small admin-mod-empty">No threads yet.</li>
              ) : (
                threads.map((t) => (
                  <li key={t.conversationId}>
                    <button
                      type="button"
                      className={`admin-mod-thread-btn${threadUserId === t.recipientUserId ? " admin-mod-thread-btn--active" : ""}${(t.unreadFromUserCount ?? 0) > 0 ? " admin-mod-thread-btn--unread" : ""}`}
                      onClick={() => openThread(t.recipientUserId)}
                    >
                      <AdminAvatar
                        user={{
                          id: t.recipientUserId,
                          email: t.recipientEmail,
                          displayName: t.recipientName,
                          username: t.recipientName,
                          profileImageUrl: t.recipientProfileImageUrl,
                        }}
                      />
                      <span className="admin-mod-thread-btn-meta">
                        <strong>{t.recipientName}</strong>
                        <span className="muted small">{t.lastMessageText ?? "No messages"}</span>
                      </span>
                      <span className="admin-mod-thread-btn-side">
                        {t.lastMessageAt ? (
                          <span className="admin-mod-thread-time">{formatRelativeTime(t.lastMessageAt)}</span>
                        ) : null}
                        {(t.unreadFromUserCount ?? 0) > 0 ? (
                          <span className="admin-mod-thread-badge">{t.unreadFromUserCount}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="admin-mod-sidebar-section">
            <span className="admin-toolbar-label">Add recipients</span>
            <p className="muted small admin-mod-recipient-hint">
              All accounts with user role — regular users and admin+user dual-role members.
            </p>
            <AdminSearchInput
              value={userSearch}
              onChange={setUserSearch}
              placeholder="Search users…"
            />
            {selectedUsers.length > 0 ? (
              <div className="admin-mod-recipient-chips">
                {selectedUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="admin-mod-recipient-chip"
                    onClick={() => toggleRecipient(u.id)}
                    title="Remove"
                  >
                    {u.displayName || u.username} ×
                  </button>
                ))}
              </div>
            ) : null}
            {userOptions.length > 0 ? (
              <button
                type="button"
                className="admin-mod-select-all"
                onClick={toggleSelectAll}
              >
                {userOptions.every((u) => recipientIds.includes(u.id))
                  ? "Deselect all"
                  : `Select all (${userOptions.length})`}
              </button>
            ) : null}
            <div className="admin-mod-user-list">
              {usersLoading && userOptions.length === 0 ? (
                <p className="muted small">Searching…</p>
              ) : userOptions.length === 0 ? (
                <p className="muted small">No users match.</p>
              ) : (
                userOptions.map((u) => {
                  const checked = recipientIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`admin-mod-user-pick${checked ? " admin-mod-user-pick--active" : ""}`}
                      onClick={() => toggleRecipient(u.id)}
                    >
                      <span className={`admin-mod-check${checked ? " admin-mod-check--on" : ""}`} aria-hidden>
                        {checked ? "✓" : ""}
                      </span>
                      <AdminAvatar user={u} />
                      <span>
                        <strong>{u.displayName || u.username}</strong>
                        <span className="muted small admin-mod-user-email">{u.email}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <section className="admin-mod-chat">
          <div className="admin-mod-chat-header">
            {activeThread ? (
              <AdminAvatar
                user={{
                  id: activeThread.recipientUserId,
                  email: activeThread.recipientEmail,
                  displayName: activeThread.recipientName,
                  username: activeThread.recipientName,
                  profileImageUrl: activeThread.recipientProfileImageUrl,
                }}
              />
            ) : (
              <img src="/logo.png" alt="" className="admin-mod-logo" width={36} height={36} />
            )}
            <div>
              <strong className="admin-mod-brand">
                {activeThread ? activeThread.recipientName : MODERATOR_BRAND_NAME}
              </strong>
              <p className="muted small">
                {recipientIds.length > 1
                  ? `Sending to ${recipientIds.length} users`
                  : activeThread
                    ? `User conversation · you reply as ${MODERATOR_BRAND_NAME}`
                    : threadUserId
                      ? "Loading thread…"
                      : "Select a thread or add recipients"}
              </p>
            </div>
          </div>

          <div className="admin-mod-chat-body" ref={chatBodyRef}>
            {!threadUserId ? (
              <p className="muted small admin-mod-chat-empty">
                Pick a conversation on the left, or select users and send a new message.
              </p>
            ) : threadLoading && threadMessages.length === 0 ? (
              <p className="muted small">Loading messages…</p>
            ) : threadMessages.length === 0 ? (
              <p className="muted small">No messages yet — send the first one below.</p>
            ) : (
              threadMessages.map((msg) => {
                const isModerator = msg.senderId === "moderator";
                const userAvatar: UserRow = {
                  id: msg.senderId,
                  email: "",
                  displayName: msg.senderName,
                  username: msg.senderName,
                  profileImageUrl: msg.senderAvatar,
                };
                const activeReactions = (msg.reactions ?? []).filter((r) => r.count > 0);
                return (
                  <div
                    key={msg.id}
                    data-admin-msg-id={msg.id}
                    className={`admin-mod-bubble-row${isModerator ? " admin-mod-bubble-row--mod" : " admin-mod-bubble-row--user"}`}
                  >
                    {!isModerator ? <AdminAvatar user={userAvatar} compact /> : null}
                    <div
                      className={`admin-mod-bubble${isModerator ? " admin-mod-bubble--mod" : ""}${msg.deleted ? " admin-mod-bubble--deleted" : ""}`}
                      title={
                        isModerator && msg.sentByAdminEmail
                          ? `Sent by ${msg.sentByAdminName} (${msg.sentByAdminEmail})`
                          : undefined
                      }
                    >
                      {msg.deleted ? (
                        <p className="admin-mod-bubble-deleted">🚫 {isModerator ? "You unsent this message" : "Message deleted"}</p>
                      ) : (
                        <>
                          {msg.replyTo ? (
                            <button
                              type="button"
                              className="admin-mod-quoted"
                              onClick={() => {
                                const el = chatBodyRef.current?.querySelector<HTMLElement>(
                                  `[data-admin-msg-id="${msg.replyTo!.messageId}"]`,
                                );
                                if (!el) return;
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("admin-mod-bubble-row--flash");
                                setTimeout(
                                  () => el.classList.remove("admin-mod-bubble-row--flash"),
                                  1200,
                                );
                              }}
                            >
                              <span className="admin-mod-quoted-bar" aria-hidden />
                              <span className="admin-mod-quoted-meta">
                                <span className="admin-mod-quoted-name">{msg.replyTo.senderName}</span>
                                <span className="admin-mod-quoted-text">
                                  {msg.replyTo.text?.trim()
                                    ? msg.replyTo.text
                                    : msg.replyTo.imageUrl
                                      ? "📷 Photo"
                                      : "Message"}
                                </span>
                              </span>
                              {msg.replyTo.imageUrl ? (
                                <img src={msg.replyTo.imageUrl} alt="" className="admin-mod-quoted-thumb" />
                              ) : null}
                            </button>
                          ) : null}
                          <div className="admin-mod-bubble-head">
                            {isModerator ? (
                              <>
                                <img src="/logo.png" alt="" width={18} height={18} className="admin-mod-thread-avatar" />
                                <strong>{MODERATOR_BRAND_NAME}</strong>
                                {msg.sentByAdminName ? (
                                  <span className="admin-mod-sent-by">
                                    via{" "}
                                    {msg.sentByAdminId ? (
                                      <button
                                        type="button"
                                        className="admin-mod-sent-by-link"
                                        title={msg.sentByAdminEmail ?? undefined}
                                        onClick={(e) => openAdminSenderProfile(msg.sentByAdminId!, e)}
                                      >
                                        {msg.sentByAdminName}
                                      </button>
                                    ) : (
                                      msg.sentByAdminName
                                    )}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <strong>{msg.senderName}</strong>
                            )}
                            <span className="muted small">{formatRelativeTime(msg.createdAt)}</span>
                          </div>
                          {msg.text ? <p className="admin-mod-bubble-text">{msg.text}</p> : null}
                          {msg.imageUrl ? (
                            <a href={msg.imageUrl} target="_blank" rel="noreferrer" className="admin-mod-bubble-image-wrap">
                              <img src={msg.imageUrl} alt="" className="admin-mod-bubble-image" />
                            </a>
                          ) : null}
                          {activeReactions.length > 0 ? (
                            <div className="admin-mod-reaction-strip">
                              {activeReactions.map((r) => (
                                <button
                                  key={r.emoji}
                                  type="button"
                                  className={`admin-mod-reaction-chip${msg.viewerReaction === r.emoji ? " admin-mod-reaction-chip--active" : ""}`}
                                  onClick={() => handleReact(msg, r.emoji)}
                                >
                                  {r.emoji} {r.count}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                    {!msg.deleted ? (
                      <div className="admin-mod-msg-actions">
                        <div className="admin-mod-quick-react">
                          {(MESSAGE_REACTION_EMOJIS as readonly string[]).map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className={`admin-mod-quick-react-btn${msg.viewerReaction === emoji ? " admin-mod-quick-react-btn--active" : ""}`}
                              onClick={() => handleReact(msg, emoji)}
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="admin-mod-reply-btn"
                          aria-label="Reply"
                          title="Reply"
                          onClick={() => setReplyTarget(msg)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
                            <polyline points="9 17 4 12 9 7" />
                            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                          </svg>
                        </button>
                        {msg.text?.trim() ? (
                          <button
                            type="button"
                            className="admin-mod-reply-btn"
                            aria-label="Copy"
                            title="Copy"
                            onClick={() => handleCopyMsg(msg)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        ) : null}
                        {isModerator ? (
                          <button
                            type="button"
                            className="admin-mod-reply-btn admin-mod-reply-btn--danger"
                            aria-label="Delete"
                            title="Delete"
                            onClick={() => handleDeleteMsg(msg)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {isModerator ? (
                      <img src="/logo.png" alt="" className="admin-mod-msg-avatar admin-mod-msg-avatar--logo" />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <form className="admin-mod-composer" onSubmit={(e) => void handleSend(e)}>
            {pendingImage ? (
              <div className="admin-mod-image-preview">
                <img src={pendingImage.previewUrl} alt="" />
                <button
                  type="button"
                  className="admin-mod-image-remove"
                  onClick={() => {
                    URL.revokeObjectURL(pendingImage.previewUrl);
                    setPendingImage(null);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
            {replyTarget ? (
              <div className="admin-mod-reply-bar">
                <span className="admin-mod-reply-bar-accent" aria-hidden />
                <div className="admin-mod-reply-bar-meta">
                  <span className="admin-mod-reply-bar-name">
                    Replying to{" "}
                    {replyTarget.senderId === "moderator"
                      ? MODERATOR_BRAND_NAME
                      : replyTarget.senderName}
                  </span>
                  <span className="admin-mod-reply-bar-text">
                    {replyTarget.text?.trim()
                      ? replyTarget.text
                      : replyTarget.imageUrl
                        ? "📷 Photo"
                        : "Message"}
                  </span>
                </div>
                {replyTarget.imageUrl ? (
                  <img src={replyTarget.imageUrl} alt="" className="admin-mod-reply-bar-thumb" />
                ) : null}
                <button
                  type="button"
                  className="admin-mod-reply-bar-close"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTarget(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
            {sendError ? <p className="error" role="alert">{sendError}</p> : null}
            <div className="admin-mod-composer-row">
              <button
                type="button"
                className="admin-mod-attach-btn"
                aria-label="Attach image"
                onClick={() => fileInputRef.current?.click()}
              >
                📷
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                hidden
                onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
              />
              <textarea
                className="admin-mod-composer-input"
                rows={2}
                maxLength={2000}
                placeholder="Type a moderator message…"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) void handleSend();
                  }
                }}
              />
              <button type="submit" className="admin-btn-cta admin-mod-send-btn" disabled={!canSend}>
                {sending || uploading ? "…" : "Send"}
              </button>
            </div>
          </form>
        </section>
      </div>

      {showLog ? (
        <div className="admin-mod-log-panel">
          <h3 className="admin-section-title">Message log</h3>
          <div className="admin-toolbar">
            <AdminSearchInput
              value={logSearch}
              onChange={setLogSearch}
              placeholder="Filter by recipient…"
            />
          </div>
          {logLoading && messages.length === 0 ? (
            <p className="muted small">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="muted small">No messages found.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-table--stack">
                <thead>
                  <tr>
                    <th>To</th>
                    <th>Message</th>
                    <th>Sent</th>
                    <th>Sent by</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr
                      key={msg.id}
                      className="admin-table-row admin-mod-log-row"
                      onClick={() => openThread(msg.recipientUserId)}
                    >
                      <td data-label="To">
                        <strong>{msg.recipientName}</strong>
                        <span className="admin-table-email">{msg.recipientEmail}</span>
                      </td>
                      <td className="admin-mod-log-text" data-label="Message">
                        {msg.imageUrl ? "📷 " : ""}
                        {msg.text || (msg.imageUrl ? "Image" : "")}
                      </td>
                      <td className="muted small" data-label="Sent">{formatRelativeTime(msg.createdAt)}</td>
                      <td data-label="Sent by">
                        <button
                          type="button"
                          className="admin-mod-admin-chip admin-mod-admin-chip--link"
                          title={`${msg.sentByAdminName}\n${msg.sentByAdminEmail}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openAdminSenderProfile(msg.sentByAdminId, e);
                          }}
                        >
                          {msg.sentByAdminName}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-pagination">
            <button
              type="button"
              className="admin-page-btn"
              disabled={logSkip === 0}
              onClick={() => setLogSkip((s) => Math.max(0, s - PAGE_SIZE))}
            >
              ← Previous
            </button>
            <span className="admin-pagination-meta">
              {totalLogCount === 0 ? 0 : logSkip + 1}–{Math.min(logSkip + messages.length, totalLogCount)} of {totalLogCount}
            </span>
            <button
              type="button"
              className="admin-page-btn"
              disabled={logSkip + messages.length >= totalLogCount}
              onClick={() => setLogSkip((s) => s + PAGE_SIZE)}
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
