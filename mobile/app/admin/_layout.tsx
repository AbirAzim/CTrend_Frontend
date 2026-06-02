import { router, Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useEffect } from "react";

export default function AdminLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isAdmin = user?.role?.toLowerCase() === "admin";

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
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.topbar },
        headerTitleStyle: { color: colors.text, fontWeight: "800" },
        headerTintColor: colors.accent,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 12 }}>
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
