import { useQuery } from "@apollo/client/react";
import { Tabs, router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MY_CONVERSATIONS } from "@ctrend/shared/graphql/messages";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useTabBar } from "../../context/TabBarContext";

const TAB_BAR_HEIGHT = 72;

// ─── Animated custom tab bar ──────────────────────────────────────────────────

function AnimatedTabBar(props: {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  descriptors: Record<string, { options: { title?: string; tabBarIcon?: (p: { color: ColorValue; size: number; focused: boolean }) => React.ReactNode; tabBarBadge?: string | number } }>;
  navigation: { emit: (e: { type: string; target: string; canPreventDefault: boolean }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}) {
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();

  const { data: convData } = useQuery<{ myConversations: Array<{ unreadCount: number }> }>(
    MY_CONVERSATIONS,
    { fetchPolicy: "cache-and-network", skip: !isAuthenticated, pollInterval: 15000 },
  );
  const totalUnread = (convData?.myConversations ?? []).reduce((s, c) => s + (c.unreadCount > 0 ? 1 : 0), 0);

  const animStyle = { transform: [{ translateY }] };

  return (
    <Animated.View
      style={[
        styles.tabBar,
        {
          backgroundColor: colors.tabBg,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: TAB_BAR_HEIGHT + insets.bottom,
        },
        animStyle,
      ]}
    >
      {props.state.routes.map((route, index) => {
        const focused = props.state.index === index;
        const descriptor = props.descriptors[route.key];
        const label = descriptor.options.title ?? route.name;
        const isCreate = route.name === "create";
        const tintColor: ColorValue = focused ? colors.accent : colors.muted;

        const icon = descriptor.options.tabBarIcon?.({
          color: tintColor,
          size: 22,
          focused,
        });

        const mesagesIdx = props.state.routes.findIndex(r => r.name === "messages");
        const isMessages = index === mesagesIdx;

        function handlePress() {
          const event = props.navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!event.defaultPrevented) {
            if (!isAuthenticated && route.name !== "index") {
              router.push("/auth/login" as never);
              return;
            }
            props.navigation.navigate(route.name);
          }
        }

        if (isCreate) {
          return (
            <Pressable key={route.key} style={styles.createBtn} onPress={handlePress}>
              <View style={[styles.createFab, { backgroundColor: colors.accent, shadowColor: colors.accent }]}>
                <Text style={styles.createFabText}>+</Text>
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable key={route.key} style={styles.tabBtn} onPress={handlePress}>
            <View style={styles.tabIconWrap}>
              {icon}
              {isMessages && totalUnread > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.badgeText}>{totalUnread > 9 ? "9+" : totalUnread}</Text>
                </View>
              )}
            </View>
            {!isCreate && (
              <Text style={[styles.tabLabel, { color: tintColor }]} numberOfLines={1}>
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { hydrated } = useAuth();
  const { colors } = useTheme();
  const { translateY } = useTabBar();

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props as Parameters<typeof AnimatedTabBar>[0]} />}
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
          tabBarIcon: ({ color, size }) => <BookmarkIcon color={color} size={size} bg={colors.tabBg} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{
        position: "absolute", top: 0, width: 0, height: 0,
        borderLeftWidth: s * 0.52, borderRightWidth: s * 0.52,
        borderBottomWidth: s * 0.46,
        borderLeftColor: "transparent", borderRightColor: "transparent",
        borderBottomColor: color,
      }} />
      <View style={{ width: s * 0.68, height: s * 0.48, backgroundColor: color }} />
    </View>
  );
}

function BookmarkIcon({ color, size = 24, bg }: { color: ColorValue; size?: number; bg: ColorValue }) {
  const s = size;
  const w = s * 0.6;
  const h = s * 0.85;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: w, height: h, backgroundColor: color, borderRadius: 2, overflow: "hidden" }}>
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: s * 0.22, flexDirection: "row" }}>
          <View style={{ flex: 1, borderTopRightRadius: w * 0.5, backgroundColor: bg }} />
          <View style={{ flex: 1, borderTopLeftRadius: w * 0.5, backgroundColor: bg }} />
        </View>
      </View>
    </View>
  );
}

function ChatIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s }}>
      <View style={{ width: s, height: s * 0.8, backgroundColor: color, borderRadius: s * 0.22 }} />
      <View style={{
        position: "absolute", bottom: 0, left: s * 0.12,
        width: 0, height: 0,
        borderTopWidth: s * 0.25, borderRightWidth: s * 0.18,
        borderTopColor: color, borderRightColor: "transparent",
      }} />
    </View>
  );
}

function UserIcon({ color, size = 24 }: { color: ColorValue; size?: number }) {
  const s = size;
  const headR = s * 0.22;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ position: "absolute", top: s * 0.03, width: headR * 2, height: headR * 2, borderRadius: headR, backgroundColor: color }} />
      <View style={{ width: s * 0.9, height: s * 0.46, borderTopLeftRadius: s * 0.45, borderTopRightRadius: s * 0.45, backgroundColor: color }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 4,
    gap: 4,
  },
  tabIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: { fontSize: 10, fontWeight: "700" },
  badge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  createBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  createFab: {
    width: 46,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  createFabText: { color: "#fff", fontSize: 22, fontWeight: "300", lineHeight: 26 },
});
