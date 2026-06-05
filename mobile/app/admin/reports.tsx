import { useMutation, useQuery } from "@apollo/client/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ADMIN_CONTENT_REPORTS,
  ADMIN_REPORTED_POSTS,
  ADMIN_REPORTED_POSTS_COUNT,
} from "@ctrend/shared/graphql/contentReports";
import { DELETE_POST, FEED_POSTS } from "@ctrend/shared/graphql/feed";
import {
  contentReportReasonLabel,
  type ContentReportReasonId,
} from "@ctrend/shared/lib/contentReport";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { getApolloErrorMessage } from "../../lib/apolloErrorMessage";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

const PAGE = 20;

type ReportedPost = {
  id: string;
  caption?: string | null;
  imageUrls?: string[] | null;
  createdAt: string;
  reportCount: number;
  authorId?: string | null;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
  category?: { name: string } | null;
};

type ContentReport = {
  id: string;
  reasonId: string;
  details?: string | null;
  reporterUsername?: string | null;
  reporterDisplayName?: string | null;
  createdAt: string;
};

export default function AdminReportsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [detailPost, setDetailPost] = useState<ReportedPost | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(text);
      setSkip(0);
    }, 350);
  }, []);

  const listFilter = useMemo(
    () => ({
      search: debouncedSearch.trim() || undefined,
      minReportCount: 1,
      sortBy: "reportCount",
      sortOrder: "desc",
    }),
    [debouncedSearch],
  );

  const countFilter = useMemo(
    () => ({ search: listFilter.search, minReportCount: 1 }),
    [listFilter.search],
  );

  useEffect(() => {
    setSkip(0);
  }, [debouncedSearch]);

  const { data, loading, error, refetch } = useQuery<{ adminReportedPosts: ReportedPost[] }>(
    ADMIN_REPORTED_POSTS,
    { variables: { query: listFilter, skip, take: PAGE }, fetchPolicy: "cache-and-network" },
  );

  const { data: countData, refetch: refetchCount } = useQuery<{ adminReportedPostsCount: number }>(
    ADMIN_REPORTED_POSTS_COUNT,
    { variables: { filter: countFilter }, fetchPolicy: "cache-and-network" },
  );

  const { data: reportsData, loading: reportsLoading } = useQuery<{
    adminContentReports: ContentReport[];
  }>(ADMIN_CONTENT_REPORTS, {
    variables: { postId: detailPost?.id ?? "", take: 50 },
    skip: !detailPost,
    fetchPolicy: "network-only",
  });

  const [deleteMut] = useMutation(DELETE_POST);

  const posts = data?.adminReportedPosts ?? [];
  const total = countData?.adminReportedPostsCount ?? posts.length;
  const reports = reportsData?.adminContentReports ?? [];

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchCount()]);
    } finally {
      setRefreshing(false);
    }
  }

  function handleDelete(p: ReportedPost) {
    Alert.alert(
      "Delete reported post",
      `Remove this post permanently? It has ${p.reportCount} report${p.reportCount === 1 ? "" : "s"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMut({
                variables: { postId: p.id },
                refetchQueries: [
                  { query: FEED_POSTS },
                  { query: ADMIN_REPORTED_POSTS, variables: { query: listFilter, skip, take: PAGE } },
                  { query: ADMIN_REPORTED_POSTS_COUNT, variables: { filter: countFilter } },
                ],
              });
              setDetailPost(null);
              showToast("Post deleted", "success");
            } catch (err: unknown) {
              showToast(getApolloErrorMessage(err), "error");
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[st.screen, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <ToastView />

      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>Reported posts</Text>
        <Text style={[st.sectionSub, { color: colors.muted }]}>
          Review user reports, check counts, and remove violating content.
        </Text>

        <View style={st.summaryRow}>
          <View style={[st.summaryCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={[st.summaryLabel, { color: colors.muted }]}>Total reported</Text>
            <Text style={[st.summaryValue, { color: colors.text }]}>{total}</Text>
          </View>
          <View style={[st.summaryCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
            <Text style={[st.summaryLabel, { color: colors.muted }]}>On this page</Text>
            <Text style={[st.summaryValue, { color: colors.text }]}>{posts.length}</Text>
          </View>
        </View>

        <View style={[st.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search caption or option labels…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => handleSearchChange("")} hitSlop={8}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={[st.resultCount, { color: colors.muted }]}>
          Sorted by most reports first
        </Text>
      </View>

      {error ? (
        <Text style={[st.errorText, { color: "#ef4444" }]}>{getApolloErrorMessage(error)}</Text>
      ) : null}

      {loading && posts.length === 0 ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={st.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={st.emptyWrap}>
              <Text style={st.emptyIcon}>🚩</Text>
              <Text style={[st.emptyTitle, { color: colors.text }]}>No reported posts yet</Text>
              <Text style={[st.emptySub, { color: colors.muted }]}>
                When users report content from the feed, posts will appear here with report counts.
              </Text>
            </View>
          }
          ListFooterComponent={
            total > PAGE ? (
              <View>
                <Text style={[st.pageInfo, { color: colors.muted }]}>
                  Showing {skip + 1}–{Math.min(skip + posts.length, total)} of {total}
                </Text>
                <View style={st.paginationRow}>
                  <Pressable
                    style={[st.pageBtn, { borderColor: colors.border }, skip === 0 && st.pageBtnDisabled]}
                    onPress={() => setSkip(Math.max(0, skip - PAGE))}
                    disabled={skip === 0}
                  >
                    <Text style={[st.pageBtnText, { color: colors.text }]}>Previous</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      st.pageBtn,
                      { borderColor: colors.border },
                      skip + PAGE >= total && st.pageBtnDisabled,
                    ]}
                    onPress={() => setSkip(skip + PAGE)}
                    disabled={skip + PAGE >= total}
                  >
                    <Text style={[st.pageBtnText, { color: colors.text }]}>Next</Text>
                  </Pressable>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item: p }) => {
            const caption = p.caption?.trim() || "Untitled compare";
            const author = p.authorDisplayName?.trim() || p.authorUsername || "—";
            const thumbs = (p.imageUrls ?? []).slice(0, 2);
            return (
              <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={st.thumbStrip}>
                  {thumbs.length > 0 ? (
                    thumbs.map((u, i) => <Image key={i} source={{ uri: u }} style={st.thumb} />)
                  ) : (
                    <View
                      style={[
                        st.thumb,
                        { backgroundColor: colors.section, alignItems: "center", justifyContent: "center" },
                      ]}
                    >
                      <Text style={{ fontSize: 16, opacity: 0.4 }}>📷</Text>
                    </View>
                  )}
                </View>

                <View style={st.rowInfo}>
                  <View style={st.titleRow}>
                    <Text style={[st.rowCaption, { color: colors.text }]} numberOfLines={2}>
                      {caption}
                    </Text>
                    <View style={st.reportBadge}>
                      <Text style={st.reportBadgeText}>🚩 {p.reportCount}</Text>
                    </View>
                  </View>

                  <Text style={[st.rowId, { color: colors.muted }]}>
                    #{p.id.slice(-6)}
                    {p.category?.name ? ` · ${p.category.name}` : ""}
                  </Text>
                  <Text style={[st.rowMeta, { color: colors.subtext }]}>
                    {author} · {formatRelativeTime(p.createdAt)}
                  </Text>

                  <View style={st.actionsRow}>
                    <Pressable
                      style={[st.actionBtn, { borderColor: colors.accent }]}
                      onPress={() => router.push(`/post/${p.id}` as `/${string}`)}
                    >
                      <Text style={[st.actionBtnText, { color: colors.accent }]}>👁 View</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { borderColor: colors.border }]}
                      onPress={() => setDetailPost(p)}
                    >
                      <Text style={[st.actionBtnText, { color: colors.text }]}>📋 Reports</Text>
                    </Pressable>
                    <Pressable
                      style={[st.actionBtn, { borderColor: "#f87171" }]}
                      onPress={() => handleDelete(p)}
                    >
                      <Text style={[st.actionBtnText, { color: "#ef4444" }]}>🗑 Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={!!detailPost}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailPost(null)}
      >
        <View style={st.modalRoot}>
          <Pressable style={st.modalOverlay} onPress={() => setDetailPost(null)} />
          <View
            style={[
              st.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 16) + 20,
              },
            ]}
          >
            <View style={[st.handle, { backgroundColor: colors.border }]} />
            <View style={st.sheetHead}>
              <Text style={[st.sheetTitle, { color: colors.text }]}>Reports for post</Text>
            </View>

            {detailPost ? (
              <View
                style={[
                  st.postCard,
                  { borderColor: colors.border, backgroundColor: colors.section },
                ]}
              >
                <Text style={[st.postCaption, { color: colors.text }]} numberOfLines={3}>
                  {detailPost.caption?.trim() || detailPost.id}
                </Text>
                <View style={st.reportBadge}>
                  <Text style={st.reportBadgeText}>
                    🚩 {detailPost.reportCount} report{detailPost.reportCount === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
            ) : null}

            {reportsLoading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView
                style={st.reportsScroll}
                contentContainerStyle={st.reportsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {reports.map((r) => {
                  const reporter =
                    r.reporterDisplayName || r.reporterUsername || "User";
                  return (
                    <View
                      key={r.id}
                      style={[
                        st.reportRow,
                        { borderColor: colors.border, backgroundColor: colors.section },
                      ]}
                    >
                      <Text style={[st.reportReason, { color: colors.text }]}>
                        {contentReportReasonLabel(r.reasonId as ContentReportReasonId)}
                      </Text>
                      <Text style={[st.reportReporter, { color: colors.muted }]}>
                        Reported by{" "}
                        <Text style={[st.reportReporterName, { color: colors.text }]}>
                          {reporter}
                        </Text>
                      </Text>
                      <Text style={[st.reportTime, { color: colors.muted }]}>
                        {formatRelativeTime(r.createdAt)}
                      </Text>
                      {r.details ? (
                        <Text
                          style={[
                            st.reportDetails,
                            { color: colors.subtext, borderTopColor: colors.border },
                          ]}
                        >
                          {r.details}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                {reports.length === 0 ? (
                  <Text style={[st.reportMeta, { color: colors.muted }]}>
                    No individual report records.
                  </Text>
                ) : null}
              </ScrollView>
            )}

            <View style={st.sheetActions}>
              {detailPost ? (
                <Pressable
                  style={[st.sheetPrimaryBtn, { backgroundColor: colors.accent }]}
                  onPress={() => {
                    const id = detailPost.id;
                    setDetailPost(null);
                    router.push(`/post/${id}` as `/${string}`);
                  }}
                >
                  <Text style={st.sheetPrimaryText}>Open post</Text>
                </Pressable>
              ) : null}
              {detailPost ? (
                <Pressable
                  style={[st.sheetDangerBtn, { borderColor: "#ef4444" }]}
                  onPress={() => handleDelete(detailPost)}
                >
                  <Text style={st.sheetDangerText}>Delete post</Text>
                </Pressable>
              ) : null}
              <Pressable style={st.sheetCloseBtn} onPress={() => setDetailPost(null)}>
                <Text style={{ color: colors.accent, fontWeight: "700" }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  summaryRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 10 },
  summaryCard: { flex: 1, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  summaryLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  summaryValue: { fontSize: 20, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 6,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, minHeight: 22 },
  resultCount: { fontSize: 12, fontWeight: "600" },
  errorText: { paddingHorizontal: 14, paddingTop: 10, fontSize: 13 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 12, gap: 10, paddingBottom: 24 },
  emptyWrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  row: { flexDirection: "row", borderRadius: 14, borderWidth: 1, padding: 10, gap: 10 },
  thumbStrip: { flexDirection: "row", width: 76, height: 76, borderRadius: 8, overflow: "hidden", gap: 2, flexShrink: 0 },
  thumb: { flex: 1, height: 76 },
  rowInfo: { flex: 1, gap: 4 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowCaption: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 18 },
  reportBadge: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reportBadgeText: { color: "#dc2626", fontWeight: "800", fontSize: 12 },
  rowId: { fontSize: 11 },
  rowMeta: { fontSize: 12 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  actionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtnText: { fontSize: 12, fontWeight: "700" },
  pageInfo: { textAlign: "center", fontSize: 12, marginTop: 8, marginBottom: 6 },
  paginationRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingVertical: 8 },
  pageBtn: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9 },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, fontWeight: "700" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    maxHeight: "82%",
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 14, opacity: 0.5 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  postCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  postCaption: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  reportsScroll: { maxHeight: 280 },
  reportsScrollContent: { paddingBottom: 4, gap: 10 },
  reportRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  reportReason: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  reportReporter: { fontSize: 12, marginTop: 2 },
  reportReporterName: { fontWeight: "700" },
  reportTime: { fontSize: 12 },
  reportMeta: { fontSize: 12, marginTop: 3 },
  reportDetails: {
    fontSize: 13,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    lineHeight: 18,
  },
  sheetActions: { gap: 10, marginTop: 14 },
  sheetPrimaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  sheetPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  sheetDangerBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: "center" },
  sheetDangerText: { color: "#ef4444", fontWeight: "800", fontSize: 15 },
  sheetCloseBtn: { alignItems: "center", paddingVertical: 8 },
});
