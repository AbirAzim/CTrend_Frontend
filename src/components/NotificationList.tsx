import { notificationActivityAt } from "@ctrend/shared/lib/notificationTime";
import type { NotificationItem } from "../context/NotificationContext";
import {
  isPendingFriendRequestNotification,
  isResolvedFriendRequest,
} from "../lib/friendRequestNotification";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { PLATFORM_BRAND_LOGO_URL } from "../lib/moderatorBrand";
import {
  adminMessagePrefix,
  friendRequestRowIcon,
  isOfficialAdminMessage,
  notificationAvatarUrl,
  notificationTimeAgo,
  notificationTitle,
  notificationTypeIcon,
} from "../lib/notificationDisplay";
import { IconArchive, IconMarkRead } from "./IgIcons";

type Props = {
  notifications: NotificationItem[];
  variant?: "dropdown" | "page";
  friendIdSet: Set<string>;
  actionLoadingIds: Set<string>;
  claimedPostIds: Set<string>;
  onItemClick: (n: NotificationItem) => void;
  onAcceptRequest: (n: NotificationItem, e: React.MouseEvent) => void;
  onRejectRequest: (n: NotificationItem, e: React.MouseEvent) => void;
  onViewProfile: (n: NotificationItem, e: React.MouseEvent) => void;
  onMarkRead: (n: NotificationItem, e: React.MouseEvent) => void;
  onClaimPrize: (n: NotificationItem, e: React.MouseEvent) => void;
  onArchive: (n: NotificationItem, e: React.MouseEvent) => void;
};

export function NotificationList({
  notifications,
  variant = "dropdown",
  friendIdSet,
  actionLoadingIds,
  claimedPostIds,
  onItemClick,
  onAcceptRequest,
  onRejectRequest,
  onViewProfile,
  onMarkRead,
  onClaimPrize,
  onArchive,
}: Props) {
  const isPage = variant === "page";

  if (notifications.length === 0) {
    return (
      <p className={`nb-empty${isPage ? " nb-empty--page" : ""}`}>
        {isPage ? (
          <>
            No notifications yet.
            <br />
            Check back later!
          </>
        ) : (
          "No notifications yet."
        )}
      </p>
    );
  }

  return (
    <ul className={`nb-list${isPage ? " nb-list--page" : ""}`} role="list">
      {notifications.map((n) => {
        const isFriendReq = n.type === "FRIEND_REQUEST";
        const isAdminMsg = isOfficialAdminMessage(n);
        const isLoading = actionLoadingIds.has(n.id);
        const alreadyFriends =
          isFriendReq && Boolean(n.referenceId) && friendIdSet.has(n.referenceId);
        const showFriendReqActions =
          isFriendReq &&
          isPendingFriendRequestNotification(n) &&
          !alreadyFriends &&
          Boolean(n.referenceId);
        const claimPostId = n.postId ?? n.referenceId;
        const canClaimPrize =
          n.type === "VOTE_WINNER" &&
          n.title.trim() !== "Prize claim submitted" &&
          !n.body.toLowerCase().includes("claim is received") &&
          Boolean(claimPostId) &&
          !claimedPostIds.has(claimPostId!);
        const rawAvatar = notificationAvatarUrl(n, PLATFORM_BRAND_LOGO_URL);
        const avatarUrl = rawAvatar ? normalizeProfileImageUrl(rawAvatar) : null;

        return (
          <li
            key={n.id}
            className={[
              "nb-item",
              !n.read ? "nb-item--unread" : "",
              isFriendReq ? "nb-item--friend-req" : "",
              isAdminMsg ? "nb-item--admin-msg" : "",
              isPage ? "nb-item--page" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="listitem"
            onClick={() => onItemClick(n)}
          >
            {!n.read && isPage ? <span className="nb-item-unread-bar" aria-hidden /> : null}
            {avatarUrl ? (
              <img
                className={`nb-item-avatar${isPage ? " nb-item-avatar--page" : ""}`}
                src={avatarUrl}
                alt=""
                width={isPage ? 46 : 36}
                height={isPage ? 46 : 36}
              />
            ) : (
              <span
                className={`nb-item-icon${isPage ? " nb-item-icon--page" : ""}`}
                aria-hidden
              >
                {isFriendReq
                  ? friendRequestRowIcon(
                      n,
                      isResolvedFriendRequest(n) || alreadyFriends,
                      isResolvedFriendRequest,
                    )
                  : notificationTypeIcon(n.type, n.referenceType)}
              </span>
            )}
            <div className="nb-item-body">
              <p className={`nb-item-title${isPage ? " nb-item-title--page" : ""}`}>
                {notificationTitle(n)}
                {isAdminMsg ? <span className="nb-admin-chip">Important</span> : null}
                {!n.read && isPage ? <span className="nb-item-inline-dot" aria-hidden /> : null}
              </p>
              <p className={`nb-item-desc${isPage ? " nb-item-desc--page" : ""}`}>
                {adminMessagePrefix(n)}
                {n.body}
              </p>
              <div className="nb-item-meta">
                <span className="nb-item-time">
                  {notificationTimeAgo(notificationActivityAt(n))}
                </span>
                {showFriendReqActions ? (
                  <button
                    type="button"
                    className="nb-friend-profile-link"
                    disabled={isLoading}
                    onClick={(e) => onViewProfile(n, e)}
                  >
                    View profile
                  </button>
                ) : null}
                {isPage && !n.read ? (
                  <button
                    type="button"
                    className="nb-inline-mark-read"
                    onClick={(e) => onMarkRead(n, e)}
                  >
                    Mark read
                  </button>
                ) : null}
                {isPage ? (
                  <button
                    type="button"
                    className="nb-inline-archive"
                    onClick={(e) => onArchive(n, e)}
                  >
                    Archive
                  </button>
                ) : null}
              </div>

              {showFriendReqActions ? (
                <div className="nb-item-actions">
                  <button
                    type="button"
                    className="nb-action-btn nb-action-btn--accept"
                    disabled={isLoading}
                    onClick={(e) => void onAcceptRequest(n, e)}
                  >
                    {isLoading ? "…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="nb-action-btn nb-action-btn--reject"
                    disabled={isLoading}
                    onClick={(e) => void onRejectRequest(n, e)}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {canClaimPrize ? (
                <div className="nb-item-actions">
                  <button
                    type="button"
                    className="nb-action-btn nb-action-btn--accept"
                    disabled={isLoading}
                    onClick={(e) => void onClaimPrize(n, e)}
                  >
                    {isLoading ? "…" : "Claim prize"}
                  </button>
                </div>
              ) : null}
            </div>
            {!isPage ? (
              <div
                className="nb-item-tools"
                role="group"
                aria-label="Notification actions"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {!n.read ? (
                  <button
                    type="button"
                    className="nb-tool-btn"
                    aria-label="Mark as read"
                    title="Mark as read"
                    onClick={(e) => onMarkRead(n, e)}
                  >
                    <IconMarkRead size={16} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="nb-tool-btn"
                  aria-label="Archive"
                  title="Archive"
                  onClick={(e) => onArchive(n, e)}
                >
                  <IconArchive size={16} />
                </button>
              </div>
            ) : null}
            {!n.read && !isPage ? <span className="nb-unread-dot" aria-hidden /> : null}
          </li>
        );
      })}
    </ul>
  );
}
