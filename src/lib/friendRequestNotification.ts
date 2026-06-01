import type { NotificationItem } from "../context/NotificationContext";

export function friendRequestActorName(n: NotificationItem): string {
  return n.latestActorName?.trim() || "their";
}

/** True when the server (or optimistic UI) has resolved this friend-request row. */
export function isResolvedFriendRequest(n: NotificationItem): boolean {
  if (n.type !== "FRIEND_REQUEST") return false;
  const title = n.title.trim();
  return (
    title === "Friend request accepted" ||
    title === "You're now friends" ||
    title === "Friend request declined" ||
    title === "Friend request withdrawn"
  );
}

export function friendRequestAcceptedPatch(
  n: NotificationItem,
): Pick<NotificationItem, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "Friend request accepted",
    body: `You accepted ${name}'s friend request`,
    read: true,
  };
}

export function friendRequestRejectedPatch(
  n: NotificationItem,
): Pick<NotificationItem, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "Friend request declined",
    body: `You declined ${name}'s friend request`,
    read: true,
  };
}

export function friendRequestAlreadyFriendsPatch(
  n: NotificationItem,
): Pick<NotificationItem, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "You're now friends",
    body: `You and ${name} are friends`,
    read: true,
  };
}

export function isPendingFriendRequestNotification(
  n: NotificationItem,
): boolean {
  return n.type === "FRIEND_REQUEST" && n.title.trim() === "New friend request";
}
