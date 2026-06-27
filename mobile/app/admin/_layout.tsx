import { router, Tabs, useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";

function useExitAdmin() {
  const exitAdmin = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/tabs" as never);
  }, []);

  // Tab navigators reset to the first tab (Overview) on Android back by default.
  // Intercept hardware back so one press returns to the screen before admin.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        exitAdmin();
        return true;
      });
      return () => sub.remove();
    }, [exitAdmin]),
  );

  return exitAdmin;
}

export default function AdminLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const exitAdmin = useExitAdmin();

  useEffect(() => {
    if (!isAdmin) router.replace("/tabs" as never);
  }, [isAdmin]);

  if (!isAdmin) return null;

  // Highlight the active tab: accent pill + full-opacity emoji (dimmed when inactive)
  const renderIcon = (emoji: string) =>
    ({ focused }: { focused: boolean }) => (
      <View
        style={{
          width: 36,
          height: 30,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? colors.accent + "26" : "transparent",
        }}
      >
        <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
      </View>
    );

  return (
    <Tabs
      backBehavior="none"
      screenOptions={{
        headerShown: true,
        tabBarHideOnKeyboard: true,
        headerStyle: { backgroundColor: colors.topbar },
        headerTitleStyle: { color: colors.text, fontWeight: "800" },
        headerTintColor: colors.accent,
        headerLeft: () => (
          <Pressable onPress={exitAdmin} style={{ paddingHorizontal: 12 }}>
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: "300" }}>‹</Text>
          </Pressable>
        ),
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
          height: 52 + insets.bottom,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Overview", tabBarLabel: "Overview", tabBarIcon: renderIcon("📊") }}
      />
      <Tabs.Screen
        name="users"
        options={{ title: "Users", tabBarLabel: "Users", tabBarIcon: renderIcon("👥") }}
      />
      <Tabs.Screen
        name="admin-management"
        options={{ title: "Admin Management", tabBarLabel: "Admins", tabBarIcon: renderIcon("🛡") }}
      />
      <Tabs.Screen
        name="invitations"
        options={{ title: "Invitations", tabBarLabel: "Invites", tabBarIcon: renderIcon("✉️") }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{ title: "Campaigns", tabBarLabel: "Campaigns", tabBarIcon: renderIcon("📣") }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: "Categories", tabBarLabel: "Categories", tabBarIcon: renderIcon("🏷") }}
      />
      <Tabs.Screen
        name="posts"
        options={{ title: "Platform Posts", tabBarLabel: "Posts", tabBarIcon: renderIcon("📝") }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: "Reported Posts", tabBarLabel: "Reports", tabBarIcon: renderIcon("🚩") }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: "Admin Messages", tabBarLabel: "Messages", tabBarIcon: renderIcon("💬") }}
      />
      <Tabs.Screen
        name="world-cup"
        options={{ title: "World Cup", tabBarLabel: "World Cup", tabBarIcon: renderIcon("⚽") }}
      />
    </Tabs>
  );
}
