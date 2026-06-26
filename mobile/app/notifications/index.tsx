import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ARCHIVE_NOTIFICATION,
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
  MY_NOTIFICATIONS,
  NEW_NOTIFICATION_SUB,
} from "@ctrend/shared/graphql/notifications";
import {
  FRIEND_SOCIAL_REFETCH_QUERIES,
  RESPOND_FRIEND_REQUEST,
} from "@ctrend/shared/graphql/friends";
import {
  friendRequestAcceptedPatch,
  friendRequestAlreadyFriendsPatch,
  friendRequestRejectedPatch,
  isPendingFriendRequestNotification,
} from "@ctrend/shared/lib/friendRequestNotification";
import { MY_FRIENDS } from "@ctrend/shared/graphql/friends";
import { CLAIM_POST_VOTE_PRIZE } from "@ctrend/shared/graphql/feed";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { notificationActivityAt } from "@ctrend/shared/lib/notificationTime";
import { PLAY_STORE_CLOSED_TESTING_URL } from "@ctrend/shared/lib/appUpdate";
import logoAsset from "../../assets/logo.png";
import { BottomNav } from "../../components/BottomNav";
import { useTheme } from "../../context/ThemeContext";
import { useBackToFeed } from "../../hooks/useBackToFeed";
import type { ColorPalette } from "../../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type GqlNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId: string | null;
  referenceType: string | null;
  postId: string | null;
  actorCount: number | null;
  latestActorId: string | null;
  latestActorName: string | null;
  latestActorAvatar: string | null;
  commentId: string | null;
  read: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt?: string | null;
};

function sortNotifications(items: GqlNotification[]): GqlNotification[] {
  return [...items].sort(
    (a, b) =>
      new Date(notificationActivityAt(b)).getTime() -
      new Date(notificationActivityAt(a)).getTime(),
  );
}

type NotifData = {
  myNotifications: {
    items: GqlNotification[];
    totalCount: number;
    unreadCount: number;
  };
};

// ─── Icon mapping ─────────────────────────────────────────────────────────────

function isOfficialAdminMessage(notif: GqlNotification): boolean {
  return notif.type === "MESSAGE" && notif.referenceType === "moderator_conversation";
}

function notifIcon(type: string, referenceType?: string | null): string {
  if (type === "MESSAGE" && referenceType === "moderator_conversation") return "🛡";
  switch (type) {
    case "NEW_COMMENT":
    case "POST_COMMENT": return "💬";
    case "COMMENT_REPLY": return "↩️";
    case "COMMENT_REACTION": return "😊";
    case "COMMENT_LIKE": return "♥";
    case "POST_HYPE": return "❤️";
    case "NEW_POST_FRIEND": return "✨";
    case "POST_VOTE": return "🗳";
    case "NEW_FOLLOWER":
    case "FRIEND_REQUEST": return "👋";
    case "FRIEND_REQUEST_ACCEPTED": return "🤝";
    case "POST_WINNER":
    case "VOTE_WINNER": return "🏆";
    case "VOTE_ENDED": return "⏱️";
    case "VOTE_PRIZE_CLAIMED": return "🎁";
    case "ANNOUNCEMENT":
    case "ADMIN_BROADCAST": return "📢";
    case "USER_GLOBAL_POST": return "🌍";
    case "REFERRAL_JOINED":
    case "REFERRAL_REDEEMED": return "✦";
    case "SYSTEM": return "ℹ";
    default: return "🔔";
  }
}

const POST_NOTIF_TYPES = new Set([
  "POST_HYPE", "POST_COMMENT", "NEW_POST_FRIEND",
  "COMMENT_REPLY", "COMMENT_REACTION", "NEW_COMMENT",
  "VOTE_ENDED", "VOTE_WINNER", "VOTE_PRIZE_CLAIMED", "POST_WINNER",
  "USER_GLOBAL_POST",
]);

/** System/platform-generated notifications that should show the brand logo avatar (not a generic emoji). */
const BRAND_NOTIF_TYPES = new Set([
  "ANNOUNCEMENT", "ADMIN_BROADCAST", "SYSTEM",
  "VOTE_ENDED", "VOTE_WINNER", "VOTE_PRIZE_CLAIMED", "POST_WINNER",
]);

