import { Tabs, router } from "expo-router";
import { Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function TabsLayout() {
  const { hydrated, isAuthenticated } = useAuth();
  const { colors } = useTheme();
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  function guardedTabPress(e: { preventDefault: () => void }) {
    if (!isAuthenticated) {
      e.preventDefault();
      router.push("/auth/login" as never);
    }
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.tabBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          height: 58,
          paddingBottom: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
      }}
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
        listeners={{ tabPress: guardedTabPress }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: "",
          tabBarIcon: () => <CreateFabIcon accent={colors.accent} />,
          tabBarButton: ({ ref: _ref, ...props }) => (
            <Pressable {...props} style={[styles.fabTabBtn, props.style as object]} />
          ),
        }}
        listeners={{ tabPress: guardedTabPress }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color, size }) => <ChatIcon color={color} size={size} />,
        }}
        listeners={{ tabPress: guardedTabPress }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
        listeners={{ tabPress: guardedTabPress }}
      />
    </Tabs>
  );
}

function HomeIcon({ color, size = 22 }: { color: ColorValue; size?: number }) {
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

function BookmarkIcon({ color, size = 22, bg }: { color: ColorValue; size?: number; bg: ColorValue }) {
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

function CreateFabIcon({ accent }: { accent: string }) {
  return (
    <View style={[styles.fabIcon, { backgroundColor: accent, shadowColor: accent }]}>
      <Text style={styles.fabIconPlus}>+</Text>
    </View>
  );
}

function ChatIcon({ color, size = 22 }: { color: ColorValue; size?: number }) {
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

function UserIcon({ color, size = 22 }: { color: ColorValue; size?: number }) {
  const s = size;
  const headR = s * 0.22;
  return (
    <View style={{ width: s, height: s, alignItems: "center", justifyContent: "flex-end" }}>
      <View style={{ position: "absolute", top: s * 0.03, width: headR * 2, height: headR * 2, borderRadius: headR, backgroundColor: color }} />
      <View style={{ width: s * 0.9, height: s * 0.46, borderTopLeftRadius: s * 0.45, borderTopRightRadius: s * 0.45, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fabTabBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
  fabIcon: {
    width: 44, height: 30,
    borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  fabIconPlus: { color: "#fff", fontSize: 22, fontWeight: "300", lineHeight: 26 },
});
