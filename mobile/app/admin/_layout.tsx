import { router, Tabs } from "expo-router";
import { Pressable, Text } from "react-native";
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Users", tabBarLabel: "Users", tabBarIcon: () => <Text>👥</Text> }} />
      <Tabs.Screen name="invitations" options={{ title: "Invitations", tabBarLabel: "Invites", tabBarIcon: () => <Text>✉️</Text> }} />
      <Tabs.Screen name="campaigns" options={{ title: "Campaigns", tabBarLabel: "Campaigns", tabBarIcon: () => <Text>🏆</Text> }} />
      <Tabs.Screen name="world-cup" options={{ title: "World Cup", tabBarLabel: "World Cup", tabBarIcon: () => <Text>⚽</Text> }} />
    </Tabs>
  );
}