const COMMENT_NOTIF_TYPES = new Set([
  "POST_COMMENT", "NEW_COMMENT", "COMMENT_REPLY", "COMMENT_REACTION", "COMMENT_LIKE",
]);

function navigateFromNotif(notif: GqlNotification) {
  if ((notif.referenceType ?? "").toLowerCase() === "android_update_required") {
    void Linking.openURL(PLAY_STORE_CLOSED_TESTING_URL);
    return;
  }
  if (notif.type === "MESSAGE" && notif.referenceId) {
    router.push(`/chat/${notif.referenceId}` as `/${string}`);
    return;
  }
  if (POST_NOTIF_TYPES.has(notif.type)) {
    const targetId = notif.postId ?? notif.referenceId;
    if (targetId) {
      if (notif.commentId || COMMENT_NOTIF_TYPES.has(notif.type)) {
        const suffix = notif.commentId ? `?commentId=${notif.commentId}` : "";
        router.push(`/comments/${targetId}${suffix}` as `/${string}`);
      } else {
        router.push(`/post/${targetId}` as `/${string}`);
      }
    }
    return;
  }
  if (notif.type === "FRIEND_REQUEST" || notif.type === "FRIEND_REQUEST_ACCEPTED" || notif.type === "NEW_FOLLOWER") {
    if (notif.referenceId) router.push(`/profile/${notif.referenceId}` as `/${string}`);
    return;
  }
  if (notif.type === "REFERRAL_JOINED" || notif.type === "REFERRAL_REDEEMED") {
    router.push("/points" as `/${string}`);
    return;
  }
  if (!notif.referenceId) return;
  if (notif.referenceType === "Fixture" || notif.referenceType === "FIXTURE") {
    // Lineup notifications open straight to the Line-up tab; others to Overview.
    const tab = notif.type === "LINEUP_AVAILABLE" ? "?tab=lineup" : "";
    router.push(`/world-cup/match/${notif.referenceId}${tab}` as `/${string}`);
  } else if (notif.referenceType === "Post" || notif.referenceType === "POST") {
    const suffix = notif.commentId ? `?commentId=${notif.commentId}` : "";
    router.push(`/post/${notif.referenceId}${suffix}` as `/${string}`);
  } else if (notif.referenceType === "User" || notif.referenceType === "USER") {
    router.push(`/profile/${notif.referenceId}` as `/${string}`);
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorPalette, isDark: boolean) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    contentArea: { flex: 1 },
    headerBtn: { paddingHorizontal: 8 },
    headerBtnText: { fontSize: 13, color: c.accent, fontWeight: "700" },

    // ── Notification row ──
    row: {
      paddingHorizontal: 14, paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
      overflow: "hidden",
    },
    rowUnread: { backgroundColor: c.section },
    // Accent bar on the left edge for unread rows
    unreadBar: {
      position: "absolute", left: 0, top: 0, bottom: 0,
      width: 3, backgroundColor: c.accent,
    },
    rowInner: { flexDirection: "row", alignItems: "flex-start", gap: 12 },

    // Icon / avatar area
    iconWrap: {
      width: 46, height: 46, borderRadius: 23,
      backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    iconText: { fontSize: 22 },
    avatarImg: { width: 46, height: 46, borderRadius: 23 },
    typeBadge: {
      position: "absolute", bottom: -1, right: -1,
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: c.card, borderWidth: 1.5, borderColor: c.bg,
      alignItems: "center", justifyContent: "center",
    },
    typeBadgeText: { fontSize: 11, lineHeight: 14 },
    iconWrapOuter: { position: "relative", width: 46, height: 46 },

    // Content column
    content: { flex: 1 },
    titleLine: {
      flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2,
    },
    title: { flex: 1, fontSize: 14, fontWeight: "700", color: c.text },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent, flexShrink: 0 },
    bodyText: { fontSize: 13, color: c.subtext, lineHeight: 18 },

    // Bottom meta row: time + inline action buttons
    metaRow: {
      flexDirection: "row", alignItems: "center",
      justifyContent: "space-between", marginTop: 6,
    },
    timeText: { fontSize: 11, color: c.muted },
    metaActions: { flexDirection: "row", alignItems: "center", gap: 12 },
    metaBtnRead: { fontSize: 11, fontWeight: "700", color: c.accent },
    // ── Swipe RIGHT to archive — icon always on right edge ──
    archiveWrap: { overflow: "hidden" as const },
    // Subtle tinted bg that fades in as you drag right
    archiveBg: {
      position: "absolute" as const,
      top: 0, bottom: 0, left: 0, right: 0,
      backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.08)",
    },
    // Archive icon lives inside the row, always on the right
    archiveHint: {
      width: 48, alignItems: "center" as const,
      justifyContent: "center" as const, gap: 3,
    },
    archiveHintIcon: { fontSize: 20 },
    archiveHintLabel: { fontSize: 9, fontWeight: "800" as const, color: isDark ? "#a5b4fc" : "#6366f1", letterSpacing: 0.5, textTransform: "uppercase" as const },

    // Friend-request actions
    friendActions: {
      flexDirection: "row", gap: 8, marginTop: 10, marginLeft: 58,
    },
    friendBtnAccept: {
      flex: 1, paddingVertical: 9, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
      backgroundColor: "#22c55e",
    },
    friendBtnDecline: {
      flex: 1, paddingVertical: 9, borderRadius: 22,
      alignItems: "center", justifyContent: "center",
      backgroundColor: "transparent", borderWidth: 1, borderColor: c.border,
    },
    friendBtnAcceptText: { fontSize: 13, fontWeight: "700", color: "#fff" },
    friendBtnDeclineText: { fontSize: 13, fontWeight: "600", color: c.subtext },

    emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    emptyText: { fontSize: 15, color: c.muted, textAlign: "center" },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    loadMoreBtn: {
      paddingVertical: 14, alignItems: "center",
      borderTopWidth: 1, borderTopColor: c.border,
    },
    loadMoreText: { fontSize: 13, color: c.accent, fontWeight: "700" },
  });
}

