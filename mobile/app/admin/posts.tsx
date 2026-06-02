import { useMutation, useQuery } from "@apollo/client/react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ADMIN_PLATFORM_POSTS,
  ADMIN_PLATFORM_POSTS_COUNT,
} from "@ctrend/shared/graphql/admin";
import { CATEGORIES, DELETE_POST, FEED_POSTS } from "@ctrend/shared/graphql/feed";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useTheme } from "../../context/ThemeContext";
import type { ColorPalette } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

const PAGE = 20;

type StatusFilter = "all" | "PUBLISHED" | "SCHEDULED";
type VotingFilter = "all" | "live" | "closed";
type SortBy = "createdAt" | "updatedAt" | "votes" | "caption";
type SortOrder = "asc" | "desc";

type Person = {
  id: string;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

type PlatformPost = {
  id: string;
  caption?: string | null;
  imageUrls?: string[] | null;
  createdAt: string;
  updatedAt?: string | null;
  status?: string | null;
  scheduledAt?: string | null;
  votingEndsAt?: string | null;
  isVotingOpen?: boolean | null;
  commentCount?: number | null;
  hypeCount?: number | null;
  saveCount?: number | null;
  totalVotes?: number | null;
  upvoteCount: number;
  downvoteCount: number;
  authorId?: string | null;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
  authorProfileImageUrl?: string | null;
  isPrizeClaimed?: boolean | null;
  votePrizeClaimedAt?: string | null;
  canClaimPrize?: boolean | null;
  voteWinner?: {
    user?: { id: string; username?: string | null; displayName?: string | null; profileImageUrl?: string | null } | null;
  } | null;
  category?: { id: string; name: string } | null;
  options?: Array<{ label: string }> | null;
  editedBy?: Person[] | null;
  lastEditedBy?: Person | null;
};

type ListData = { adminPlatformPosts: PlatformPost[] };
type CountData = { adminPlatformPostsCount: number };
type CatsData = { categories: Array<{ id: string; name: string }> };

// ─── Person link (avatar + name → profile) ────────────────────────────────────

function PersonLink({
  person, colors, admin,
}: { person: Person; colors: ColorPalette; admin?: boolean }) {
  const name = person.displayName?.trim() || person.username || person.email || "—";
  const initial = name.slice(0, 1).toUpperCase();
  const img = normalizeProfileImageUrl(person.profileImageUrl);
  return (
    <Pressable
      style={st.personLink}
      onPress={() => router.push(`/profile/${person.id}` as `/${string}`)}
      hitSlop={4}
    >
      <View style={[st.personAvatar, { backgroundColor: admin ? "#6d28d9" : "#312e81" }]}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} />
          : <Text style={st.personAvatarText}>{initial}</Text>}
      </View>
      <Text style={[st.personName, { color: colors.subtext }]} numberOfLines={1}>{name}</Text>
    </Pressable>
  );
}

// ─── Filter chip rows ──────────────────────────────────────────────────────────

