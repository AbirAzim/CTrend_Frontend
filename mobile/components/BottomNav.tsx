import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import { useEffect } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { MY_SAVED_POSTS } from "@ctrend/shared/graphql/feed";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useTabBar } from "../context/TabBarContext";

// ─── Standalone bottom navigation bar ──────────────────────────────────────────
// Mirrors the FloatingTabBar in app/tabs/_layout.tsx, but is driven by `router`
// instead of the Tabs navigator — so non-tab screens (notifications, etc.) can
// show the same footer. `active` highlights a tab when one matches the screen.

type TabName = "index" | "keeps" | "messages" | "profile";

const TABS: Array<{ name: TabName; label: string; route: `/${string}`; icon: [string, string] }> = [
  { name: "index", label: "Feed", route: "/tabs", icon: ["home", "home-outline"] },
  { name: "keeps", label: "Keeps", route: "/tabs/keeps", icon: ["bookmark", "bookmark-outline"] },
  { name: "messages", label: "Chats", route: "/tabs/messages", icon: ["chatbubble-ellipses", "chatbubble-ellipses-outline"] },
  { name: "profile", label: "Profile", route: "/tabs/profile", icon: ["person", "person-outline"] },
];

export function BottomNav({ active }: { active?: TabName }) {
  const { colors, isDark } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { savedCount, setSavedCount, translateY } = useTabBar();
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const { data: convData } = useQuery<{ myConversations: Array<{ unreadCount: number }> }>(
    MY_CONVERSATIONS,
    { fetchPolicy: "cache-first", skip: !isAuthenticated },
  );
  const totalUnread = (convData?.myConversations ?? []).reduce((s, c) => s + (c.unreadCount > 0 ? 1 : 0), 0);

  const { data: savedData } = useQuery<{ mySavedPosts: unknown[] }>(MY_SAVED_POSTS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });
  useEffect(() => {
    if (savedData?.mySavedPosts) setSavedCount(savedData.mySavedPosts.length);
  }, [savedData]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(tab: { name: TabName; route: `/${string}` }) {
    if (!isAuthenticated && tab.name !== "index") {
      router.push("/auth/login" as `/${string}`);
      return;
    }
    router.navigate(tab.route);
  }

  // Insert the emphasized Create action in the middle (between keeps and messages).
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  function renderTab(tab: typeof TABS[number]) {
    const focused = active === tab.name;
    const iconColor: ColorValue = focused
      ? isDark ? "#ffffff" : colors.accent
      : isDark ? "#c7c7c7" : "#9ca3af";
    const badge =
      tab.name === "messages" ? totalUnread :
      tab.name === "keeps" ? savedCount : 0;

    return (
      <View key={tab.name} style={styles.tabItem}>
        <Pressable style={styles.tabPress} onPress={() => go(tab)}>
          <View style={styles.iconWrap}>
            <Ionicons name={(focused ? tab.icon[0] : tab.icon[1]) as never} size={27} color={iconColor} />
            {badge > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge > 9 && tab.name === "messages" ? "9+" : String(badge)}</Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.tabLabel,
              { color: focused ? (isDark ? "#ffffff" : colors.accent) : isDark ? "#c7c7c7" : "#9ca3af" },
              focused && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBg,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 6,
          transform: [{ translateY }],
        },
      ]}
    >
      {left.map(renderTab)}

      {/* Emphasized Create action */}
      <View style={styles.tabItem}>
        <Pressable
          onPress={() => go({ name: "index", route: "/tabs/create" } as never)}
          style={[styles.createBtn, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      {right.map(renderTab)}

      {isAdmin ? (
        <View style={styles.tabItem}>
          <Pressable style={styles.tabPress} onPress={() => router.push("/admin" as `/${string}`)}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={24} color={colors.accent} />
              <View style={[styles.adminDot, { backgroundColor: colors.accent }]} />
            </View>
            <Text style={[styles.tabLabel, { color: colors.accent }, styles.tabLabelActive]} numberOfLines={1}>
              Admin
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.tabItem}>
          <Pressable style={styles.tabPress} onPress={() => router.push("/world-cup" as `/${string}`)}>
            <View style={styles.iconWrap}>
              <Ionicons name="trophy" size={26} color={isDark ? "#c7c7c7" : "#9ca3af"} />
            </View>
            <Text
              style={[styles.tabLabel, { color: isDark ? "#c7c7c7" : "#9ca3af" }]}
              numberOfLines={1}
            >
              World Cup
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 4,
    elevation: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  tabPress: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingTop: 2,
    width: "100%",
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: "800",
  },
  createBtn: {
    width: 52,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    elevation: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  adminDot: {
    position: "absolute", top: -3, right: -3,
    width: 7, height: 7, borderRadius: 4,
  },
});
