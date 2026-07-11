import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import {
  useNotifications,
  type NotificationItem,
} from "../context/NotificationContext";
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
import { MODERATOR_BRAND_NAME } from "../lib/moderatorBrand";
import { CLAIM_POST_VOTE_PRIZE } from "../graphql/feed";

export function useNotificationActions() {
  const { isAuthenticated } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    archiveNotification,
    updateNotification,
    refetch: refetchNotifications,
  } = useNotifications();
  const { openChat, refetchConversations, ensureConversation } = useMessenger();
  const navigate = useNavigate();
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());
  const [claimedPostIds, setClaimedPostIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("ctrend_claimed_prizes");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const { data: friendsData } = useQuery(MY_FRIENDS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });

  const friendIdSet = useMemo<Set<string>>(
    () =>
      new Set<string>(
        (friendsData?.myFriends ?? []).map((f: { id: string }) => f.id),
      ),
    [friendsData],
  );

  const [respondFriendMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });
  const [claimPrizeMut] = useMutation(CLAIM_POST_VOTE_PRIZE);

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

  const setActionLoading = useCallback((id: string, on: boolean) => {
    setActionLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleClick = useCallback(
    (n: NotificationItem, onAfterNavigate?: () => void) => {
      if (!n.read) markRead(n.id);
      onAfterNavigate?.();

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

      if (n.type === "MESSAGE_MENTION" && n.referenceId) {
        void refetchConversations();
        openChat(n.referenceId);
        return;
      }

      if (
        (n.type === "FRIEND_REQUEST" || n.type === "FRIEND_REQUEST_ACCEPTED") &&
        n.referenceId
      ) {
        navigate(`/profile/${n.referenceId}`);
        return;
      }
      if (n.postId && n.commentId) {
        navigate(`/post/${n.postId}#comment-${n.commentId}`);
        return;
      }
      if (n.type === "LINEUP_AVAILABLE" && n.referenceId) {
        navigate(`/world-cup/match/${n.referenceId}?tab=lineup`);
        return;
      }
      if (n.type === "REFERRAL_JOINED" || n.type === "REFERRAL_REDEEMED") {
        navigate("/points");
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
      if (n.referenceType === "Post" && n.referenceId) {
        navigate(`/post/${n.referenceId}`);
        return;
      }
      if (n.referenceType === "User" && n.referenceId) {
        navigate(`/profile/${n.referenceId}`);
      }
    },
    [
      markRead,
      ensureConversation,
      refetchConversations,
      openChat,
      navigate,
    ],
  );

  const handleAcceptRequest = useCallback(
    async (n: NotificationItem, e: React.MouseEvent) => {
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
    },
    [respondFriendMut, setActionLoading, updateNotification],
  );

  const handleRejectRequest = useCallback(
    async (n: NotificationItem, e: React.MouseEvent) => {
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
    },
    [respondFriendMut, setActionLoading, updateNotification],
  );

  const handleViewProfile = useCallback(
    (n: NotificationItem, e: React.MouseEvent, onAfterNavigate?: () => void) => {
      e.stopPropagation();
      if (!n.referenceId) return;
      if (!n.read) markRead(n.id);
      onAfterNavigate?.();
      navigate(`/profile/${n.referenceId}`);
    },
    [markRead, navigate],
  );

  const handleMarkRead = useCallback(
    (n: NotificationItem, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!n.read) markRead(n.id);
    },
    [markRead],
  );

  const handleClaimPrize = useCallback(
    async (n: NotificationItem, e: React.MouseEvent) => {
      e.stopPropagation();
      const postId = n.postId ?? n.referenceId;
      if (!postId) return;
      setActionLoading(n.id, true);
      try {
        await claimPrizeMut({ variables: { postId } });
        setClaimedPostIds((prev) => {
          const next = new Set(prev).add(postId);
          try {
            localStorage.setItem("ctrend_claimed_prizes", JSON.stringify([...next]));
          } catch {
            /* ignore */
          }
          return next;
        });
        updateNotification(n.id, {
          read: true,
          title: "Prize claim submitted",
          body: "Your claim is received. A moderator will connect with you soon.",
        });
        markRead(n.id);
      } catch {
        /* keep notification unchanged */
      } finally {
        setActionLoading(n.id, false);
      }
    },
    [claimPrizeMut, markRead, setActionLoading, updateNotification],
  );

  const handleArchive = useCallback(
    (n: NotificationItem, e: React.MouseEvent) => {
      e.stopPropagation();
      archiveNotification(n.id);
    },
    [archiveNotification],
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAllRead,
    refetchNotifications,
    friendIdSet,
    actionLoadingIds,
    claimedPostIds,
    isResolvedFriendRequest,
    handleClick,
    handleAcceptRequest,
    handleRejectRequest,
    handleViewProfile,
    handleMarkRead,
    handleClaimPrize,
    handleArchive,
  };
}
