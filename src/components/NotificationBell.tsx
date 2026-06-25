import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client";
import { useNotifications, type NotificationItem } from "../context/NotificationContext";
import { useMessenger } from "../context/MessengerContext";
import { useAuth } from "../context/AuthContext";
import {
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
  FRIEND_SOCIAL_REFETCH_QUERIES,
} from "../graphql/friends";
import {
  friendRequestAcceptedPatch,
  friendRequestAlreadyFriendsPatch,
  friendRequestRejectedPatch,
  isPendingFriendRequestNotification,
  isResolvedFriendRequest,
} from "../lib/friendRequestNotification";
import { IconArchive, IconMarkRead } from "./IgIcons";
import { MODERATOR_BRAND_NAME, MODERATOR_PLATFORM_NAME, PLATFORM_BRAND_LOGO_URL } from "../lib/moderatorBrand";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { useMobileShell } from "../lib/useMobileShell";
import { CLAIM_POST_VOTE_PRIZE } from "../graphql/feed";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function typeIcon(type: string, referenceType?: string | null): string {
  if (type === "MESSAGE" && referenceType === "moderator_conversation") return "🛡️";
  switch (type) {
    case "MESSAGE":          return "💬";
    case "ANNOUNCEMENT":     return "📢";
    case "FRIEND_REQUEST":   return "👋";
    case "FRIEND_REQUEST_ACCEPTED": return "🤝";
    case "NEW_POST_FRIEND":  return "✨";
    case "USER_GLOBAL_POST": return "🌍";
    case "POST_HYPE":        return "❤️";
    case "POST_VOTE":        return "🗳️";
    case "POST_COMMENT":     return "💭";
    case "COMMENT_REPLY":    return "↩️";
    case "COMMENT_REACTION": return "😊";
    case "VOTE_ENDED":       return "⏱️";
    case "VOTE_WINNER":      return "🏆";
    case "VOTE_PRIZE_CLAIMED": return "🎁";
    case "LINEUP_AVAILABLE":  return "⚽";
    default:                 return "🔔";
  }
}

function isOfficialAdminMessage(n: NotificationItem): boolean {
  return n.type === "MESSAGE" && n.referenceType === "moderator_conversation";
}

function isSystemGeneratedNotification(n: NotificationItem): boolean {
  return (
    n.type === "ANNOUNCEMENT" ||
    n.type === "VOTE_ENDED" ||
    n.type === "VOTE_WINNER" ||
    n.type === "VOTE_PRIZE_CLAIMED" ||
    n.type === "SYSTEM"
  );
}

function notificationTitle(n: NotificationItem): string {
  if (isOfficialAdminMessage(n)) return "Official admin message";
  return n.title;
}

