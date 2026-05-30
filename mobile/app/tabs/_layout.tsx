import { useQuery } from "@apollo/client/react";
import { Tabs, router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, Dimensions, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

const { width: SCREEN_W } = Dimensions.get("window");

// Pill dimensions
const PILL_H = 64;
const PILL_MX = 20; // horizontal margin each side
const PILL_MB = 14; // margin above safe area
const FAB_SIZE = 54;

// ─── Floating pill tab bar ────────────────────────────────────────────────────

function FloatingTabBar(props: {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string; tabBarIcon?: (p: { color: ColorValue; size: number; focused: boolean }) => React.ReactNode; tabBarBadge?: string | number } }>;
  navigation: { emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}) {
  const { colors, isDark } = useTheme();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();

  const { data: convData } = useQuery<{ myConversations: Array<{ unreadCount: number }> }>(
    MY_CONVERSATIONS,
    { fetchPolicy: "cache-and-network", skip: !isAuthenticated, pollInterval: 15000 },
  );
  const totalUnread = (convData?.myConversations ?? []).reduce((s, c) => s + (c.unreadCount > 0 ? 1 : 0), 0);

  const pillBg = isDark ? "rgba(18,18,26,0.96)" : "rgba(255,255,255,0.96)";
  const pillBorder = isDark ? "rgba(100,100,180,0.18)" : "rgba(0,0,0,0.08)";

  // Per-tab scale animation for press feedback
  const tabScales = useRef(props.state.routes.map(() => new Animated.Value(1))).current;

  function pressIn(i: number) {
    Animated.spring(tabScales[i], { toValue: 0.88, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  }
  function pressOut(i: number) {
    Animated.spring(tabScales[i], { toValue: 1, useNativeDriver: true, tension: 200, friction: 12 }).start();
  }

  const bottom = PILL_MB + insets.bottom;

  return (
    <Animated.View
      style={[
        styles.pillWrap,
        { bottom, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      {/* Pill container */}
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
        {props.state.routes.map((route, index) => {
          const focused = props.state.index === index;
          const descriptor = props.descriptors[route.key];
          const label = descriptor.options.title ?? route.name;
          const isCreate = route.name === "create";
          const messagesIdx = props.state.routes.findIndex(r => r.name === "messages");
          const isMessages = index === messagesIdx;

          const iconColor: ColorValue = focused
            ? isDark ? "#a5b4fc" : colors.accent
            : isDark ? "#4b5563" : "#9ca3af";

          const icon = descriptor.options.tabBarIcon?.({ color: iconColor, size: 24, focused });

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

          // ── Create FAB ──────────────────────────────────────────────────
          if (isCreate) {
            return (
              <Animated.View
                key={route.key}
                style={[styles.fabWrap, { transform: [{ scale: tabScales[index] }] }]}
              >
                <Pressable
                  onPress={handlePress}
                  onPressIn={() => pressIn(index)}
                  onPressOut={() => pressOut(index)}
                  style={[
                    styles.fab,
                    {
                      backgroundColor: colors.accent,
                      shadowColor: colors.accent,
                    },
                  ]}
                >
                  <Text style={styles.fabText}>＋</Text>
                </Pressable>
              </Animated.View>
            );
          }

          // ── Regular tab ─────────────────────────────────────────────────
          return (
            <Animated.View
              key={route.key}
              style={[styles.tabWrap, { transform: [{ scale: tabScales[index] }] }]}
            >
              <Pressable
                style={styles.tabBtn}
                onPress={handlePress}
                onPressIn={() => pressIn(index)}
                onPressOut={() => pressOut(index)}
              >
                {/* Active glow pill behind icon */}
                {focused && (
                  <View style={[styles.activePill, { backgroundColor: isDark ? "rgba(129,140,248,0.15)" : "rgba(99,102,241,0.1)" }]} />
                )}
                <View style={styles.iconWrap}>
                  {icon}
                  {isMessages && totalUnread > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.badgeText}>{totalUnread > 9 ? "9+" : totalUnread}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.tabLabel,
                    { color: focused ? (isDark ? "#a5b4fc" : colors.accent) : isDark ? "#4b5563" : "#9ca3af" },
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
      </View>
    </Animated.View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { hydrated } = useAuth();
  const { colors } = useTheme();

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
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="keeps"
        options={{
          title: "Keeps",
          tabBarIcon: ({ color, size }) => <BookmarkIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: "", tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Msgs",
          tabBarIcon: ({ color, size }) => <ChatIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

// ─── SVG-like icons (pure View) ───────────────────────────────────────────────

function HomeIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{
        position: "absolute", top: 0, width: 0, height: 0,
        borderLeftWidth: s * 0.54, borderRightWidth: s * 0.54,
        borderBottomWidth: s * 0.48,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderBottomColor: color as string,
      }} />
      <View style={{ width: s * 0.7, height: s * 0.5, backgroundColor: color as string, borderRadius: 2 }} />
    </View>
  );
}

function BookmarkIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  const w = s * 0.58;
  const h = s * 0.84;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: w, height: h, backgroundColor: color as string, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: s * 0.22, flexDirection: "row" }}>
          <View style={{ flex: 1, borderTopRightRadius: w * 0.5, backgroundColor: "transparent" }} />
          <View style={{ flex: 1, borderTopLeftRadius: w * 0.5, backgroundColor: "transparent" }} />
        </View>
        {/* Notch cutout */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: s * 0.22, flexDirection: "row" }}>
          <View style={{ flex: 1, borderTopRightRadius: 99, backgroundColor: "rgba(0,0,0,0.35)" }} />
          <View style={{ flex: 1, borderTopLeftRadius: 99, backgroundColor: "rgba(0,0,0,0.35)" }} />
        </View>
      </View>
    </View>
  );
}

function ChatIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s }}>
      <View style={{ width: s, height: s * 0.78, backgroundColor: color as string, borderRadius: s * 0.22 }} />
      <View style={{ position: "absolute", bottom: 0, left: s * 0.1, width: 0, height: 0,
        borderTopWidth: s * 0.26, borderRightWidth: s * 0.18,
        borderTopColor: color as string, borderRightColor: "transparent" }} />
    </View>
  );
}

function UserIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  const headR = s * 0.23;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ position: "absolute", top: s * 0.02, width: headR * 2, height: headR * 2, borderRadius: headR, backgroundColor: color as string }} />
      <View style={{ width: s * 0.88, height: s * 0.48, borderTopLeftRadius: s * 0.45, borderTopRightRadius: s * 0.45, backgroundColor: color as string }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PILL_W = SCREEN_W - PILL_MX * 2;

const styles = StyleSheet.create({
  pillWrap: {
    position: "absolute",
    left: PILL_MX,
    width: PILL_W,
    alignItems: "center",
    // Allow touches to pass through wrapper but not pill
  },
  pill: {
    width: "100%",
    height: PILL_H,
    borderRadius: 36,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    // Shadow
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
  tabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 3,
    minWidth: 52,
  },
  activePill: {
    position: "absolute",
    top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: 20,
  },
  iconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: "800",
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

  // Create FAB
  fabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10, // lifts FAB above pill baseline
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
    marginTop: -2,
  },
});