function ChipRow<T extends string>({
  label, value, options, onChange, colors,
}: {
  label: string;
  value: T;
  options: Array<{ v: T; l: string }>;
  onChange: (v: T) => void;
  colors: ColorPalette;
}) {
  return (
    <View style={st.chipRowWrap}>
      <Text style={[st.chipRowLabel, { color: colors.muted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipRow}>
        {options.map((o) => {
          const active = o.v === value;
          return (
            <Pressable
              key={o.v}
              style={[
                st.filterChip,
                { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : "transparent" },
              ]}
              onPress={() => onChange(o.v)}
            >
              <Text style={[st.filterChipText, { color: active ? "#fff" : colors.subtext }]}>{o.l}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function AdminPostsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [votingFilter, setVotingFilter] = useState<VotingFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [skip, setSkip] = useState(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setDebouncedSearch(text); setSkip(0); }, 350);
  }, []);

  const { data: catsData } = useQuery<CatsData>(CATEGORIES, { fetchPolicy: "cache-first" });
  const categories = catsData?.categories ?? [];

  const listFilter = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    votingFilter: votingFilter === "all" ? undefined : votingFilter,
    sortBy,
    sortOrder,
  }), [debouncedSearch, statusFilter, categoryFilter, votingFilter, sortBy, sortOrder]);

  const countFilter = useMemo(() => ({
    search: listFilter.search,
    status: listFilter.status,
    categoryId: listFilter.categoryId,
    votingFilter: listFilter.votingFilter,
  }), [listFilter]);

  const { data, loading, refetch } = useQuery<ListData>(ADMIN_PLATFORM_POSTS, {
    variables: { query: listFilter, skip, take: PAGE },
    fetchPolicy: "cache-and-network",
  });
  const { data: countData } = useQuery<CountData>(ADMIN_PLATFORM_POSTS_COUNT, {
    variables: { filter: countFilter },
    fetchPolicy: "cache-and-network",
  });

  const [deleteMut] = useMutation(DELETE_POST);

  const posts = data?.adminPlatformPosts ?? [];
  const total = countData?.adminPlatformPostsCount ?? posts.length;
  const hasMore = skip + posts.length < total;

  const isDefaultFilters =
    !search && statusFilter === "all" && votingFilter === "all" &&
    categoryFilter === "all" && sortBy === "createdAt" && sortOrder === "desc";

  function resetFilters() {
    setSearch(""); setDebouncedSearch("");
    setStatusFilter("all"); setVotingFilter("all"); setCategoryFilter("all");
    setSortBy("createdAt"); setSortOrder("desc"); setSkip(0);
  }

  function handleDelete(p: PlatformPost) {
    Alert.alert("Delete post", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteMut({ variables: { postId: p.id }, refetchQueries: [{ query: FEED_POSTS }] });
            void refetch();
            showToast("Post deleted", "success");
          } catch { showToast("Failed to delete post", "error"); }
        },
      },
    ]);
  }

  return (
    <View style={[st.screen, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Header + toolbar */}
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={st.headerTop}>
          <View>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Platform Posts</Text>
            <Text style={[st.sectionSub, { color: colors.muted }]}>System-wide compare polls</Text>
          </View>
          <Pressable
            style={[st.newBtn, { backgroundColor: colors.accent }]}
            onPress={() => router.push("/tabs/create?platform=1" as `/${string}`)}
          >
            <Text style={st.newBtnText}>+ New</Text>
          </Pressable>
        </View>

        <View style={[st.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search caption or option labels…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={handleSearchChange}
          />
          {search.length > 0 && (
            <Pressable onPress={() => handleSearchChange("")} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </Pressable>
          )}
        </View>

        <ChipRow
          label="Status"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setSkip(0); }}
          colors={colors}
          options={[{ v: "all", l: "All" }, { v: "PUBLISHED", l: "Published" }, { v: "SCHEDULED", l: "Scheduled" }]}
        />
        <ChipRow
          label="Voting"
          value={votingFilter}
          onChange={(v) => { setVotingFilter(v); setSkip(0); }}
          colors={colors}
          options={[{ v: "all", l: "All" }, { v: "live", l: "Live" }, { v: "closed", l: "Closed" }]}
        />
        <ChipRow
          label="Category"
          value={categoryFilter}
          onChange={(v) => { setCategoryFilter(v); setSkip(0); }}
          colors={colors}
          options={[{ v: "all", l: "All" }, ...categories.map((c) => ({ v: c.id, l: c.name }))]}
        />
        <ChipRow
          label="Sort"
          value={sortBy}
          onChange={(v) => { setSortBy(v); setSkip(0); }}
          colors={colors}
          options={[
            { v: "createdAt", l: "Created" },
            { v: "updatedAt", l: "Updated" },
            { v: "votes", l: "Votes" },
            { v: "caption", l: "Caption" },
          ]}
        />
        <View style={st.sortOrderRow}>
          <ChipRow
            label="Order"
            value={sortOrder}
            onChange={(v) => { setSortOrder(v); setSkip(0); }}
            colors={colors}
            options={[{ v: "desc", l: "Desc" }, { v: "asc", l: "Asc" }]}
          />
          {!isDefaultFilters && (
            <Pressable style={[st.resetBtn, { borderColor: colors.border }]} onPress={resetFilters}>
              <Text style={[st.resetBtnText, { color: colors.accent }]}>↺ Reset</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading && posts.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={<Text style={[st.empty, { color: colors.muted }]}>No platform posts found</Text>}
          ListFooterComponent={
            <View>
              {total > 0 && (
                <Text style={[st.pageInfo, { color: colors.muted }]}>
                  Showing {skip + 1}–{Math.min(skip + posts.length, total)} of {total}
                </Text>
              )}
              <View style={st.paginationRow}>
                <Pressable
                  style={[st.pageBtn, { borderColor: colors.border }, skip === 0 && st.pageBtnDisabled]}
                  onPress={() => setSkip(Math.max(0, skip - PAGE))}
                  disabled={skip === 0}
                >
                  <Text style={[st.pageBtnText, { color: skip === 0 ? colors.muted : colors.accent }]}>← Prev</Text>
                </Pressable>
                <Pressable
                  style={[st.pageBtn, { borderColor: colors.border }, !hasMore && st.pageBtnDisabled]}
                  onPress={() => setSkip(skip + PAGE)}
                  disabled={!hasMore}
                >
                  <Text style={[st.pageBtnText, { color: !hasMore ? colors.muted : colors.accent }]}>Next →</Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item: p }) => {
            const votes = p.totalVotes ?? (p.upvoteCount + p.downvoteCount);
            const scheduled = (p.status ?? "").toUpperCase() === "SCHEDULED";
            const closed = p.isVotingOpen === false;
            const thumbs = (p.imageUrls ?? []).slice(0, 2);
            return (
              <Pressable
                style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/post/${p.id}` as `/${string}`)}
              >
                {/* Thumb strip */}
                <View style={st.thumbStrip}>
                  {thumbs.length > 0 ? thumbs.map((u, i) => (
                    <Image key={i} source={{ uri: u }} style={st.thumb} />
                  )) : (
                    <View style={[st.thumb, { backgroundColor: colors.section, alignItems: "center", justifyContent: "center" }]}>
                      <Text style={{ fontSize: 16, opacity: 0.4 }}>📷</Text>
                    </View>
                  )}
                </View>

                <View style={st.rowInfo}>
                  <Text style={[st.rowCaption, { color: colors.text }]} numberOfLines={2}>
                    {p.caption || "Untitled compare"}
                  </Text>
                  <Text style={[st.rowId, { color: colors.muted }]}>
                    #{p.id.slice(-6)}{p.category?.name ? ` · ${p.category.name}` : ""}
                  </Text>

                  {/* Counts */}
                  <View style={st.statsRow}>
                    <Text style={[st.stat, { color: colors.subtext }]}>🗳️ {votes}</Text>
                    <Text style={[st.stat, { color: colors.subtext }]}>💬 {p.commentCount ?? 0}</Text>
                    <Text style={[st.stat, { color: colors.subtext }]}>❤️ {p.hypeCount ?? 0}</Text>
                    <Text style={[st.stat, { color: colors.subtext }]}>🔖 {p.saveCount ?? 0}</Text>
                  </View>

                  {/* Status pills */}
                  <View style={st.metaRow}>
                    <View style={[st.pill, { backgroundColor: scheduled ? "rgba(245,158,11,0.14)" : "rgba(34,197,94,0.12)" }]}>
                      <Text style={[st.pillText, { color: scheduled ? "#f59e0b" : "#22c55e" }]}>
                        {scheduled ? "SCHEDULED" : "PUBLISHED"}
                      </Text>
                    </View>
                    <View style={[st.pill, { backgroundColor: closed ? "rgba(100,116,139,0.14)" : "rgba(99,102,241,0.14)" }]}>
                      <Text style={[st.pillText, { color: closed ? "#64748b" : colors.accent }]}>
                        {closed ? "🔒 CLOSED" : "LIVE"}
                      </Text>
                    </View>
                    {!closed && p.votingEndsAt ? (
                      <Text style={[st.endsText, { color: colors.muted }]}>ends {formatRelativeTime(p.votingEndsAt)}</Text>
                    ) : null}
                  </View>

                  {/* Winner + claim status (after voting closes) */}
                  {closed && p.voteWinner?.user ? (
                    <View style={st.byRow}>
                      <Text style={[st.winnerLabel, { color: colors.muted }]}>🏆 Winner</Text>
                      <PersonLink
                        person={{
                          id: p.voteWinner.user.id,
                          displayName: p.voteWinner.user.displayName,
                          username: p.voteWinner.user.username,
                          profileImageUrl: p.voteWinner.user.profileImageUrl,
                        }}
                        colors={colors}
                      />
                      {p.isPrizeClaimed ? (
                        <View style={[st.pill, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
                          <Text style={[st.pillText, { color: "#22c55e" }]}>
                            ✅ CLAIMED{p.votePrizeClaimedAt ? ` · ${formatRelativeTime(p.votePrizeClaimedAt)}` : ""}
                          </Text>
                        </View>
                      ) : (
                        <View style={[st.pill, { backgroundColor: "rgba(245,158,11,0.14)" }]}>
                          <Text style={[st.pillText, { color: "#f59e0b" }]}>UNCLAIMED</Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  {/* Author + last edited */}
                  <View style={st.byRow}>
                    {p.authorId ? (
                      <PersonLink
                        person={{ id: p.authorId, displayName: p.authorDisplayName, username: p.authorUsername, profileImageUrl: p.authorProfileImageUrl }}
                        colors={colors}
                      />
                    ) : null}
                    {p.lastEditedBy ? (
                      <View style={st.editedWrap}>
                        <Text style={[st.editedLabel, { color: colors.muted }]}>edited by</Text>
                        <PersonLink person={p.lastEditedBy} colors={colors} admin />
                        {p.updatedAt ? <Text style={[st.editedLabel, { color: colors.muted }]}>· {formatRelativeTime(p.updatedAt)}</Text> : null}
                      </View>
                    ) : null}
                  </View>

                  {/* Actions */}
                  <View style={st.actionsRow}>
                    <Pressable
                      style={[st.actionBtn, { borderColor: colors.accent }]}
                      onPress={() => router.push(`/post/${p.id}` as `/${string}`)}
                      hitSlop={4}
                    >
                      <Text style={[st.actionBtnText, { color: colors.accent }]}>👁 View</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { borderColor: colors.border }]}
                      onPress={() => router.push(`/edit-post?postId=${p.id}` as `/${string}`)}
                      hitSlop={4}
                    >
                      <Text style={[st.actionBtnText, { color: colors.text }]}>✏️ Edit</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { borderColor: "#f87171" }]}
                      onPress={() => handleDelete(p)}
                      hitSlop={4}
                    >
                      <Text style={[st.actionBtnText, { color: "#f87171" }]}>🗑</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
    screen: { flex: 1 },
    header: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1 },
    headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    sectionTitle: { fontSize: 18, fontWeight: "800" },
    sectionSub: { fontSize: 12, marginTop: 1 },
    newBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    newBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

    searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 8 },
    searchIcon: { fontSize: 14 },
    searchInput: { flex: 1, fontSize: 14, padding: 0 },

    chipRowWrap: { marginBottom: 6 },
    chipRowLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginBottom: 3, textTransform: "uppercase" },
    chipRow: { gap: 6, paddingRight: 8 },
    filterChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
    filterChipText: { fontSize: 12, fontWeight: "700" },
    sortOrderRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
    resetBtn: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 1 },
    resetBtnText: { fontSize: 12, fontWeight: "700" },

    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 40 },
    list: { padding: 12, gap: 10 },
    empty: { textAlign: "center", paddingVertical: 40, fontSize: 14 },

    row: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 10, gap: 10 },
    thumbStrip: { flexDirection: "row", width: 76, height: 76, borderRadius: 8, overflow: "hidden", gap: 2, flexShrink: 0 },
    thumb: { flex: 1, height: 76 },
    rowInfo: { flex: 1, gap: 4 },
    rowCaption: { fontSize: 14, fontWeight: "700", lineHeight: 18 },
    rowId: { fontSize: 11 },
    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 1 },
    stat: { fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
    metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
    pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    pillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
    endsText: { fontSize: 11 },
    byRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 2 },
    editedWrap: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
    editedLabel: { fontSize: 11 },
    winnerLabel: { fontSize: 11, fontWeight: "700" },

    personLink: { flexDirection: "row", alignItems: "center", gap: 5 },
    personAvatar: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    personAvatarText: { color: "#fff", fontSize: 9, fontWeight: "700" },
    personName: { fontSize: 12, fontWeight: "600", maxWidth: 130 },

    actionsRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    actionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
    actionBtnText: { fontSize: 12, fontWeight: "700" },

    pageInfo: { textAlign: "center", fontSize: 12, marginTop: 8, marginBottom: 6 },
    paginationRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 8 },
    pageBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9 },
    pageBtnDisabled: { opacity: 0.4 },
    pageBtnText: { fontSize: 13, fontWeight: "700" },
});
