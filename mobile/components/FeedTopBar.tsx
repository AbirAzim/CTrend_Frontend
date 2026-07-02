import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo } from "react";
import { Pressable, Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UNREAD_NOTIFICATION_COUNT } from "@ctrend/shared/graphql/notifications";
import headerLogoAsset from "../assets/header-logo.png";
import headerLogoLightAsset from "../assets/header-logo-light.png";
import { PressableScale } from "./PressableScale";
import { CoinCounter } from "./CoinCounter";
import { FeedNavSearch } from "./FeedNavSearch";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/** Scroll distance over which the header eases from expanded → compact. */
export const TOP_NAV_COLLAPSE_DISTANCE = 100;
const LOGO_W_EXPANDED = 96;
const LOGO_H_EXPANDED = 26;
const LOGO_W_COMPACT = 68;
const LOGO_H_COMPACT = 20;
const TAG_H = 14;

type Props = {
  scrollY: SharedValue<number>;
};

function smoothstep(t: number) {
  "worklet";
  return t * t * (3 - 2 * t);
}

function FeedTopBarInner({ scrollY }: Props) {
  const { logout, isAuthenticated } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingTopExpanded = insets.top + 10;
  const paddingTopCompact = insets.top + 6;

  const expand = useDerivedValue(() => {
    const linear = interpolate(
      scrollY.value,
      [0, TOP_NAV_COLLAPSE_DISTANCE],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return smoothstep(linear);
  });

  const shellStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(expand.value, [0, 1], [paddingTopCompact, paddingTopExpanded], Extrapolation.CLAMP),
    paddingBottom: interpolate(expand.value, [0, 1], [6, 12], Extrapolation.CLAMP),
  }));

  const brandStyle = useAnimatedStyle(() => {
    const logoH = interpolate(expand.value, [0, 1], [LOGO_H_COMPACT, LOGO_H_EXPANDED], Extrapolation.CLAMP);
    const tagH = interpolate(expand.value, [0, 1], [0, TAG_H], Extrapolation.CLAMP);
    return { height: logoH + tagH };
  });

  const logoStyle = useAnimatedStyle(() => ({
    width: interpolate(expand.value, [0, 1], [LOGO_W_COMPACT, LOGO_W_EXPANDED], Extrapolation.CLAMP),
    height: interpolate(expand.value, [0, 1], [LOGO_H_COMPACT, LOGO_H_EXPANDED], Extrapolation.CLAMP),
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expand.value, [0, 0.45, 1], [0, 0, 1], Extrapolation.CLAMP),
    height: interpolate(expand.value, [0, 1], [0, TAG_H], Extrapolation.CLAMP),
  }));

  const searchStyle = useAnimatedStyle(() => ({
    height: interpolate(expand.value, [0, 1], [30, 36], Extrapolation.CLAMP),
  }));

  const { data: notifData } = useQuery(UNREAD_NOTIFICATION_COUNT, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const unreadCount: number = notifData?.unreadNotificationCount ?? 0;

  async function handleLogout() {
    await logout();
    router.replace("/auth/login");
  }

  return (
    <Animated.View
      style={[
        styles.topBar,
        styles.topBarClip,
        shellStyle,
        {
          paddingHorizontal: 14,
          backgroundColor: colors.topbar,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.topBarRow}>
        <Pressable style={styles.brandPress} hitSlop={4} accessibilityLabel="Ke Jitbe">
          <Animated.View style={[styles.brand, brandStyle]}>
            <View style={[styles.brandBar, styles.brandBarGradient]} />
            <View style={styles.brandBody}>
              <Animated.View style={logoStyle}>
                <Image
                  source={isDark ? headerLogoAsset : headerLogoLightAsset}
                  style={styles.brandLogoFill}
                  contentFit="contain"
                  accessibilityLabel="Ke Jitbe"
                />
              </Animated.View>
              {isAuthenticated ? (
                <Animated.View style={[tagStyle, styles.tagClip]}>
                  <Text
                    style={[styles.brandTag, isDark ? styles.brandTagDark : styles.brandTagLight]}
                    numberOfLines={1}
                  >
                    Compare · vote · vibe
                  </Text>
                </Animated.View>
              ) : (
                <Text
                  style={[styles.brandTag, isDark ? styles.brandTagDark : styles.brandTagLight]}
                  numberOfLines={1}
                >
                  Compare · vote · vibe
                </Text>
              )}
            </View>
          </Animated.View>
        </Pressable>

        {isAuthenticated && (
          <Animated.View style={[styles.searchInline, searchStyle]}>
            <FeedNavSearch />
          </Animated.View>
        )}

        <View style={styles.actions}>
          <PressableScale style={styles.plainIconBtn} onPress={toggleTheme} hitSlop={6} accessibilityLabel="Toggle theme">
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.text} />
          </PressableScale>

          {isAuthenticated && <CoinCounter />}

          {isAuthenticated && (
            <PressableScale style={styles.plainIconBtn} hitSlop={6} onPress={() => router.push("/notifications" as `/${string}`)} accessibilityLabel="Notifications">
              <View style={styles.notifIconWrap}>
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadCount > 0 && (
                  <View style={[styles.notifBadge, { borderColor: colors.topbar }]}>
                    <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
                  </View>
                )}
              </View>
            </PressableScale>
          )}

          {isAuthenticated ? (
            <PressableScale
              style={styles.plainIconBtn}
              onPress={() => void handleLogout()}
              hitSlop={6}
              accessibilityLabel="Logout"
            >
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
            </PressableScale>
          ) : (
            <PressableScale
              style={[styles.circleBtn, styles.circleBtnLogin]}
              onPress={() => router.push("/auth/login")}
              hitSlop={6}
            >
              <Ionicons name="log-in-outline" size={19} color="#fff" />
              <Text style={styles.loginLabel}>Log in</Text>
            </PressableScale>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export const FeedTopBar = memo(FeedTopBarInner);

const styles = StyleSheet.create({
  topBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...(Platform.OS === "android"
      ? { elevation: 0 }
      : {
          elevation: 4,
          shadowColor: "#6366f1",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        }),
  },
  topBarClip: {
    overflow: "hidden",
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  searchInline: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-end",
  },
  brandPress: {
    flexShrink: 0,
  },
  brand: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    overflow: "hidden",
  },
  brandBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 999,
  },
  brandBarGradient: {
    backgroundColor: "#9b5de5",
  },
  brandBody: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
  },
  tagClip: {
    overflow: "hidden",
  },
  brandLogoFill: { width: "100%", height: "100%" },
  brandTag: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  brandTagLight: { color: "#6d28d9" },
  brandTagDark: { color: "#c4b5fd" },
  actions: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  plainIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "visible",
  },
  circleBtnLogin: {
    width: "auto",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: "#ec4899",
  },
  loginLabel: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  notifIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -6,
    right: -7,
    backgroundColor: "#e11d48",
    borderRadius: 7,
    borderWidth: 1.5,
    minWidth: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  notifBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", lineHeight: 10 },
});
