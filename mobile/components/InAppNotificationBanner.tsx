import { router } from "expo-router";
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotification, type NotifToast } from "../context/NotificationContext";
import { openAndroidUpdateLink } from "../lib/messageNotifications";
import { useTheme } from "../context/ThemeContext";
import logoAsset from "../assets/logo.png";

const POST_NOTIF_TYPES = new Set([
  "POST_HYPE", "POST_COMMENT", "NEW_POST_FRIEND",
  "COMMENT_REPLY", "COMMENT_REACTION", "NEW_COMMENT",
  "USER_GLOBAL_POST",
  "VOTE_ENDED", "VOTE_WINNER", "VOTE_PRIZE_CLAIMED", "POST_WINNER",
]);

const BRAND_NOTIF_TYPES = new Set([
  "ANNOUNCEMENT", "ADMIN_BROADCAST", "SYSTEM",
  "VOTE_ENDED", "VOTE_WINNER", "VOTE_PRIZE_CLAIMED", "POST_WINNER",
]);

function notifIcon(type: string): string {
  switch (type) {
    case "NEW_MESSAGE": return "✉️";
    case "NEW_COMMENT":
    case "POST_COMMENT": return "💬";
    case "COMMENT_REPLY": return "↩️";
    case "COMMENT_REACTION": return "😊";
    case "POST_HYPE": return "❤️";
    case "NEW_POST_FRIEND": return "✨";
    case "USER_GLOBAL_POST": return "🌍";
    case "POST_VOTE": return "🗳";
    case "FRIEND_REQUEST": return "👋";
    case "FRIEND_REQUEST_ACCEPTED": return "🤝";
    case "ANNOUNCEMENT":
    case "ADMIN_BROADCAST": return "📢";
    default: return "🔔";
  }
}

function handleToastTap(toast: NotifToast) {
  if ((toast.referenceType ?? "").toLowerCase() === "android_update_required") {
    openAndroidUpdateLink();
    return;
  }
  if (toast.type === "NEW_MESSAGE" || toast.referenceType === "CONVERSATION") {
    if (toast.referenceId) router.push(`/chat/${toast.referenceId}` as `/${string}`);
    return;
  }
  if (POST_NOTIF_TYPES.has(toast.type)) {
    const id = toast.postId ?? toast.referenceId;
    if (id) router.push(`/post/${id}` as `/${string}`);
    return;
  }
  if (toast.type === "FRIEND_REQUEST" || toast.type === "FRIEND_REQUEST_ACCEPTED") {
    if (toast.referenceId) router.push(`/profile/${toast.referenceId}` as `/${string}`);
    return;
  }
  router.push("/notifications" as `/${string}`);
}

function ToastAvatar({ toast }: { toast: NotifToast }) {
  const useBrand = !toast.actorAvatarUrl && BRAND_NOTIF_TYPES.has(toast.type);

  if (toast.actorAvatarUrl) {
    return (
      <Image
        source={{ uri: toast.actorAvatarUrl }}
        style={st.avatarImg}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  if (useBrand) {
    return (
      <Image
        source={logoAsset}
        style={st.avatarImg}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return <Text style={st.iconText}>{notifIcon(toast.type)}</Text>;
}

export function InAppNotificationBanner() {
  const { toast, dismissToast } = useNotification();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const visible = useRef(false);

  useEffect(() => {
    if (toast && !visible.current) {
      visible.current = true;
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!toast && visible.current) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => { visible.current = false; });
    }
  }, [toast, translateY, opacity]);

  if (!toast && !visible.current) return null;

  return (
    <Animated.View
      style={[
        st.container,
        {
          top: insets.top + 8,
          backgroundColor: colors.card,
          borderColor: colors.border,
          transform: [{ translateY }],
          opacity,
          pointerEvents: toast ? "box-none" : "none",
        },
      ]}
    >
      <Pressable
        style={st.inner}
        onPress={() => { dismissToast(); if (toast) handleToastTap(toast); }}
      >
        <View style={[st.iconCircle, { backgroundColor: colors.section }]}>
          {toast ? <ToastAvatar toast={toast} /> : null}
        </View>
        <View style={st.textWrap}>
          <Text style={[st.title, { color: colors.text }]} numberOfLines={1}>
            {toast?.title}
          </Text>
          <Text style={[st.body, { color: colors.subtext }]} numberOfLines={2}>
            {toast?.body}
          </Text>
        </View>
        <Pressable onPress={dismissToast} hitSlop={10} style={st.closeBtn}>
          <Text style={[st.closeText, { color: colors.muted }]}>✕</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  iconText: { fontSize: 18 },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 16 },
  closeBtn: { paddingLeft: 4 },
  closeText: { fontSize: 14, fontWeight: "700" },
});
