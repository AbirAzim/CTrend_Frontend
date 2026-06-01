export type FriendRequestNotifFields = {
  type: string;
  title: string;
  body: string;
  read: boolean;
  latestActorName?: string | null;
};

export function friendRequestActorName(n: FriendRequestNotifFields): string {
  return n.latestActorName?.trim() || "their";
}

export function isResolvedFriendRequest(n: FriendRequestNotifFields): boolean {
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
  n: FriendRequestNotifFields,
): Pick<FriendRequestNotifFields, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "Friend request accepted",
    body: `You accepted ${name}'s friend request`,
    read: true,
  };
}

export function friendRequestRejectedPatch(
  n: FriendRequestNotifFields,
): Pick<FriendRequestNotifFields, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "Friend request declined",
    body: `You declined ${name}'s friend request`,
    read: true,
  };
}

export function friendRequestAlreadyFriendsPatch(
  n: FriendRequestNotifFields,
): Pick<FriendRequestNotifFields, "title" | "body" | "read"> {
  const name = friendRequestActorName(n);
  return {
    title: "You're now friends",
    body: `You and ${name} are friends`,
    read: true,
  };
}

export function isPendingFriendRequestNotification(
  n: FriendRequestNotifFields,
): boolean {
  return n.type === "FRIEND_REQUEST" && n.title.trim() === "New friend request";
}
