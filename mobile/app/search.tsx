import { useLazyQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GLOBAL_SEARCH } from "@ctrend/shared/graphql/search";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useTheme } from "../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchUser = {
  isFriend: boolean;
  user: { id: string; username: string; displayName: string | null; profileImageUrl?: string | null };
};

type SearchPost = {
  id: string;
  caption: string | null;
  imageUrls: string[];
  options?: Array<{ label: string; imageUrl?: string | null }> | null;
};

type SearchResult = {
  globalSearch: {
    users: SearchUser[];
    posts: SearchPost[];
  };
};

type ListItem =
  | { kind: "user"; data: SearchUser }
  | { kind: "post"; data: SearchPost }
  | { kind: "header"; label: string };

// ─── Row components ──────────────────────────────────────────────────────────

function UserRow({ item, colors }: { item: SearchUser; colors: ReturnType<typeof useTheme>["colors"] }) {
  const avatar = normalizeProfileImageUrl(item.user.profileImageUrl);
  const name = item.user.displayName?.trim() || item.user.username;
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <Pressable
      style={[st.row, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/profile/${item.user.id}` as `/${string}`)}
    >
      <View style={[st.avatar, { overflow: "hidden" }]}>
        {avatar
          ? <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          : <Text style={st.avatarText}>{initial}</Text>
        }
      </View>
      <View style={st.rowMeta}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[st.rowTitle, { color: colors.text }]} numberOfLines={1}>{name}</Text>
          {item.isFriend && (
            <View style={[st.friendBadge, { backgroundColor: colors.accent + "22", borderColor: colors.accent + "55" }]}>
              <Text style={[st.friendBadgeText, { color: colors.accent }]}>FRIEND</Text>
            </View>
          )}
        </View>
        <Text style={[st.rowSub, { color: colors.muted }]}>@{item.user.username}</Text>
      </View>
    </Pressable>
  );
}

function PostRow({ item, colors }: { item: SearchPost; colors: ReturnType<typeof useTheme>["colors"] }) {
  const thumb = item.imageUrls[0] ?? item.options?.[0]?.imageUrl ?? null;

  return (
    <Pressable
      style={[st.row, { borderBottomColor: colors.border }]}
      onPress={() => router.push(`/post/${item.id}` as `/${string}`)}
    >
      <View style={[st.postThumb, { backgroundColor: colors.section, overflow: "hidden" }]}>
        {thumb
          ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          : <Text style={{ fontSize: 20 }}>📷</Text>
        }
      </View>
      <View style={st.rowMeta}>
        <Text style={[st.rowTitle, { color: colors.text }]} numberOfLines={2}>
          {item.caption || "Untitled compare"}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionHeader({ label, colors }: { label: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={[st.sectionHeader, { backgroundColor: colors.section, borderBottomColor: colors.border }]}>
      <Text style={[st.sectionHeaderText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, { data, loading }] = useLazyQuery<SearchResult>(GLOBAL_SEARCH, {
    fetchPolicy: "no-cache",
  });

  // Debounce — fire server query 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) return;
    debounceRef.current = setTimeout(() => {
      void search({ variables: { query: query.trim(), limit: 10 } });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a flat list: section headers interleaved with result rows
  const items: ListItem[] = [];
  const users = data?.globalSearch.users ?? [];
  const posts = data?.globalSearch.posts ?? [];

  if (users.length > 0) {
    items.push({ kind: "header", label: "People" });
    users.forEach((u) => items.push({ kind: "user", data: u }));
  }
  if (posts.length > 0) {
    items.push({ kind: "header", label: "Posts" });
    posts.forEach((p) => items.push({ kind: "post", data: p }));
  }

  const hasResults = items.length > 0;
  const showEmpty = query.trim().length > 0 && !loading && !hasResults;

  return (
    <View style={[st.screen, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Search bar ── */}
      <View style={[st.topBar, { paddingTop: insets.top, backgroundColor: colors.topbar, borderBottomColor: colors.border }]}>
        <View style={[st.inputWrap, { backgroundColor: colors.section, borderColor: colors.border }]}>
          <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            ref={inputRef}
            autoFocus
            style={[st.input, { color: colors.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search people, posts…"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {loading && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={st.cancelBtn}>
          <Text style={[st.cancelText, { color: colors.accent }]}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* ── Results ── */}
      {showEmpty ? (
        <View style={st.emptyWrap}>
          <Text style={[st.emptyText, { color: colors.muted }]}>No results for "{query}"</Text>
        </View>
      ) : query.trim().length === 0 ? (
        <View style={st.emptyWrap}>
          <Text style={[st.emptyText, { color: colors.muted }]}>Search people and posts</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => {
            if (item.kind === "header") return <SectionHeader label={item.label} colors={colors} />;
            if (item.kind === "user") return <UserRow item={item.data} colors={colors} />;
            return <PostRow item={item.data} colors={colors} />;
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  input: { flex: 1, fontSize: 15, padding: 0 },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontSize: 15, fontWeight: "600" },

  // Section header
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  // Result row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#312e81",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  postThumb: {
    width: 52,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMeta: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  rowSub: { fontSize: 12, marginTop: 1 },
  friendBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  friendBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { fontSize: 15, textAlign: "center" },
});
