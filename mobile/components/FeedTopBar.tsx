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
  useFrameCallback,
  useSharedValue,
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

/** Pixels of scroll mapped to full tagline hide/show. */
export const TOP_NAV_COLLAPSE_DISTANCE = 140;
const LOGO_W = 112;
const LOGO_H = 30;
const TAG_H = 16;
const SHELL_PAD_TOP = 12;
const SHELL_PAD_BOTTOM_EXPANDED = 14;
const SHELL_PAD_BOTTOM_COMPACT = 12;
const SEARCH_H = 38;
const EXPAND_LERP = 0.16;

type Props = {
  scrollY: SharedValue<number>;
};

function FeedTopBarInner({ scrollY }: Props) {
  const { logout, isAuthenticated } = useAuth();
  const { isDark, toggleTheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const shellPaddingTop = insets.top + SHELL_PAD_TOP;

  const expandTarget = useDerivedValue(() =>
    interpolate(scrollY.value, [0, TOP_NAV_COLLAPSE_DISTANCE], [1, 0], Extrapolation.CLAMP),
  );

  const expand = useSharedValue(1);

  useFrameCallback(() => {
    "worklet";
    const target = expandTarget.value;
    const diff = target - expand.value;
    if (Math.abs(diff) < 0.001) {
      expand.value = target;
      return;
    }
    expand.value += diff * EXPAND_LERP;
  });

  const shellStyle = useAnimatedStyle(() => ({
    paddingTop: shellPaddingTop,
    paddingBottom: interpolate(
      expand.value,
      [0, 1],
      [SHELL_PAD_BOTTOM_COMPACT, SHELL_PAD_BOTTOM_EXPANDED],
      Extrapolation.CLAMP,
    ),
  }));

  const brandStyle = useAnimatedStyle(() => ({
    height: LOGO_H + TAG_H * expand.value,
  }));

  const tagSlotStyle = useAnimatedStyle(() => ({
    height: TAG_H * expand.value,
  }));

  const tagStyle = useAnimatedStyle(() => ({
    opacity: expand.value,
    transform: [
      {
        translateY: interpolate(expand.value, [0, 1], [TAG_H * 0.65, 0], Extrapolation.CLAMP),
      },
      {
        scaleY: interpolate(expand.value, [0, 1], [0.82, 1], Extrapolation.CLAMP),
      },
    ],
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
        !isDark && styles.topBarLight,
      ]}
    >
      <View style={styles.topBarRow}>
        <Pressable style={styles.brandPress} hitSlop={4} accessibilityLabel="Ke Jitbe">
          <Animated.View style={[styles.brand, brandStyle]}>
            <View style={[styles.brandBar, isDark ? styles.brandBarDark : styles.brandBarLight]} />
            <View style={styles.brandBody}>
              <View style={styles.logoBox}>
                <Image
                  source={isDark ? headerLogoAsset : headerLogoLightAsset}
                  style={styles.brandLogoFill}
                  contentFit="contain"
                  tintColor={isDark ? undefined : "#312e81"}
                  accessibilityLabel="Ke Jitbe"
                />
              </View>
              {isAuthenticated ? (
                <Animated.View style={[styles.tagClip, tagSlotStyle]}>
                  <Animated.View style={tagStyle}>
                    <Text
                      style={[styles.brandTag, isDark ? styles.brandTagDark : styles.brandTagLight]}
                      numberOfLines={1}
                    >
                      Compare · vote · vibe
                    </Text>
                  </Animated.View>
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
          <View style={styles.searchInline}>
            <FeedNavSearch />
          </View>
        )}

        <View style={styles.actions}>
          <PressableScale style={styles.plainIconBtn} onPress={toggleTheme} hitSlop={6} accessibilityLabel="Toggle theme">
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={isDark ? colors.text : colors.subtext} />
          </PressableScale>

          {isAuthenticated && <CoinCounter />}

          {isAuthenticated && (
            <PressableScale style={styles.plainIconBtn} hitSlop={6} onPress={() => router.push("/notifications" as `/${string}`)} accessibilityLabel="Notifications">
              <View style={styles.notifIconWrap}>
                <Ionicons name="notifications-outline" size={22} color={isDark ? colors.text : colors.subtext} />
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
              <Ionicons name="log-out-outline" size={22} color={isDark ? colors.text : colors.subtext} />
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
  topBarLight: Platform.select({
    android: {},
    default: {
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 6,
    },
  }),
  topBarClip: {
    overflow: "hidden",
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInline: {
    flex: 1,
    minWidth: 0,
    height: SEARCH_H,
    justifyContent: "center",
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
  brandBarLight: {
    backgroundColor: "#312e81",
  },
  brandBarDark: {
    backgroundColor: "#9b5de5",
  },
  brandBody: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
  },
  logoBox: {
    width: LOGO_W,
    height: LOGO_H,
  },
  tagClip: {
    overflow: "hidden",
    justifyContent: "flex-end",
    transformOrigin: "top",
  },
  brandTag: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    lineHeight: TAG_H,
  },
  brandTagLight: { color: "#71717a" },
  brandTagDark: { color: "#c4b5fd" },
  brandLogoFill: { width: "100%", height: "100%" },
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
