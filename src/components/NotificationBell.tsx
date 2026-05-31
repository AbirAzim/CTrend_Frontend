import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { useNotifications, type NotificationItem } from "../context/NotificationContext";
import { RESPOND_FRIEND_REQUEST, FRIEND_REQUESTS, MY_FRIENDS } from "../graphql/friends";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function typeIcon(type: string): string {
  switch (type) {
    case "MESSAGE":          return "💬";
    case "ANNOUNCEMENT":     return "📢";
    case "FRIEND_REQUEST":   return "👋";
    case "NEW_POST_FRIEND":  return "✨";
    case "POST_HYPE":        return "❤️";
    case "POST_COMMENT":     return "💭";
    case "COMMENT_REPLY":    return "↩️";
    case "COMMENT_REACTION": return "😊";
    default:                 return "🔔";
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead, refetch } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  const [respondFriendMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [{ query: FRIEND_REQUESTS }, { query: MY_FRIENDS }],
  });

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function setActionLoading(id: string, on: boolean) {
    setActionLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) { next.add(id); } else { next.delete(id); }
      return next;
    });
  }

  function handleClick(n: NotificationItem) {
    if (!n.read) markRead(n.id);
    setOpen(false);

    // FRIEND_REQUEST: inline buttons handle the action; clicking row → profile
    if (n.type === "FRIEND_REQUEST" && n.referenceId) {
      navigate(`/profile/${n.referenceId}`);
      return;
    }
    // Comment notifications deep-link to the post (postId preferred)
    if (n.postId) {
      navigate(`/post/${n.postId}`);
      return;
    }
    // Anything referencing a Post jumps to the post detail page
    if (n.referenceType === "Post" && n.referenceId) {
      navigate(`/post/${n.referenceId}`);
      return;
    }
    // User-typed (friend request etc) jumps to profile
    if (n.referenceType === "User" && n.referenceId) {
      navigate(`/profile/${n.referenceId}`);
      return;
    }
    // ANNOUNCEMENT (admin broadcast / campaign) — no navigation
  }

  async function handleAcceptRequest(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    setActionLoading(n.id, true);
    try {
      await respondFriendMut({
        variables: { requesterId: n.referenceId, accept: true },
      });
      markRead(n.id);
      void refetch();
    } catch { /* silent */ }
    setActionLoading(n.id, false);
  }

  async function handleRejectRequest(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    setActionLoading(n.id, true);
    try {
      await respondFriendMut({
        variables: { requesterId: n.referenceId, accept: false },
      });
      markRead(n.id);
      void refetch();
    } catch { /* silent */ }
    setActionLoading(n.id, false);
  }

  function handleViewProfile(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    if (!n.read) markRead(n.id);
    setOpen(false);
    navigate(`/profile/${n.referenceId}`);
  }

  return (
    <div className="nb-wrap" ref={ref}>
      <button
        type="button"
        className="nb-btn"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="nb-icon" aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="nb-dropdown" role="menu" aria-label="Notifications">
          <div className="nb-header">
            <span className="nb-header-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="nb-mark-all" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="nb-empty">No notifications yet.</p>
          ) : (
            <ul className="nb-list">
              {notifications.map((n) => {
                const isFriendReq = n.type === "FRIEND_REQUEST";
                const isLoading = actionLoadingIds.has(n.id);
                return (
                  <li
                    key={n.id}
                    className={`nb-item${n.read ? "" : " nb-item--unread"}${isFriendReq ? " nb-item--friend-req" : ""}`}
                    role="menuitem"
                    onClick={() => handleClick(n)}
                  >
                    <span className="nb-item-icon" aria-hidden>{typeIcon(n.type)}</span>
                    <div className="nb-item-body">
                      <p className="nb-item-title">{n.title}</p>
                      <p className="nb-item-desc">{n.body}</p>
                      <span className="nb-item-time">{timeAgo(n.createdAt)}</span>

                      {isFriendReq && (
                        <div className="nb-item-actions">
                          <button
                            type="button"
                            className="nb-action-btn nb-action-btn--accept"
                            disabled={isLoading}
                            onClick={(e) => void handleAcceptRequest(n, e)}
                          >
                            {isLoading ? "…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            className="nb-action-btn nb-action-btn--reject"
                            disabled={isLoading}
                            onClick={(e) => void handleRejectRequest(n, e)}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="nb-action-btn nb-action-btn--view"
                            disabled={isLoading}
                            onClick={(e) => handleViewProfile(n, e)}
                          >
                            View profile
                          </button>
                        </div>
                      )}
                    </div>
                    {!n.read && <span className="nb-unread-dot" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