function friendRequestRowIcon(n: NotificationItem, resolved = false): string {
  if (!resolved && !isResolvedFriendRequest(n)) {
    return typeIcon(n.type, n.referenceType);
  }
  const title = n.title.trim();
  if (title === "Friend request declined" || title === "Friend request withdrawn") {
    return "✕";
  }
  return "🤝";
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    archiveNotification,
    updateNotification,
    refetch: refetchNotifications,
  } = useNotifications();
  const { openChat, refetchConversations, ensureConversation } = useMessenger();
  const navigate = useNavigate();
  const mobileShell = useMobileShell();
  const [open, setOpen] = useState(false);
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());
  const [claimedPostIds, setClaimedPostIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("ctrend_claimed_prizes");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  });
  const ref = useRef<HTMLDivElement>(null);

  const { data: friendsData } = useQuery(MY_FRIENDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  const friendIdSet = useMemo(
    () => new Set((friendsData?.myFriends ?? []).map((f: { id: string }) => f.id)),
    [friendsData],
  );

  const [respondFriendMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });
  const [claimPrizeMut] = useMutation(CLAIM_POST_VOTE_PRIZE);

  useEffect(() => {
    if (!open) return;
    void refetchNotifications();
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, refetchNotifications]);

  // Hide Accept/Reject when we are already friends (e.g. accepted on profile).
  useEffect(() => {
    for (const n of notifications) {
      if (
        !isPendingFriendRequestNotification(n) ||
        !n.referenceId ||
        !friendIdSet.has(n.referenceId)
      ) {
        continue;
      }
      updateNotification(n.id, friendRequestAlreadyFriendsPatch(n));
    }
  }, [notifications, friendIdSet, updateNotification]);

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

    if (n.type === "MESSAGE" && n.referenceType === "moderator_conversation" && n.referenceId) {
      ensureConversation({
        id: n.referenceId,
        type: "moderator",
        name: MODERATOR_BRAND_NAME,
        participantIds: [],
        participants: [
          {
            id: "moderator",
            displayName: MODERATOR_BRAND_NAME,
            avatarUrl: "/logo.png",
            online: false,
          },
        ],
        lastMessageText: n.body ?? null,
        lastMessageAt: n.createdAt,
        unreadCount: n.read ? 0 : 1,
        createdAt: n.createdAt,
      });
      void refetchConversations();
      openChat(n.referenceId);
      return;
    }

    // FRIEND_REQUEST: inline buttons handle the action; clicking row → profile
    if (
      (n.type === "FRIEND_REQUEST" || n.type === "FRIEND_REQUEST_ACCEPTED") &&
      n.referenceId
    ) {
      navigate(`/profile/${n.referenceId}`);
      return;
    }
    // Comment notifications deep-link to the exact comment when possible
    if (n.postId && n.commentId) {
      navigate(`/post/${n.postId}#comment-${n.commentId}`);
      return;
    }
    if (n.type === "LINEUP_AVAILABLE" && n.referenceId) {
      navigate(`/world-cup/match/${n.referenceId}?tab=lineup`);
      return;
    }
    if (
      (n.type === "ANNOUNCEMENT" || n.type === "USER_GLOBAL_POST") &&
      (n.postId || n.referenceId)
    ) {
      navigate(`/post/${n.postId ?? n.referenceId}`);
      return;
    }
    if (n.postId) {
      navigate(`/post/${n.postId}`);
      return;
    }
    if (
      n.commentId &&
      (n.type === "COMMENT_REPLY" ||
        n.type === "COMMENT_REACTION" ||
        n.type === "POST_COMMENT")
    ) {
      const postTarget = n.referenceType === "Post" ? n.referenceId : n.postId;
      if (postTarget) {
        navigate(`/post/${postTarget}#comment-${n.commentId}`);
        return;
      }
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
  }

  async function handleAcceptRequest(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    updateNotification(n.id, friendRequestAcceptedPatch(n));
    setActionLoading(n.id, true);
    try {
      await respondFriendMut({
        variables: { requesterId: n.referenceId, accept: true },
      });
    } catch {
      updateNotification(n.id, {
        title: n.title,
        body: n.body,
        read: n.read,
      });
    }
    setActionLoading(n.id, false);
  }

  async function handleRejectRequest(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    updateNotification(n.id, friendRequestRejectedPatch(n));
    setActionLoading(n.id, true);
    try {
      await respondFriendMut({
        variables: { requesterId: n.referenceId, accept: false },
      });
    } catch {
      updateNotification(n.id, {
        title: n.title,
        body: n.body,
        read: n.read,
      });
    }
    setActionLoading(n.id, false);
  }

  function handleViewProfile(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.referenceId) return;
    if (!n.read) markRead(n.id);
    setOpen(false);
    navigate(`/profile/${n.referenceId}`);
  }

  function handleMarkRead(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    if (!n.read) markRead(n.id);
  }

  async function handleClaimPrize(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    const postId = n.postId ?? n.referenceId;
    if (!postId) return;
    setActionLoading(n.id, true);
    try {
      await claimPrizeMut({ variables: { postId } });
      // Persist so button stays hidden after page reload.
      setClaimedPostIds((prev) => {
        const next = new Set(prev).add(postId);
        try { localStorage.setItem("ctrend_claimed_prizes", JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
      updateNotification(n.id, {
        read: true,
        title: "Prize claim submitted",
        body: "Your claim is received. A moderator will connect with you soon.",
      });
      markRead(n.id);
    } catch {
      // keep notification unchanged; user can retry
    } finally {
      setActionLoading(n.id, false);
    }
  }

  function handleArchive(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    archiveNotification(n.id);
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

      {open && mobileShell ? (
        <button
          type="button"
          className="nb-mobile-backdrop"
          aria-label="Close notifications"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open && (
        <div
          className={`nb-dropdown${mobileShell ? " nb-dropdown--mobile" : ""}`}
          role="menu"
          aria-label="Notifications"
        >
          <div className="nb-header">
            <span className="nb-header-title">Notifications</span>
            <div className="nb-header-actions">
              {unreadCount > 0 && (
                <button type="button" className="nb-mark-all" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
              {mobileShell ? (
                <button
                  type="button"
                  className="nb-mobile-close"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="nb-empty">No notifications yet.</p>
          ) : (
            <ul className="nb-list">
              {notifications.map((n) => {
                const isFriendReq = n.type === "FRIEND_REQUEST";
                const isAdminMsg = isOfficialAdminMessage(n);
                const isLoading = actionLoadingIds.has(n.id);
                const alreadyFriends =
                  isFriendReq &&
                  Boolean(n.referenceId) &&
                  friendIdSet.has(n.referenceId);
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
                const hideVoteActor =
                  n.type === "POST_VOTE" &&
                  (!n.latestActorId ||
                    n.latestActorName === "Someone" ||
                    !n.latestActorAvatar?.trim());
                const isPlatformAnnouncement =
                  n.type === "ANNOUNCEMENT" &&
                  (n.latestActorName === MODERATOR_PLATFORM_NAME ||
                    n.title.includes(MODERATOR_PLATFORM_NAME));
                const useBrandLogoAvatar =
                  isPlatformAnnouncement || isSystemGeneratedNotification(n);
                const avatarUrl = hideVoteActor
                  ? null
                  : useBrandLogoAvatar
                    ? PLATFORM_BRAND_LOGO_URL
                    : normalizeProfileImageUrl(n.latestActorAvatar);
                return (
                  <li
                    key={n.id}
                    className={`nb-item${n.read ? "" : " nb-item--unread"}${isFriendReq ? " nb-item--friend-req" : ""}${isAdminMsg ? " nb-item--admin-msg" : ""}`}
                    role="menuitem"
                    onClick={() => handleClick(n)}
                  >
                    {avatarUrl ? (
                      <img
                        className="nb-item-avatar"
                        src={avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                      />
                    ) : (
                      <span className="nb-item-icon" aria-hidden>
                        {isFriendReq
                          ? friendRequestRowIcon(
                              n,
                              isResolvedFriendRequest(n) || alreadyFriends,
                            )
                          : typeIcon(n.type, n.referenceType)}
                      </span>
                    )}
                    <div className="nb-item-body">
                      <p className="nb-item-title">
                        {notificationTitle(n)}
                        {isAdminMsg ? (
                          <span className="nb-admin-chip">Important</span>
                        ) : null}
                      </p>
                      <p className="nb-item-desc">
                        {isAdminMsg ? `From ${MODERATOR_BRAND_NAME} · ` : ""}
                        {n.body}
                      </p>
                      <div className="nb-item-meta">
                        <span className="nb-item-time">{timeAgo(n.createdAt)}</span>
                        {showFriendReqActions ? (
                          <button
                            type="button"
                            className="nb-friend-profile-link"
                            disabled={isLoading}
                            onClick={(e) => handleViewProfile(n, e)}
                          >
                            View profile
                          </button>
                        ) : null}
                      </div>

                      {showFriendReqActions ? (
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
                        </div>
                      ) : null}
                      {canClaimPrize ? (
                        <div className="nb-item-actions">
                          <button
                            type="button"
                            className="nb-action-btn nb-action-btn--accept"
                            disabled={isLoading}
                            onClick={(e) => void handleClaimPrize(n, e)}
                          >
                            {isLoading ? "…" : "Claim prize"}
                          </button>
                        </div>
                      ) : null}
                    </div>
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
                          onClick={(e) => handleMarkRead(n, e)}
                        >
                          <IconMarkRead size={16} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="nb-tool-btn"
                        aria-label="Archive"
                        title="Archive"
                        onClick={(e) => handleArchive(n, e)}
                      >
                        <IconArchive size={16} />
                      </button>
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