// ─── Notification row ─────────────────────────────────────────────────────────

type RowProps = {
  notif: GqlNotification;
  st: ReturnType<typeof makeStyles>;
  colors: ColorPalette;
  actionLoadingIds: Set<string>;
  friendIdSet: Set<string>;
  claimedPostIds: Set<string>;
  onPress: (n: GqlNotification) => void;
  onMarkRead: (notif: GqlNotification) => void;
  onArchive: (notif: GqlNotification) => void;
  onAccept: (notif: GqlNotification) => void;
  onReject: (notif: GqlNotification) => void;
  onClaim: (notif: GqlNotification) => void;
};

function NotifRow({
  notif,
  st,
  actionLoadingIds,
  friendIdSet,
  claimedPostIds,
  onPress,
  onMarkRead,
  onArchive,
  onAccept,
  onReject,
  onClaim,
}: RowProps) {
  const isLoading = actionLoadingIds.has(notif.id);
  const claimPostId = notif.postId ?? notif.referenceId;
  const showClaim =
    notif.type === "VOTE_WINNER" &&
    notif.title.trim() !== "Prize claim submitted" &&
    !notif.body.toLowerCase().includes("claim is received") &&
    Boolean(claimPostId) &&
    !claimedPostIds.has(claimPostId!);
  const alreadyFriends =
    notif.type === "FRIEND_REQUEST" &&
    !!notif.referenceId &&
    friendIdSet.has(notif.referenceId);
  const showFriendActions =
    isPendingFriendRequestNotification(notif) && !!notif.referenceId && !alreadyFriends;

  const avatarUrl = notif.latestActorId && notif.latestActorAvatar
    ? normalizeProfileImageUrl(notif.latestActorAvatar)
    : null;
  // Platform/system notifications use the brand logo avatar instead of a generic emoji.
  const useBrandAvatar =
    !avatarUrl && (BRAND_NOTIF_TYPES.has(notif.type) || isOfficialAdminMessage(notif));

  // ── Swipe RIGHT to archive ────────────────────────────────────────────────
  const translateX = useRef(new Animated.Value(0)).current;
  const swipingRef = useRef(false);

  // bg fades in and archive icon scales up as user drags right
  const bgOpacity = translateX.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: "clamp" });
  const archiveScale = translateX.interpolate({ inputRange: [0, 60, 120], outputRange: [1, 1.15, 1.35], extrapolate: "clamp" });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        !swipingRef.current && dx > 10 && Math.abs(dx) > Math.abs(dy) * 2,
      onPanResponderMove: (_, { dx }) => {
        if (dx > 0) translateX.setValue(dx);
      },
      onPanResponderRelease: (_, { dx }) => {
        if (dx > 80) {
          swipingRef.current = true;
          Animated.timing(translateX, {
            toValue: 800, duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => onArchive(notif));
        } else {
          Animated.spring(translateX, {
            toValue: 0, useNativeDriver: true, tension: 200, friction: 16,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  return (
    <View style={st.archiveWrap}>
      {/* Tinted bg fades in behind the row as you drag */}
      <Animated.View style={[st.archiveBg, { opacity: bgOpacity }]} />

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
    <Pressable style={[st.row, !notif.read && st.rowUnread]} onPress={() => onPress(notif)}>
      {/* Accent left bar for unread */}
      {!notif.read && <View style={st.unreadBar} />}

      <View style={st.rowInner}>
        {/* Avatar (actor or brand logo) with type badge, or plain emoji */}
        {avatarUrl ? (
          <View style={st.iconWrapOuter}>
            <Image source={{ uri: avatarUrl }} style={st.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
            <View style={st.typeBadge}>
              <Text style={st.typeBadgeText}>{notifIcon(notif.type, notif.referenceType)}</Text>
            </View>
          </View>
        ) : useBrandAvatar ? (
          <View style={st.iconWrapOuter}>
            <Image source={logoAsset} style={st.avatarImg} contentFit="cover" cachePolicy="memory-disk" />
            <View style={st.typeBadge}>
              <Text style={st.typeBadgeText}>{notifIcon(notif.type, notif.referenceType)}</Text>
            </View>
          </View>
        ) : (
          <View style={st.iconWrap}>
            <Text style={st.iconText}>{notifIcon(notif.type, notif.referenceType)}</Text>
          </View>
        )}

        {/* Content */}
        <View style={st.content}>
          {/* Title + unread dot inline */}
          <View style={st.titleLine}>
            <Text style={st.title} numberOfLines={1}>
              {isOfficialAdminMessage(notif) ? "Official admin message" : notif.title}
            </Text>
            {!notif.read && <View style={st.unreadDot} />}
          </View>

          <Text style={st.bodyText} numberOfLines={2}>{notif.body}</Text>

          {/* Time + mark-read button on same line (swipe replaces Dismiss) */}
          <View style={st.metaRow}>
            <Text style={st.timeText}>{formatRelativeTime(notificationActivityAt(notif))}</Text>
            {!notif.read && (
              <Pressable
                hitSlop={10}
                onPress={(e) => { e.stopPropagation?.(); onMarkRead(notif); }}
              >
                <Text style={st.metaBtnRead}>✓ Mark read</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Archive hint — right edge, always visible, scales as you swipe */}
        <Animated.View style={[st.archiveHint, { transform: [{ scale: archiveScale }] }]}>
          <Text style={st.archiveHintIcon}>📥</Text>
          <Text style={st.archiveHintLabel}>Archive</Text>
        </Animated.View>
      </View>

      {/* Friend-request Accept / Decline */}
      {showFriendActions && (
        <View style={st.friendActions}>
          <Pressable
            style={[st.friendBtnAccept, isLoading && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); onAccept(notif); }}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={st.friendBtnAcceptText}>✓ Accept</Text>
            }
          </Pressable>
          <Pressable
            style={[st.friendBtnDecline, isLoading && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); onReject(notif); }}
            disabled={isLoading}
          >
            <Text style={st.friendBtnDeclineText}>✕ Decline</Text>
          </Pressable>
        </View>
      )}

      {/* Winner claim-prize action */}
      {showClaim && (
        <View style={st.friendActions}>
          <Pressable
            style={[st.friendBtnAccept, isLoading && { opacity: 0.6 }]}
            onPress={(e) => { e.stopPropagation?.(); onClaim(notif); }}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={st.friendBtnAcceptText}>🏆 Claim prize</Text>
            }
          </Pressable>
        </View>
      )}
    </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme();
  const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const goBack = useBackToFeed(); // cold-start from a notification → back to feed

  // Clear app icon badge when user opens the notifications screen
  useEffect(() => {
    void Notifications.setBadgeCountAsync(0);
  }, []);

  const [skip, setSkip] = useState(0);
  const [items, setItems] = useState<GqlNotification[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());
  const [claimedPostIds, setClaimedPostIds] = useState<Set<string>>(new Set());

  // Load persisted claimed prize postIds so the button stays hidden across navigations.
  useEffect(() => {
    AsyncStorage.getItem("ctrend_claimed_prizes").then((raw) => {
      if (!raw) return;
      try { setClaimedPostIds(new Set(JSON.parse(raw) as string[])); } catch { /* ignore */ }
    });
  }, []);

  const { data: friendsData } = useQuery<{ myFriends: Array<{ id: string }> }>(MY_FRIENDS, {
    fetchPolicy: "cache-and-network",
  });

  const friendIdSet = useMemo(
    () => new Set((friendsData?.myFriends ?? []).map((f) => f.id)),
    [friendsData],
  );

  const { loading, refetch } = useQuery<NotifData>(MY_NOTIFICATIONS, {
    variables: { skip: 0, take: PAGE_SIZE },
    fetchPolicy: "network-only",
    onCompleted: (data) => {
      const fetched = data.myNotifications.items.filter((n) => !n.archived);
      setItems(fetched);
      setSkip(fetched.length);
      setHasMore(fetched.length < data.myNotifications.totalCount);
    },
  });

  useEffect(() => {
    setItems((prev) =>
      prev.map((n) => {
        if (
          !isPendingFriendRequestNotification(n) ||
          !n.referenceId ||
          !friendIdSet.has(n.referenceId)
        ) {
          return n;
        }
        return { ...n, ...friendRequestAlreadyFriendsPatch(n) };
      }),
    );
  }, [friendIdSet]);

  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [archiveNotif] = useMutation(ARCHIVE_NOTIFICATION);
  const [markAll, { loading: markingAll }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);
  const [respondMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });
  const [claimMut] = useMutation(CLAIM_POST_VOTE_PRIZE);

  // Sound is played by the global subscription in _layout.tsx — only update list here.
  useSubscription(NEW_NOTIFICATION_SUB, {
    onData: ({ data }) => {
      const n = data.data?.newNotification as GqlNotification | null;
      if (!n || n.archived) return;
      setItems((prev) => {
        const exists = prev.some((x) => x.id === n.id);
        const merged = exists
          ? [n, ...prev.filter((x) => x.id !== n.id)]
          : [n, ...prev];
        return sortNotifications(merged);
      });
    },
  });

  const handlePress = useCallback(
    async (notif: GqlNotification) => {
      if (!notif.read) {
        setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
        try { await markRead({ variables: { id: notif.id } }); } catch { /* silent */ }
      }
      navigateFromNotif(notif);
    },
    [markRead],
  );

  const handleMarkRead = useCallback(
    (notif: GqlNotification) => {
      if (notif.read) return;
      setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
      void markRead({ variables: { id: notif.id } });
    },
    [markRead],
  );

  const handleArchive = useCallback(
    (notif: GqlNotification) => {
      setItems((prev) => prev.filter((n) => n.id !== notif.id));
      void archiveNotif({ variables: { id: notif.id } });
    },
    [archiveNotif],
  );

  const handleAccept = useCallback(async (notif: GqlNotification) => {
    if (!notif.referenceId) return;
    const rollback = { title: notif.title, body: notif.body, read: notif.read };
    setItems((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, ...friendRequestAcceptedPatch(n) } : n)),
    );
    setActionLoadingIds((prev) => new Set([...prev, notif.id]));
    try {
      await respondMut({ variables: { requesterId: notif.referenceId, accept: true } });
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, ...rollback } : n)),
      );
    } finally {
      setActionLoadingIds((prev) => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  }, [respondMut]);

  const handleReject = useCallback(async (notif: GqlNotification) => {
    if (!notif.referenceId) return;
    const rollback = { title: notif.title, body: notif.body, read: notif.read };
    setItems((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, ...friendRequestRejectedPatch(n) } : n)),
    );
    setActionLoadingIds((prev) => new Set([...prev, notif.id]));
    try {
      await respondMut({ variables: { requesterId: notif.referenceId, accept: false } });
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, ...rollback } : n)),
      );
    } finally {
      setActionLoadingIds((prev) => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  }, [respondMut]);

  const handleClaim = useCallback(async (notif: GqlNotification) => {
    const postId = notif.postId ?? notif.referenceId;
    if (!postId) return;
    const rollback = { title: notif.title, body: notif.body, read: notif.read };
    setActionLoadingIds((prev) => new Set([...prev, notif.id]));
    try {
      await claimMut({ variables: { postId } });
      // Persist the claimed postId so the button stays hidden even after navigation.
      setClaimedPostIds((prev) => {
        const next = new Set(prev).add(postId);
        void AsyncStorage.setItem("ctrend_claimed_prizes", JSON.stringify([...next]));
        return next;
      });
      setItems((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? {
                ...n,
                read: true,
                title: "Prize claim submitted",
                body: "Your claim is received. A moderator will connect with you soon.",
              }
            : n,
        ),
      );
      void markRead({ variables: { id: notif.id } }).catch(() => {});
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, ...rollback } : n)),
      );
    } finally {
      setActionLoadingIds((prev) => { const s = new Set(prev); s.delete(notif.id); return s; });
    }
  }, [claimMut, markRead]);

  async function handleMarkAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await markAll(); } catch { /* silent */ }
  }

  async function loadMore() {
    try {
      const { data } = await refetch({ skip, take: PAGE_SIZE });
      const fetched = data.myNotifications.items;
      setItems((prev) => [...prev, ...fetched]);
      setSkip((s) => s + fetched.length);
      setHasMore(items.length + fetched.length < data.myNotifications.totalCount);
    } catch { /* silent */ }
  }

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <View style={st.flex}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "Notifications",
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.topbar },
          headerTitleStyle: { color: colors.text },
          headerLeft: () => (
            <TouchableOpacity onPress={goBack} style={st.headerBtn}>
              <Text style={st.headerBtnText}>← Back</Text>
            </TouchableOpacity>
          ),
          headerRight: () =>
            unreadCount > 0 ? (
              <TouchableOpacity onPress={() => void handleMarkAll()} style={st.headerBtn} disabled={markingAll}>
                {markingAll
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={st.headerBtnText}>Mark all read</Text>
                }
              </TouchableOpacity>
            ) : null,
        }}
      />

      <View style={st.contentArea}>
      {loading && items.length === 0 ? (
        <View style={st.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={st.emptyWrap}>
          <Text style={st.emptyText}>No notifications yet.{"\n"}Check back later!</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <NotifRow
              notif={item}
              st={st}
              colors={colors}
              actionLoadingIds={actionLoadingIds}
              friendIdSet={friendIdSet}
              claimedPostIds={claimedPostIds}
              onPress={handlePress}
              onMarkRead={handleMarkRead}
              onArchive={handleArchive}
              onAccept={handleAccept}
              onReject={handleReject}
              onClaim={handleClaim}
            />
          )}
          ListFooterComponent={
            hasMore ? (
              <Pressable style={st.loadMoreBtn} onPress={() => void loadMore()}>
                <Text style={st.loadMoreText}>Load more</Text>
              </Pressable>
            ) : null
          }
        />
      )}
      </View>

      <BottomNav />
    </View>
  );
}
