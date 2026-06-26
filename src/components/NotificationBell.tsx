import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotificationActions } from "../hooks/useNotificationActions";
import { useMobileShell } from "../lib/useMobileShell";
import { NotificationList } from "./NotificationList";

export function NotificationBell() {
  const mobileShell = useMobileShell();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    markAllRead,
    refetchNotifications,
    friendIdSet,
    actionLoadingIds,
    claimedPostIds,
    handleClick,
    handleAcceptRequest,
    handleRejectRequest,
    handleViewProfile,
    handleMarkRead,
    handleClaimPrize,
    handleArchive,
  } = useNotificationActions();

  useEffect(() => {
    if (!open) return;
    void refetchNotifications();
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, refetchNotifications]);

  function onBellClick() {
    if (mobileShell) {
      navigate("/notifications");
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <div className="nb-wrap" ref={ref}>
      <button
        type="button"
        className="nb-btn"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        onClick={onBellClick}
      >
        <span className="nb-icon" aria-hidden>
          🔔
        </span>
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && !mobileShell ? (
        <div className="nb-dropdown" role="menu" aria-label="Notifications">
          <div className="nb-header">
            <span className="nb-header-title">Notifications</span>
            <div className="nb-header-actions">
              {unreadCount > 0 ? (
                <button type="button" className="nb-mark-all" onClick={markAllRead}>
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>

          <NotificationList
            notifications={notifications}
            variant="dropdown"
            friendIdSet={friendIdSet}
            actionLoadingIds={actionLoadingIds}
            claimedPostIds={claimedPostIds}
            onItemClick={(n) => handleClick(n, () => setOpen(false))}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onViewProfile={(n, e) => handleViewProfile(n, e, () => setOpen(false))}
            onMarkRead={handleMarkRead}
            onClaimPrize={handleClaimPrize}
            onArchive={handleArchive}
          />
        </div>
      ) : null}
    </div>
  );
}
