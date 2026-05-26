import { useEffect, useRef, useState } from "react";
import { useNotifications, type NotificationItem } from "../context/NotificationContext";

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
    case "MESSAGE": return "💬";
    case "ANNOUNCEMENT": return "📢";
    case "FRIEND_REQUEST": return "👋";
    default: return "🔔";
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleClick(n: NotificationItem) {
    if (!n.read) markRead(n.id);
    if (n.referenceType === "Conversation" && n.referenceId) {
      // messenger panel handles this via context — just close dropdown
    }
    setOpen(false);
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
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`nb-item${n.read ? "" : " nb-item--unread"}`}
                  role="menuitem"
                  onClick={() => handleClick(n)}
                >
                  <span className="nb-item-icon" aria-hidden>{typeIcon(n.type)}</span>
                  <div className="nb-item-body">
                    <p className="nb-item-title">{n.title}</p>
                    <p className="nb-item-desc">{n.body}</p>
                    <span className="nb-item-time">{timeAgo(n.createdAt)}</span>
                  </div>
                  {!n.read && <span className="nb-unread-dot" aria-hidden />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
