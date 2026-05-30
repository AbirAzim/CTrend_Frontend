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
  LIST_INVITATIONS,
  CANCEL_INVITATION,
  RESEND_INVITATION,
  INVITE_ADMIN,
} from "@ctrend/shared/graphql/admin";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../../components/useToast";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
  invitedBy?: {
    displayName?: string | null;
    username?: string | null;
    email: string;
  } | null;
};

type ListInvitationsData = { listInvitations: Invitation[] };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
  ACCEPTED: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
  EXPIRED: { bg: "rgba(100,116,139,0.15)", text: "#64748b" },
  CANCELLED: { bg: "rgba(248,113,113,0.15)", text: "#f87171" },
};

export default function InvitationsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [adminModal, setAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const { data, loading, refetch } = useQuery<ListInvitationsData>(LIST_INVITATIONS, {
    variables: { status: statusFilter ?? undefined },
    fetchPolicy: "cache-and-network",
  });

  const [cancelMut] = useMutation(CANCEL_INVITATION);
  const [resendMut] = useMutation(RESEND_INVITATION);
  const [inviteAdminMut, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);

  const invitations = data?.listInvitations ?? [];

  async function handleCancel(inv: Invitation) {
    Alert.alert("Cancel invitation", `Cancel invitation for ${inv.email}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel invite",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelMut({ variables: { id: inv.id } });
            void refetch();
            showToast("Invitation cancelled", "success");
          } catch { showToast("Failed to cancel", "error"); }
        },
      },
    ]);
  }

  async function handleResend(inv: Invitation) {
    try {
      await resendMut({ variables: { id: inv.id } });
      showToast("Invitation resent", "success");
    } catch { showToast("Failed to resend", "error"); }
  }

  async function handleInviteAdmin() {
    if (!adminEmail.trim()) return;
    try {
      await inviteAdminMut({ variables: { email: adminEmail.trim() } });
      setAdminEmail("");
      setAdminModal(false);
      showToast("Admin invitation sent", "success");
    } catch { showToast("Failed to send admin invite", "error"); }
  }

  const st = makeStyles(colors);

  return (
    <View style={[st.screen, { paddingBottom: insets.bottom }]}>
      <ToastView />

      {/* Filters */}
      <View style={[st.toolbar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={st.filterRow}>
          {([null, "PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"] as const).map((s) => {
            const active = statusFilter === s;
            const col = s ? STATUS_COLORS[s]?.text ?? colors.subtext : colors.subtext;
            return (
              <Pressable
                key={String(s)}
                style={[
                  st.filterChip,
                  { borderColor: active ? col : colors.border },
                  active && { backgroundColor: col + "22" },
                ]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[st.filterChipText, { color: active ? col : colors.subtext }]}>
                  {s ?? "All"}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[st.filterChip, { borderColor: "#7c3aed" }]}
            onPress={() => setAdminModal(true)}
          >
            <Text style={[st.filterChipText, { color: "#7c3aed" }]}>+ Admin</Text>
          </Pressable>
        </View>
      </View>

      {loading && invitations.length === 0 ? (
        <View style={st.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={(i) => i.id}
          contentContainerStyle={st.list}
          ListEmptyComponent={
            <Text style={[st.empty, { color: colors.muted }]}>No invitations</Text>
          }
          renderItem={({ item: inv }) => {
            const sc = STATUS_COLORS[inv.status] ?? { bg: "rgba(100,116,139,0.1)", text: colors.muted };
            const isPending = inv.status === "PENDING";
            return (
              <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={st.rowInfo}>
                  <Text style={[st.email, { color: colors.text }]} numberOfLines={1}>{inv.email}</Text>
                  <View style={st.metaRow}>
                    <View style={[st.statusPill, { backgroundColor: sc.bg }]}>
                      <Text style={[st.statusText, { color: sc.text }]}>{inv.status}</Text>
                    </View>
                    <View style={[st.rolePill, { backgroundColor: inv.role === "ADMIN" ? "rgba(124,58,237,0.15)" : colors.section }]}>
                      <Text style={[st.roleText, { color: inv.role === "ADMIN" ? "#7c3aed" : colors.subtext }]}>{inv.role}</Text>
                    </View>
                  </View>
                  {inv.invitedBy && (
                    <Text style={[st.invitedBy, { color: colors.muted }]} numberOfLines={1}>
                      by {inv.invitedBy.displayName ?? inv.invitedBy.username ?? inv.invitedBy.email}
                    </Text>
                  )}
                  {inv.expiresAt && (
                    <Text style={[st.expiry, { color: colors.muted }]}>
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <View style={st.rowActions}>
                  {isPending && (
                    <Pressable style={[st.actionBtn, { borderColor: colors.accent }]} onPress={() => void handleResend(inv)}>
                      <Text style={[st.actionBtnText, { color: colors.accent }]}>↺</Text>
                    </Pressable>
                  )}
                  {isPending && (
                    <Pressable style={[st.actionBtn, { borderColor: "#f87171" }]} onPress={() => void handleCancel(inv)}>
                      <Text style={[st.actionBtnText, { color: "#f87171" }]}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Invite admin modal */}
      <Modal visible={adminModal} transparent animationType="slide" onRequestClose={() => setAdminModal(false)}>
        <Pressable style={st.overlay} onPress={() => setAdminModal(false)}>
          <View
            style={[st.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={st.handle} />
            <Text style={[st.sheetTitle, { color: colors.text }]}>Invite Admin</Text>
            <TextInput
              style={[st.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              value={adminEmail}
              onChangeText={setAdminEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable
              style={[st.submitBtn, { backgroundColor: "#7c3aed" }, invitingAdmin && { opacity: 0.6 }]}
              onPress={() => void handleInviteAdmin()}
              disabled={invitingAdmin}
            >
              {invitingAdmin
                ? <ActivityIndicator color="#fff" />
                : <Text style={st.submitBtnText}>Send Admin Invite</Text>}
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
    toolbar: { padding: 12, borderBottomWidth: 1 },
    filterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
    filterChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
    filterChipText: { fontSize: 11, fontWeight: "700" },
    list: { padding: 12, gap: 8 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      gap: 10,
    },
    rowInfo: { flex: 1, gap: 4 },
    email: { fontSize: 14, fontWeight: "600" },
    metaRow: { flexDirection: "row", gap: 6, alignItems: "center" },
    statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: "700" },
    rolePill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    roleText: { fontSize: 10, fontWeight: "700" },
    invitedBy: { fontSize: 11 },
    expiry: { fontSize: 11 },
    rowActions: { flexDirection: "row", gap: 6 },
    actionBtn: {
      width: 32, height: 32, borderRadius: 8,
      borderWidth: 1.5, alignItems: "center", justifyContent: "center",
    },
    actionBtnText: { fontSize: 16, fontWeight: "700" },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
    sheet: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, gap: 12,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#444", alignSelf: "center", marginBottom: 4 },
    sheetTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
    modalInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: "center" },
    submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
}
