import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ME } from "@ctrend/shared/graphql/profile";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

type MeData = {
  me: {
    id: string;
    email: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
    bio?: string | null;
  };
};

export default function ProfileScreen() {
  const { logout, isAuthenticated, hydrated } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading } = useQuery<MeData>(ME, {
    fetchPolicy: "cache-first",
    skip: !isAuthenticated,
  });

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/auth/login" as never);
    }
  }, [hydrated, isAuthenticated]);

  if (!hydrated || !isAuthenticated) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  const me = data?.me;
  const avatar = normalizeProfileImageUrl(me?.profileImageUrl);
  const name = me?.displayName?.trim() || me?.username || "You";
  const initial = name.slice(0, 1).toUpperCase();

  async function handleLogout() {
    await logout();
    router.replace("/auth/login");
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={[styles.avatarWrap, { borderColor: colors.accent }]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
          {me?.username ? <Text style={[styles.username, { color: colors.accent }]}>@{me.username}</Text> : null}
          {me?.bio ? <Text style={[styles.bio, { color: colors.subtext }]}>{me.bio}</Text> : null}
          {me?.email ? <Text style={[styles.email, { color: colors.subtext }]}>{me.email}</Text> : null}

          <Pressable
            style={[styles.editBtn, { backgroundColor: colors.card, borderColor: colors.accent }]}
            onPress={() => router.push("/profile/edit" as `/${string}`)}
          >
            <Text style={[styles.editBtnText, { color: colors.accent }]}>✎  Edit Profile</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={[styles.logoutBtn, { backgroundColor: colors.card }]}
        onPress={() => void handleLogout()}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {},
  content: { alignItems: "center", paddingHorizontal: 24 },
  avatarWrap: { marginBottom: 16, borderRadius: 50, borderWidth: 3, padding: 3 },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  avatarFallback: { backgroundColor: "#312e81", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#ffffff", fontSize: 36, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  username: { fontSize: 14, marginBottom: 4 },
  bio: { fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  email: { fontSize: 13, marginBottom: 24 },
  editBtn: {
    marginTop: 18, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 32,
    borderWidth: 1,
  },
  editBtnText: { fontSize: 14, fontWeight: "700" },
  logoutBtn: {
    marginTop: 16, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 40,
    borderWidth: 1, borderColor: "#ef4444",
  },
  logoutText: { color: "#ef4444", fontSize: 15, fontWeight: "700" },
});
