import type { NotificationItem } from "../context/NotificationContext";
import { MODERATOR_BRAND_NAME, MODERATOR_PLATFORM_NAME } from "./moderatorBrand";

export function notificationTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function notificationTypeIcon(type: string, referenceType?: string | null): string {
  if (type === "MESSAGE" && referenceType === "moderator_conversation") return "🛡️";
  switch (type) {
    case "MESSAGE":
      return "💬";
    case "ANNOUNCEMENT":
      return "📢";
    case "FRIEND_REQUEST":
      return "👋";
    case "FRIEND_REQUEST_ACCEPTED":
      return "🤝";
    case "NEW_POST_FRIEND":
      return "✨";
    case "USER_GLOBAL_POST":
      return "🌍";
    case "POST_HYPE":
      return "❤️";
    case "POST_VOTE":
      return "🗳️";
    case "POST_COMMENT":
      return "💭";
    case "COMMENT_REPLY":
      return "↩️";
    case "COMMENT_REACTION":
      return "😊";
    case "VOTE_ENDED":
      return "⏱️";
    case "VOTE_WINNER":
      return "🏆";
    case "VOTE_PRIZE_CLAIMED":
      return "🎁";
    case "LINEUP_AVAILABLE":
      return "⚽";
    case "REFERRAL_JOINED":
    case "REFERRAL_REDEEMED":
      return "✦";
    default:
      return "🔔";
  }
}

export function isOfficialAdminMessage(n: NotificationItem): boolean {
  return n.type === "MESSAGE" && n.referenceType === "moderator_conversation";
}

export function isSystemGeneratedNotification(n: NotificationItem): boolean {
  return (
    n.type === "ANNOUNCEMENT" ||
    n.type === "VOTE_ENDED" ||
    n.type === "VOTE_WINNER" ||
    n.type === "VOTE_PRIZE_CLAIMED" ||
    n.type === "SYSTEM"
  );
}

export function notificationTitle(n: NotificationItem): string {
  if (isOfficialAdminMessage(n)) return "Official admin message";
  return n.title;
}

export function friendRequestRowIcon(
  n: NotificationItem,
  resolved = false,
  isResolvedFriendRequest: (item: NotificationItem) => boolean,
): string {
  if (!resolved && !isResolvedFriendRequest(n)) {
    return notificationTypeIcon(n.type, n.referenceType);
  }
  const title = n.title.trim();
  if (title === "Friend request declined" || title === "Friend request withdrawn") {
    return "✕";
  }
  return "🤝";
}

export function isPlatformAnnouncement(n: NotificationItem): boolean {
  return (
    n.type === "ANNOUNCEMENT" &&
    (n.latestActorName === MODERATOR_PLATFORM_NAME ||
      n.title.includes(MODERATOR_PLATFORM_NAME))
  );
}

export function notificationAvatarUrl(
  n: NotificationItem,
  platformBrandLogoUrl: string,
): string | null {
  const hideVoteActor =
    n.type === "POST_VOTE" &&
    (!n.latestActorId ||
      n.latestActorName === "Someone" ||
      !n.latestActorAvatar?.trim());
  const useBrandLogoAvatar =
    isPlatformAnnouncement(n) || isSystemGeneratedNotification(n);
  if (hideVoteActor) return null;
  if (useBrandLogoAvatar) return platformBrandLogoUrl;
  return n.latestActorAvatar?.trim() ? n.latestActorAvatar : null;
}

export function adminMessagePrefix(n: NotificationItem): string {
  return isOfficialAdminMessage(n) ? `From ${MODERATOR_BRAND_NAME} · ` : "";
}
