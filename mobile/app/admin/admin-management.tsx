import { useMutation, useQuery } from "@apollo/client/react";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  LIST_USERS,
  LIST_USERS_COUNT,
  REMOVE_USER,
  REMOVE_ADMIN,
  PROMOTE_TO_ADMIN,
  INVITE_ADMIN,
} from "@ctrend/shared/graphql/admin";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

const PAGE = 20;

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

type User = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  role?: string | null;
  roles?: string[] | null;
  profileImageUrl?: string | null;
  emailVerified?: boolean | null;
  createdAt?: string | null;
};

type ListUsersData = { listUsers: User[] };
type CountData = { listUsersCount: number };

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  ADMIN: { bg: "rgba(99,102,241,0.15)", text: "#6366f1" },
  USER: { bg: "rgba(34,197,94,0.1)", text: "#22c55e" },
  SYSTEM: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
};

function UserAvatar({ user, size = 40 }: { user: User; size?: number }) {
  const initials = (user.displayName ?? user.username ?? user.email)[0]!.toUpperCase();
  if (user.profileImageUrl) {
    return <Image source={{ uri: user.profileImageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#4338ca", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function AdminManagementScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteSearchDebounced, setInviteSearchDebounced] = useState("");
  // Tracks emails already actioned in this session: promoted (existing user) or invited (new email).
  const [processedEmails, setProcessedEmails] = useState<Record<string, "promoted" | "invited">>({});

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(text);
      setSkip(0);
    }, 350);
  }, []);

  const queryVars = { skip, take: PAGE, role: "admin", search: debouncedSearch || undefined };
  const countVars = { role: "admin", search: debouncedSearch || undefined };

  const { data, loading, refetch } = useQuery<ListUsersData>(LIST_USERS, {
    variables: queryVars,
    fetchPolicy: "cache-and-network",
  });

  const { data: countData } = useQuery<CountData>(LIST_USERS_COUNT, {
    variables: countVars,
    fetchPolicy: "cache-and-network",
  });

  const [revokeAdminMut] = useMutation(REMOVE_ADMIN);
  const [removeUserMut] = useMutation(REMOVE_USER);
  const [promoteToAdminMut, { loading: promoting }] = useMutation(PROMOTE_TO_ADMIN);
  const [inviteAdminMut, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);

  const users = data?.listUsers ?? [];
  const total = countData?.listUsersCount ?? 0;
  const hasMore = skip + users.length < total;

  async function handleRevokeAdmin(u: User) {
    Alert.alert(
      "Revoke Admin",
      `Remove admin role from ${u.displayName ?? u.email}? They will become a regular user.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeAdminMut({ variables: { email: u.email } });
              void refetch();
              showToast("Admin role revoked", "success");
            } catch { showToast("Failed to revoke admin", "error"); }
          },
        },
      ],
    );
  }

  async function handleRemoveAccount(u: User) {
    Alert.alert(
      "Remove Account",
      `Permanently remove ${u.email}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            try {
              await removeUserMut({ variables: { email: u.email } });
              void refetch();
              showToast("Account removed", "success");
            } catch { showToast("Failed to remove account", "error"); }
          },
        },
      ],
    );
  }

  // ── Invite/Promote modal: search non-admin users (server-side, by name/email) ──
  const handleInviteSearchChange = useCallback((text: string) => {
    setInviteSearch(text);
    if (inviteDebounceTimer.current) clearTimeout(inviteDebounceTimer.current);
    inviteDebounceTimer.current = setTimeout(() => setInviteSearchDebounced(text.trim()), 300);
  }, []);

  const { data: candidatesData, loading: candidatesLoading } = useQuery<ListUsersData>(LIST_USERS, {
    variables: { skip: 0, take: 20, role: "user", search: inviteSearchDebounced || undefined },
    skip: !inviteModal,
    fetchPolicy: "cache-and-network",
  });
  const candidates = candidatesData?.listUsers ?? [];

  const trimmedInviteEmail = inviteSearch.trim().toLowerCase();
  const showInviteByEmail =
    isValidEmail(trimmedInviteEmail) &&
    !candidates.some((u) => u.email.toLowerCase() === trimmedInviteEmail) &&
    processedEmails[trimmedInviteEmail] !== "invited";

  function closeInviteModal() {
    setInviteModal(false);
    setInviteSearch("");
    setInviteSearchDebounced("");
    setProcessedEmails({});
    if (inviteDebounceTimer.current) clearTimeout(inviteDebounceTimer.current);
  }

  async function handlePromoteUser(email: string) {
    try {
      await promoteToAdminMut({ variables: { email } });
      setProcessedEmails((p) => ({ ...p, [email.toLowerCase()]: "promoted" }));
      void refetch();
      showToast("User promoted to admin", "success");
    } catch { showToast("Failed to promote user", "error"); }
  }

  async function handleInviteByEmail(email: string) {
    try {
      await inviteAdminMut({ variables: { email } });
      setProcessedEmails((p) => ({ ...p, [email.toLowerCase()]: "invited" }));
      showToast("Admin invitation sent", "success");
    } catch { showToast("Failed to send invite", "error"); }
  }

  const st = makeStyles(colors);

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={st.headerTop}>
          <View>
            <Text style={[st.sectionTitle, { color: colors.text }]}>Admin Management</Text>
            <Text style={[st.sectionSub, { color: colors.muted }]}>Manage who has admin access</Text>
          </View>
          <Pressable style={[st.inviteBtn, { backgroundColor: colors.accent }]} onPress={() => setInviteModal(true)}>
            <Text style={st.inviteBtnText}>+ Invite / Promote</Text>
          </Pressable>
        </View>

        <View style={[st.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search admins…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={handleSearchChange}
          />
        </View>
      </View>

      {loading && users.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={<Text style={[st.empty, { color: colors.muted }]}>No admins found</Text>}
          ListFooterComponent={
            <View>
              {total > 0 && (
                <Text style={[st.pageInfo, { color: colors.muted }]}>
                  Showing {skip + 1}–{Math.min(skip + users.length, total)} of {total}
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
          renderItem={({ item: u }) => {
            const allRoles = u.roles ?? (u.role ? [u.role] : ["USER"]);
            return (
              <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <UserAvatar user={u} />
                <View style={st.rowInfo}>
                  <Text style={[st.rowName, { color: colors.text }]} numberOfLines={1}>
                    {u.displayName ?? u.username ?? "—"}
                  </Text>
                  <Text style={[st.rowEmail, { color: colors.muted }]} numberOfLines={1}>{u.email}</Text>
                  <View style={st.rowMeta}>
                    {allRoles.map((r) => {
                      const rc = ROLE_COLORS[r] ?? { bg: colors.section, text: colors.subtext };
                      return (
                        <View key={r} style={[st.rolePill, { backgroundColor: rc.bg }]}>
                          <Text style={[st.roleText, { color: rc.text }]}>{r}</Text>
                        </View>
                      );
                    })}
                    <View style={[st.statusPill, { backgroundColor: u.emailVerified ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)" }]}>
                      <Text style={[st.statusText, { color: u.emailVerified ? "#22c55e" : "#64748b" }]}>
                        {u.emailVerified ? "VERIFIED" : "UNVERIFIED"}
                      </Text>
                    </View>
                  </View>
                  {u.createdAt && (
                    <Text style={[st.joinedText, { color: colors.muted }]}>
                      Joined {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </Text>
                  )}
                </View>
                <View style={st.rowActions}>
                  <Pressable
                    style={[st.actionBtn, { borderColor: colors.accent }]}
                    onPress={() => router.push(`/user/${u.id}` as never)}
                    hitSlop={4}
                  >
                    <Text style={[st.actionBtnText, { color: colors.accent }]}>👤</Text>
                  </Pressable>
                  <Pressable
                    style={[st.actionBtn, { borderColor: "#f59e0b" }]}
                    onPress={() => void handleRevokeAdmin(u)}
                    hitSlop={4}
                  >
                    <Text style={[st.actionBtnText, { color: "#f59e0b" }]}>✕</Text>
                  </Pressable>
                  <Pressable
                    style={[st.actionBtn, { borderColor: "#f87171" }]}
                    onPress={() => void handleRemoveAccount(u)}
                    hitSlop={4}
                  >
                    <Text style={[st.actionBtnText, { color: "#f87171" }]}>🗑</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Invite / Promote admin modal — search non-admins to promote, or invite a new email */}
      <Modal visible={inviteModal} transparent animationType="slide" onRequestClose={closeInviteModal}>
        <View style={st.modalRoot}>
          {/* Backdrop — separate sibling so the sheet's FlatList keeps the scroll responder */}
          <Pressable style={st.overlay} onPress={closeInviteModal} />
          <View style={[st.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <View style={st.handle} />
            <Text style={[st.sheetTitle, { color: colors.text }]}>Invite / Promote Admin</Text>
            <Text style={[st.sheetSub, { color: colors.muted }]}>
              Search a user to promote, or enter a new email to invite them as admin.
            </Text>

            <View style={[st.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
              <TextInput
                style={[st.searchInput, { color: colors.text }]}
                placeholder="Search by name or email…"
                placeholderTextColor={colors.muted}
                value={inviteSearch}
                onChangeText={handleInviteSearchChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>

            {/* Invite-by-email CTA when a new (non-user) email is entered */}
            {showInviteByEmail && (
              <Pressable
                style={[st.submitBtn, { backgroundColor: colors.accent }, invitingAdmin && { opacity: 0.6 }]}
                onPress={() => void handleInviteByEmail(trimmedInviteEmail)}
                disabled={invitingAdmin}
              >
                {invitingAdmin ? <ActivityIndicator color="#fff" /> : (
                  <Text style={st.submitBtnText} numberOfLines={1}>✉  Invite {trimmedInviteEmail} as admin</Text>
                )}
              </Pressable>
            )}

            {/* Matching non-admin users */}
            <View style={st.candidateList}>
              {candidatesLoading && candidates.length === 0 ? (
                <ActivityIndicator color={colors.accent} style={{ marginVertical: 18 }} />
              ) : candidates.length === 0 ? (
                <Text style={[st.empty, { color: colors.muted }]}>
                  {inviteSearchDebounced ? "No matching users" : "Start typing to search users"}
                </Text>
              ) : (
                <FlatList
                  data={candidates}
                  keyExtractor={(u) => u.id}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 340 }}
                  ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                  renderItem={({ item: u }) => {
                    const done = processedEmails[u.email.toLowerCase()];
                    return (
                      <View style={[st.candidateRow, { borderColor: colors.border }]}>
                        <UserAvatar user={u} size={38} />
                        <View style={st.rowInfo}>
                          <Text style={[st.rowName, { color: colors.text }]} numberOfLines={1}>
                            {u.displayName ?? u.username ?? "—"}
                          </Text>
                          <Text style={[st.rowEmail, { color: colors.muted }]} numberOfLines={1}>{u.email}</Text>
                        </View>
                        {done === "promoted" ? (
                          <Text style={[st.doneBadge, { color: "#22c55e" }]}>✓ Promoted</Text>
                        ) : (
                          <Pressable
                            style={[st.promotePill, { backgroundColor: colors.accent }, promoting && { opacity: 0.6 }]}
                            onPress={() => void handlePromoteUser(u.email)}
                            disabled={promoting}
                          >
                            <Text style={st.promotePillText}>Promote</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { padding: 12, borderBottomWidth: 1, gap: 10 },
    headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: "800" },
    sectionSub: { fontSize: 12, marginTop: 2 },
    inviteBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    inviteBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
    searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, gap: 6 },
    searchIcon: { fontSize: 14 },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 9 },
    list: { padding: 12, gap: 8 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    pageInfo: { textAlign: "center", fontSize: 12, paddingTop: 12, paddingBottom: 4 },
    paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4 },
    pageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    pageBtnDisabled: { opacity: 0.4 },
    pageBtnText: { fontSize: 13, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "flex-start", borderRadius: 12, borderWidth: 1, padding: 10, gap: 10 },
    rowInfo: { flex: 1, gap: 3 },
    rowName: { fontSize: 14, fontWeight: "700" },
    rowEmail: { fontSize: 12 },
    rowMeta: { flexDirection: "row", gap: 4, flexWrap: "wrap", marginTop: 2 },
    rolePill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    roleText: { fontSize: 10, fontWeight: "700" },
    statusPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    statusText: { fontSize: 10, fontWeight: "700" },
    joinedText: { fontSize: 10, marginTop: 2 },
    rowActions: { flexDirection: "column", gap: 5, paddingTop: 2 },
    actionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    actionBtnText: { fontSize: 13 },
    modalRoot: { flex: 1 },
    overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 4 },
    sheetTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
    sheetSub: { fontSize: 12, textAlign: "center", marginTop: -4, marginBottom: 2 },
    submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
    candidateList: { minHeight: 60 },
    candidateRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
    },
    promotePill: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    promotePillText: { color: "#fff", fontWeight: "700", fontSize: 12 },
    doneBadge: { fontSize: 12, fontWeight: "700", paddingHorizontal: 8 },
  });
}
