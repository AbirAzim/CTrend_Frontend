import { Ionicons } from "@expo/vector-icons";
import { useQuery, useApolloClient } from "@apollo/client/react";
import { Tabs, router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { MY_SAVED_POSTS } from "@ctrend/shared/graphql/feed";
import { WORLD_CUP_FIXTURES } from "@ctrend/shared/graphql/worldcup";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

// ─── Full-width bottom navigation bar (Instagram / Facebook style) ─────────────

function FloatingTabBar(props: {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string; tabBarIcon?: (p: { color: ColorValue; size: number; focused: boolean }) => React.ReactNode; tabBarBadge?: string | number } }>;
  navigation: { emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}) {
  const { colors, isDark } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { translateY, savedCount, setSavedCount } = useTabBar();
  const isAdmin = user?.role?.toLowerCase() === "admin";

  const { data: convData } = useQuery<{ myConversations: Array<{ unreadCount: number }> }>(
    MY_CONVERSATIONS,
    { fetchPolicy: "cache-and-network", skip: !isAuthenticated, pollInterval: 15000 },
  );
  const totalUnread = (convData?.myConversations ?? []).reduce((s, c) => s + (c.unreadCount > 0 ? 1 : 0), 0);

  // Highlight the World Cup icon when that page is open (it lives outside the
  // tab navigator, so the tab state doesn't track it).
  const pathname = usePathname();
  const wcActive = pathname?.includes("world-cup") ?? false;

  // Initialize saved count from server on startup
  const { data: savedData } = useQuery<{ mySavedPosts: unknown[] }>(MY_SAVED_POSTS, {
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });
  useEffect(() => {
    if (savedData?.mySavedPosts) setSavedCount(savedData.mySavedPosts.length);
  }, [savedData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-tab scale animation for press feedback
  const tabScales = useRef(props.state.routes.map(() => new Animated.Value(1))).current;

  function pressIn(i: number) {
    Animated.spring(tabScales[i], { toValue: 0.88, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  }
  function pressOut(i: number) {
    Animated.spring(tabScales[i], { toValue: 1, useNativeDriver: true, tension: 200, friction: 12 }).start();
  }

  return (
    <Animated.View
      style={[styles.barWrap, { transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.tabBg,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 6,
          },
        ]}
      >
        {props.state.routes.map((route, index) => {
          // World Cup is a tab (for kept-alive switching) but its button is
          // rendered manually in the 6th slot below — skip the auto-render so it
          // doesn't show a second, icon-less tab here.
          if (route.name === "world-cup") return null;
          const focused = props.state.index === index;
          const descriptor = props.descriptors[route.key];
          const label = descriptor.options.title ?? route.name;
          const isCreate = route.name === "create";
          const messagesIdx = props.state.routes.findIndex((r) => r.name === "messages");
          const isMessages = index === messagesIdx;

          // Instagram-style: bright white icons; active = pure white (filled), inactive = soft white.
          const iconColor: ColorValue = focused
            ? isDark ? "#ffffff" : colors.accent
            : isDark ? "#c7c7c7" : "#9ca3af";

          const icon = descriptor.options.tabBarIcon?.({ color: iconColor, size: 27, focused });

          function handlePress() {
            const event = props.navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented) {
              if (!isAuthenticated && route.name !== "index") {
                router.push("/auth/login" as never);
                return;
              }
              props.navigation.navigate(route.name);
            }
          }

          // ── Create — emphasized accent action, inline in the bar ──
          if (isCreate) {
            return (
              <Animated.View key={route.key} style={[styles.tabItem, { transform: [{ scale: tabScales[index] }] }]}>
                <Pressable
                  onPress={handlePress}
                  onPressIn={() => pressIn(index)}
                  onPressOut={() => pressOut(index)}
                  style={[styles.createBtn, { backgroundColor: colors.accent, shadowColor: colors.accent }]}
                >
                  <Ionicons name="add" size={26} color="#fff" />
                </Pressable>
              </Animated.View>
            );
          }

          // ── Regular tab ──
          return (
            <Animated.View key={route.key} style={[styles.tabItem, { transform: [{ scale: tabScales[index] }] }]}>
              <Pressable
                style={styles.tabPress}
                onPress={handlePress}
                onPressIn={() => pressIn(index)}
                onPressOut={() => pressOut(index)}
              >
                <View style={styles.iconWrap}>
                  {icon}
                  {isMessages && totalUnread > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.badgeText}>{totalUnread > 9 ? "9+" : totalUnread}</Text>
                    </View>
                  )}
                  {route.name === "keeps" && savedCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.badgeText}>{savedCount > 99 ? "99+" : String(savedCount)}</Text>
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
                  {label}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}

        {/* ── 6th slot: Admin shield for admins, else World Cup for everyone ── */}
        {isAdmin ? (
          <Animated.View style={styles.tabItem}>
            <Pressable style={styles.tabPress} onPress={() => router.push("/admin" as `/${string}`)}>
              <View style={styles.iconWrap}>
                <Ionicons name="shield-checkmark" size={24} color={colors.accent} />
                <View style={[styles.adminDot, { backgroundColor: colors.accent }]} />
              </View>
              <Text style={[styles.tabLabel, { color: colors.accent }, styles.tabLabelActive]} numberOfLines={1}>
                Admin
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={styles.tabItem}>
            <Pressable style={styles.tabPress} onPress={() => router.navigate("/tabs/world-cup" as `/${string}`)}>
              <View style={styles.iconWrap}>
                <Ionicons
                  name={wcActive ? "trophy" : "trophy-outline"}
                  size={26}
                  color={wcActive ? (isDark ? "#ffffff" : colors.accent) : isDark ? "#c7c7c7" : "#9ca3af"}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  { color: wcActive ? (isDark ? "#ffffff" : colors.accent) : isDark ? "#c7c7c7" : "#9ca3af" },
                  wcActive && styles.tabLabelActive,
                ]}
                numberOfLines={1}
              >
                World Cup
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { hydrated, user } = useAuth();
  const { colors } = useTheme();
  const client = useApolloClient();

  // Warm the World Cup fixtures cache once, in the background, so tapping the
  // trophy opens instantly. Imperative (not useQuery) so it never re-renders or
  // slows the tab bar. Non-admins only (they're the ones who see the WC icon).
  useEffect(() => {
    if (!hydrated || user?.role?.toLowerCase() === "admin") return;
    void client
      .query({ query: WORLD_CUP_FIXTURES, fetchPolicy: "cache-first" })
      .catch(() => {});
  }, [hydrated, user, client]);

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props as Parameters<typeof FloatingTabBar>[0]} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="keeps"
        options={{
          title: "Keeps",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "bookmark" : "bookmark-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: "", tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
          ),
        }}
      />
      {/* World Cup is a real tab (kept alive → instant switching). The custom
          FloatingTabBar renders its button manually in the 6th slot. */}
      <Tabs.Screen name="world-cup" options={{ title: "World Cup" }} />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  barWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 9,
    paddingHorizontal: 4,
    // Soft shadow lifting the bar off the content above it
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
  // Emphasized create action (inline accent button)
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
