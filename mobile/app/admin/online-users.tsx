import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ADMIN_ONLINE_USERS } from "@ctrend/shared/graphql/admin";
import { useTheme } from "../../context/ThemeContext";

type User = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
  emailVerified?: boolean | null;
};

function UserAvatar({ user, colors }: { user: User; colors: ReturnType<typeof useTheme>["colors"] }) {
  const label = (user.displayName ?? user.username ?? user.email)[0]!.toUpperCase();
  if (user.profileImageUrl) {
    return <Image source={{ uri: user.profileImageUrl }} style={st.avatar} />;
  }
  return (
    <View style={[st.avatar, { backgroundColor: colors.accent + "33" }]}>
      <Text style={[st.avatarText, { color: colors.accent }]}>{label}</Text>
    </View>
  );
}

export default function AdminOnlineUsersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, refetch, networkStatus } = useQuery<{ adminOnlineUsers: User[] }>(
    ADMIN_ONLINE_USERS,
    { fetchPolicy: "cache-and-network", pollInterval: 30_000 },
  );
  const users = data?.adminOnlineUsers ?? [];
  const refreshing = networkStatus === 4;

  return (
    <View style={[st.screen, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[st.back, { color: colors.accent }]}>‹ Overview</Text>
        </Pressable>
        <Text style={[st.title, { color: colors.text }]}>Online now</Text>
        <Text style={[st.sub, { color: colors.muted }]}>
          {users.length} connected · refreshes every 30s
        </Text>
      </View>

      {loading && users.length === 0 ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={users.length === 0 ? st.emptyWrap : { padding: 14, gap: 10 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={st.center}>
              <Text style={{ color: colors.muted, fontWeight: "600" }}>No users online right now</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <UserAvatar user={item} colors={colors} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[st.name, { color: colors.text }]} numberOfLines={1}>
                  {item.displayName || item.username || "No name"}
                </Text>
                <Text style={[st.email, { color: colors.muted }]} numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
              <View style={st.livePill}>
                <View style={st.liveDot} />
                <Text style={st.liveText}>Online</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  back: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: "800" },
  sub: { fontSize: 12, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyWrap: { flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "800" },
  email: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#22c55e", textTransform: "uppercase" },
});
