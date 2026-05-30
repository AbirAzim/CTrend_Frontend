import { useMutation, useQuery } from "@apollo/client/react";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LIST_USERS,
  REMOVE_USER,
  PROMOTE_TO_ADMIN,
  INVITE_USER,
  INVITE_USERS_BULK,
} from "@ctrend/shared/graphql/admin";
import { SEND_ADMIN_BROADCAST as BROADCAST } from "@ctrend/shared/graphql/notifications";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

const PAGE = 20;

type User = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  role?: string | null;
  profileImageUrl?: string | null;
};

type ListUsersData = { listUsers: User[] };

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [bcastTitle, setBcastTitle] = useState("");
  const [bcastBody, setBcastBody] = useState("");

  const { data, loading, refetch } = useQuery<ListUsersData>(LIST_USERS, {
    variables: { skip, take: PAGE, role: roleFilter ?? undefined },
    fetchPolicy: "cache-and-network",
  });

  const [removeMut] = useMutation(REMOVE_USER);
  const [promoteMut] = useMutation(PROMOTE_TO_ADMIN);
  const [inviteMut, { loading: inviting }] = useMutation(INVITE_USER);
  const [bulkMut, { loading: bulkInviting }] = useMutation(INVITE_USERS_BULK);
  const [broadcastMut, { loading: broadcasting }] = useMutation(BROADCAST);

  const users = (data?.listUsers ?? []).filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.username ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function handleRemove(u: User) {
    Alert.alert("Remove user", `Remove ${u.email}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: async () => {
          try {
            await removeMut({ variables: { email: u.email } });
            void refetch();
            showToast("User removed", "success");
          } catch { showToast("Failed to remove user", "error"); }
        },
      },
    ]);
  }

  async function handlePromote(u: User) {
    Alert.alert("Promote to admin", `Give admin role to ${u.email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Promote",
        onPress: async () => {
          try {
            await promoteMut({ variables: { email: u.email } });
            void refetch();
            showToast("User promoted to admin", "success");
          } catch { showToast("Failed to promote user", "error"); }
        },
      },
    ]);
  }

  async function handleInvite() {
    const emails = bulkEmails.trim()
      ? bulkEmails.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean)
      : inviteEmail.trim() ? [inviteEmail.trim()] : [];
    if (!emails.length) return;
    try {
      if (emails.length === 1) {
        await inviteMut({ variables: { email: emails[0] } });
      } else {
        await bulkMut({ variables: { emails } });
      }
      setInviteEmail("");
      setBulkEmails("");
      setInviteModal(false);
      showToast(`Invited ${emails.length} user${emails.length > 1 ? "s" : ""}`, "success");
    } catch { showToast("Failed to send invite", "error"); }
  }

  async function handleBroadcast() {
    if (!bcastTitle.trim() || !bcastBody.trim()) return;
    try {
      await broadcastMut({ variables: { title: bcastTitle.trim(), body: bcastBody.trim() } });
      setBcastTitle("");
      setBcastBody("");
      setBroadcastModal(false);
      showToast("Broadcast sent", "success");
    } catch { showToast("Failed to send broadcast", "error"); }
  }

  const st = makeStyles(colors);

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Search + filters */}
      <View style={[st.toolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TextInput
          style={[st.search, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
          placeholder="Search email / username…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        <View style={st.filterRow}>
          {[null, "USER", "ADMIN"].map((r) => (
            <Pressable
              key={String(r)}
              style={[st.filterChip, { borderColor: colors.border }, roleFilter === r && { backgroundColor: colors.accent, borderColor: colors.accent }]}
              onPress={() => { setRoleFilter(r); setSkip(0); }}
            >
              <Text style={[st.filterChipText, { color: roleFilter === r ? "#fff" : colors.subtext }]}>
                {r ?? "All"}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[st.filterChip, { borderColor: colors.accent }]} onPress={() => setInviteModal(true)}>
            <Text style={[st.filterChipText, { color: colors.accent }]}>+ Invite</Text>
          </Pressable>
          <Pressable style={[st.filterChip, { borderColor: "#f59e0b" }]} onPress={() => setBroadcastModal(true)}>
            <Text style={[st.filterChipText, { color: "#f59e0b" }]}>📢</Text>
          </Pressable>
        </View>
      </View>

      {loading && users.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={<Text style={[st.empty, { color: colors.muted }]}>No users found</Text>}
          ListFooterComponent={
            <View style={st.paginationRow}>
              <Pressable style={[st.pageBtn, { borderColor: colors.border }]} onPress={() => setSkip(Math.max(0, skip - PAGE))} disabled={skip === 0}>
                <Text style={[st.pageBtnText, { color: skip === 0 ? colors.muted : colors.accent }]}>← Prev</Text>
              </Pressable>
              <Text style={[st.pageInfo, { color: colors.muted }]}>{skip + 1}–{skip + users.length}</Text>
              <Pressable style={[st.pageBtn, { borderColor: colors.border }]} onPress={() => setSkip(skip + PAGE)} disabled={users.length < PAGE}>
                <Text style={[st.pageBtnText, { color: users.length < PAGE ? colors.muted : colors.accent }]}>Next →</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: u }) => (
            <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[st.avatar, { backgroundColor: "#312e81" }]}>
                <Text style={st.avatarText}>{(u.displayName ?? u.username ?? u.email).slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={st.rowInfo}>
                <Text style={[st.rowName, { color: colors.text }]} numberOfLines={1}>
                  {u.displayName ?? u.username ?? "—"}
                </Text>
                <Text style={[st.rowEmail, { color: colors.muted }]} numberOfLines={1}>{u.email}</Text>
                <View style={[st.rolePill, { backgroundColor: u.role === "ADMIN" ? "rgba(99,102,241,0.15)" : colors.section }]}>
                  <Text style={[st.roleText, { color: u.role === "ADMIN" ? colors.accent : colors.subtext }]}>{u.role ?? "USER"}</Text>
                </View>
              </View>
              <View style={st.rowActions}>
                {u.role !== "ADMIN" && (
                  <Pressable style={st.actionBtn} onPress={() => void handlePromote(u)} hitSlop={4}>
                    <Text style={[st.actionBtnText, { color: colors.accent }]}>↑</Text>
                  </Pressable>
                )}
                <Pressable style={[st.actionBtn, st.actionBtnDanger]} onPress={() => void handleRemove(u)} hitSlop={4}>
                  <Text style={[st.actionBtnText, { color: "#f87171" }]}>🗑</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {/* Invite modal */}
      <Modal visible={inviteModal} transparent animationType="slide" onRequestClose={() => setInviteModal(false)}>
        <Pressable style={st.overlay} onPress={() => setInviteModal(false)}>
          <View style={[st.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]} onStartShouldSetResponder={() => true}>
            <View style={st.handle} />
            <Text style={[st.sheetTitle, { color: colors.text }]}>Invite Users</Text>
            <TextInput
              style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Single email"
              placeholderTextColor={colors.muted}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={[st.orLabel, { color: colors.muted }]}>— or bulk (one per line / comma-separated) —</Text>
            <TextInput
              style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border, height: 80 }]}
              placeholder="email1@x.com, email2@x.com…"
              placeholderTextColor={colors.muted}
              value={bulkEmails}
              onChangeText={setBulkEmails}
              multiline
              autoCapitalize="none"
            />
            <Pressable
              style={[st.submitBtn, { backgroundColor: colors.accent }, (inviting || bulkInviting) && { opacity: 0.6 }]}
              onPress={() => void handleInvite()}
              disabled={inviting || bulkInviting}
            >
              {inviting || bulkInviting ? <ActivityIndicator color="#fff" /> : <Text style={st.submitBtnText}>Send Invites</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Broadcast modal */}
      <Modal visible={broadcastModal} transparent animationType="slide" onRequestClose={() => setBroadcastModal(false)}>
        <Pressable style={st.overlay} onPress={() => setBroadcastModal(false)}>
          <View style={[st.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]} onStartShouldSetResponder={() => true}>
            <View style={st.handle} />
            <Text style={[st.sheetTitle, { color: colors.text }]}>📢 Broadcast Notification</Text>
            <TextInput
              style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Title"
              placeholderTextColor={colors.muted}
              value={bcastTitle}
              onChangeText={setBcastTitle}
            />
            <TextInput
              style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border, height: 80 }]}
              placeholder="Message body…"
              placeholderTextColor={colors.muted}
              value={bcastBody}
              onChangeText={setBcastBody}
              multiline
            />
            <Pressable
              style={[st.submitBtn, { backgroundColor: "#f59e0b" }, broadcasting && { opacity: 0.6 }]}
              onPress={() => void handleBroadcast()}
              disabled={broadcasting}
            >
              {broadcasting ? <ActivityIndicator color="#fff" /> : <Text style={st.submitBtnText}>Send Broadcast</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    toolbar: { padding: 12, borderBottomWidth: 1, gap: 8 },
    search: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
    filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    filterChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
    filterChipText: { fontSize: 11, fontWeight: "700" },
    list: { padding: 12, gap: 8 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 4 },
    pageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    pageBtnText: { fontSize: 13, fontWeight: "700" },
    pageInfo: { fontSize: 12 },
    row: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    rowInfo: { flex: 1, gap: 2 },
    rowName: { fontSize: 14, fontWeight: "700" },
    rowEmail: { fontSize: 12 },
    rolePill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 2 },
    roleText: { fontSize: 10, fontWeight: "700" },
    rowActions: { flexDirection: "row", gap: 6 },
    actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    actionBtnDanger: {},
    actionBtnText: { fontSize: 15 },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 4 },
    sheetTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
    orLabel: { fontSize: 11, textAlign: "center" },
    modalInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
