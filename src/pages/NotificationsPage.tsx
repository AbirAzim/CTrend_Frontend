import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useNotificationActions } from "../hooks/useNotificationActions";
import { NotificationList } from "../components/NotificationList";

export function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
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
    void refetchNotifications();
  }, [refetchNotifications]);

  return (
    <div className="notif-page">
      <header className="notif-page-header">
        <Link to="/" className="notif-page-back" aria-label="Back to feed">
          ← Back
        </Link>
        <h1 className="notif-page-title">Notifications</h1>
        {unreadCount > 0 ? (
          <button type="button" className="notif-page-mark-all" onClick={markAllRead}>
            Mark all read
          </button>
        ) : (
          <span className="notif-page-mark-all notif-page-mark-all--spacer" aria-hidden />
        )}
      </header>

      <div className="notif-page-body">
        {loading && notifications.length === 0 ? (
          <p className="nb-empty nb-empty--page">Loading notifications…</p>
        ) : (
          <NotificationList
            notifications={notifications}
            variant="page"
            friendIdSet={friendIdSet}
            actionLoadingIds={actionLoadingIds}
            claimedPostIds={claimedPostIds}
            onItemClick={(n) => handleClick(n)}
            onAcceptRequest={handleAcceptRequest}
            onRejectRequest={handleRejectRequest}
            onViewProfile={handleViewProfile}
            onMarkRead={handleMarkRead}
            onClaimPrize={handleClaimPrize}
            onArchive={handleArchive}
          />
        )}
      </div>
    </div>
  );
}
