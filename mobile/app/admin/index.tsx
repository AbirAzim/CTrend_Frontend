import { useMutation, useQuery } from "@apollo/client/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
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
  INVITE_USER,
  INVITE_USERS_BULK,
  PLATFORM_SETTINGS,
  SET_ALLOW_USER_GLOBAL_POSTS,
  SET_MIN_ANDROID_VERSION_CODE,
  PUBLISH_ANDROID_UPDATE_NOTICE,
} from "@ctrend/shared/graphql/admin";
import { BUNDLED_ANDROID_VERSION_CODE, PLAY_STORE_CLOSED_TESTING_URL } from "@ctrend/shared/lib/appUpdate";
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
  roles?: string[] | null;
  profileImageUrl?: string | null;
  emailVerified?: boolean | null;
  createdAt?: string | null;
};

type ListUsersData = { listUsers: User[] };
type CountData = { listUsersCount: number };

function UserAvatar({ user, size = 40 }: { user: User; size?: number; colors?: ReturnType<typeof useTheme>["colors"] }) {
  const initials = (user.displayName ?? user.username ?? user.email)[0]!.toUpperCase();
  if (user.profileImageUrl) {
    return <Image source={{ uri: user.profileImageUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#312e81", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "700" }}>{initials}</Text>
    </View>
  );
}

export default function AdminUsersScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast, ToastView } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [inviteModal, setInviteModal] = useState(false);
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [bcastTitle, setBcastTitle] = useState("");
  const [bcastBody, setBcastBody] = useState("");

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(text);
      setSkip(0);
    }, 350);
  }, []);

  const queryVars = { skip, take: PAGE, role: "user", search: debouncedSearch || undefined };
  const countVars = { role: "user", search: debouncedSearch || undefined };

  const { data, loading, refetch } = useQuery<ListUsersData>(LIST_USERS, {
    variables: queryVars,
    fetchPolicy: "cache-and-network",
  });

  const { data: countData } = useQuery<CountData>(LIST_USERS_COUNT, {
    variables: countVars,
    fetchPolicy: "cache-and-network",
  });

  const [removeMut] = useMutation(REMOVE_USER);
  const [inviteMut, { loading: inviting }] = useMutation(INVITE_USER);
  const [bulkMut, { loading: bulkInviting }] = useMutation(INVITE_USERS_BULK);
  const [broadcastMut, { loading: broadcasting }] = useMutation(BROADCAST);

  // Platform setting: allow normal users to broadcast posts globally (Phase 36)
  const { data: settingsData } = useQuery<{
    platformSettings: {
      allowUserGlobalPosts: boolean;
      minAndroidVersionCode: number;
      androidUpdateTitle: string;
      androidUpdateBody: string;
    };
  }>(PLATFORM_SETTINGS, { fetchPolicy: "cache-and-network" });
  const allowGlobal = Boolean(settingsData?.platformSettings?.allowUserGlobalPosts);
  const minAndroidVersion = settingsData?.platformSettings?.minAndroidVersionCode ?? 0;
  const [setAllowGlobal, { loading: savingGlobal }] = useMutation(SET_ALLOW_USER_GLOBAL_POSTS);
  const [setMinAndroidVersion, { loading: disablingUpdate }] = useMutation(SET_MIN_ANDROID_VERSION_CODE);
  const [publishUpdate, { loading: publishingUpdate }] = useMutation(PUBLISH_ANDROID_UPDATE_NOTICE);
  const [globalDetails, setGlobalDetails] = useState(false);
  // Android update notice is a rarely-used admin tool — collapsed by default so
  // the user list stays prominent.
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false);
  const [minVersionInput, setMinVersionInput] = useState(String(BUNDLED_ANDROID_VERSION_CODE));
  const [updateTitleInput, setUpdateTitleInput] = useState("Update required");
  const [updateBodyInput, setUpdateBodyInput] = useState(
    `A new version of Ke Jitbe is available. Please update from Google Play.\n\nClosed testing: ${PLAY_STORE_CLOSED_TESTING_URL}`,
  );

  useEffect(() => {
    setMinVersionInput(String(minAndroidVersion || BUNDLED_ANDROID_VERSION_CODE));
    const s = settingsData?.platformSettings;
    if (s?.androidUpdateTitle?.trim()) setUpdateTitleInput(s.androidUpdateTitle);
    if (s?.androidUpdateBody?.trim()) setUpdateBodyInput(s.androidUpdateBody);
  }, [minAndroidVersion, settingsData?.platformSettings]);

  async function handlePublishUpdateNotice() {
    const code = parseInt(minVersionInput.trim(), 10);
    if (!Number.isFinite(code) || code <= 0) {
      Alert.alert("Invalid version", "Enter the minimum versionCode for this release (e.g. 11 or 12).");
      return;
    }
    if (!updateTitleInput.trim() || !updateBodyInput.trim()) {
      Alert.alert("Missing text", "Enter a title and message for the update modal.");
      return;
    }
    try {
      const { data: pubData } = await publishUpdate({
        variables: {
          title: updateTitleInput.trim(),
          body: updateBodyInput.trim(),
          minVersionCode: code,
        },
        refetchQueries: [{ query: PLATFORM_SETTINGS }],
      });
      const count = (pubData as { publishAndroidUpdateNotice?: number })?.publishAndroidUpdateNotice ?? 0;
      showToast(`Update notice live · notified ${count} outdated Android user${count === 1 ? "" : "s"}`, "success");
    } catch {
      showToast("Could not publish update notice", "error");
    }
  }

  async function handleDisableForceUpdate() {
    try {
      await setMinAndroidVersion({
        variables: { versionCode: 0 },
        refetchQueries: [{ query: PLATFORM_SETTINGS }],
      });
      showToast("Force update disabled", "success");
    } catch {
      showToast("Could not disable force update", "error");
    }
  }

  async function handleToggleGlobal(next: boolean) {
    try {
      await setAllowGlobal({
        variables: { enabled: next },
        refetchQueries: [{ query: PLATFORM_SETTINGS }],
      });
      showToast(next ? "Global user posts enabled" : "Global user posts disabled", "success");
    } catch {
      showToast("Could not update setting", "error");
    }
  }

  const users = data?.listUsers ?? [];
  const total = countData?.listUsersCount ?? 0;
  const hasMore = skip + users.length < total;

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

      {/* Header */}
      <View style={[st.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={st.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={st.titleRow}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>All Users</Text>
              <View style={[st.countPill, { backgroundColor: colors.accent + "1a", borderColor: colors.accent + "55" }]}>
                <Text style={[st.countPillText, { color: colors.accent }]}>
                  {total.toLocaleString()} total
                </Text>
              </View>
            </View>
            <Text style={[st.sectionSub, { color: colors.muted }]}>
              {debouncedSearch ? `Matching "${debouncedSearch}"` : "Regular users on the platform"}
            </Text>
          </View>
          <Pressable style={[st.inviteBtn, { backgroundColor: colors.accent }]} onPress={() => setInviteModal(true)}>
            <Text style={st.inviteBtnText}>+ Invite User</Text>
          </Pressable>
        </View>

        <View style={[st.searchWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Text style={[st.searchIcon, { color: colors.muted }]}>🔍</Text>
          <TextInput
            style={[st.searchInput, { color: colors.text }]}
            placeholder="Search users…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={handleSearchChange}
          />
        </View>

        <View style={st.toolbarRow}>
          <Pressable style={[st.chip, { borderColor: "#f59e0b" }]} onPress={() => setBroadcastModal(true)}>
            <Text style={[st.chipText, { color: "#f59e0b" }]}>📢 Broadcast</Text>
          </Pressable>
        </View>

        {/* Global user posts toggle (Phase 36) */}
        <View
          style={[
            st.globalCard,
            {
              borderColor: allowGlobal ? "#16a34a" : colors.border,
              backgroundColor: allowGlobal ? "#16a34a14" : colors.inputBg,
            },
          ]}
        >
          <View style={st.globalCardTop}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[st.globalTitle, { color: colors.text }]}>🌍 Global user posts</Text>
              <Text style={[st.globalStatus, { color: allowGlobal ? "#16a34a" : colors.muted }]}>
                {allowGlobal ? "ON — users can post to everyone" : "OFF — only admin platform posts reach everyone"}
              </Text>
            </View>
            <Switch
              value={allowGlobal}
              onValueChange={handleToggleGlobal}
              disabled={savingGlobal}
              trackColor={{ false: colors.section, true: "#16a34a" }}
              thumbColor="#fff"
            />
          </View>
          <Pressable onPress={() => setGlobalDetails((v) => !v)} hitSlop={6}>
            <Text style={[st.globalDetailsToggle, { color: colors.accent }]}>
              {globalDetails ? "Hide details ▴" : "Details ▾"}
            </Text>
          </Pressable>
          {globalDetails && (
            <Text style={[st.globalDetailsText, { color: colors.muted }]}>
              When ON, any user can opt to broadcast a post platform-wide. Their name and photo appear
              in the feed and in everyone&apos;s notifications (🌍), distinct from admin Ke Jitbe
              Platform posts (📢). Default is OFF — turning it off blocks new global user posts.
            </Text>
          )}
        </View>

        <View style={[st.globalCard, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
          <Pressable style={st.collapseHead} onPress={() => setUpdateNoticeOpen((v) => !v)} hitSlop={6}>
            <View style={{ flex: 1 }}>
              <Text style={[st.globalTitle, { color: colors.text }]}>⬆️ Android update notice</Text>
              <Text style={[st.globalStatus, { color: minAndroidVersion > 0 ? colors.accent : colors.muted }]}>
                {minAndroidVersion > 0 ? `Active · min version ${minAndroidVersion}+` : "Off · tap to configure"}
              </Text>
            </View>
            <Text style={[st.collapseChevron, { color: colors.muted }]}>{updateNoticeOpen ? "▴" : "▾"}</Text>
          </Pressable>
          {!updateNoticeOpen ? null : (
          <>
          <Text style={[st.globalStatus, { color: colors.muted, marginTop: 4 }]}>
            Outdated Android users see a blocking modal until they update. Push + in-app alert sent only
            to users below the min version (not up-to-date users).
          </Text>
          <TextInput
            style={[st.modalInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, marginTop: 8 }]}
            placeholder="Modal title"
            placeholderTextColor={colors.muted}
            value={updateTitleInput}
            onChangeText={setUpdateTitleInput}
          />
          <TextInput
            style={[st.modalInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border, height: 88, marginTop: 8 }]}
            placeholder="Modal message…"
            placeholderTextColor={colors.muted}
            value={updateBodyInput}
            onChangeText={setUpdateBodyInput}
            multiline
          />
          <View style={st.minVersionRow}>
            <TextInput
              style={[st.minVersionInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              value={minVersionInput}
              onChangeText={setMinVersionInput}
              keyboardType="number-pad"
              placeholder="Min versionCode"
              placeholderTextColor={colors.muted}
            />
            <Pressable
              style={[st.minVersionSave, { backgroundColor: colors.accent, opacity: publishingUpdate ? 0.6 : 1 }]}
              onPress={() => void handlePublishUpdateNotice()}
              disabled={publishingUpdate}
            >
              <Text style={st.minVersionSaveText}>{publishingUpdate ? "…" : "Publish"}</Text>
            </Pressable>
          </View>
          <Text style={[st.globalDetailsText, { color: colors.muted, marginTop: 8 }]}>
            Current release build: {BUNDLED_ANDROID_VERSION_CODE}. Set min to that versionCode after Play
            rollout. Very old installs (before v8) must update via Play first — then future notices work in-app.
          </Text>
          {minAndroidVersion > 0 && (
            <Pressable
              style={[st.disableUpdateBtn, { borderColor: colors.border }]}
              onPress={() => void handleDisableForceUpdate()}
              disabled={disablingUpdate}
            >
              <Text style={[st.disableUpdateText, { color: colors.muted }]}>
                {disablingUpdate ? "…" : "Turn off force update"}
              </Text>
            </Pressable>
          )}
          </>
          )}
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
          renderItem={({ item: u }) => (
            <View style={[st.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                style={st.rowTap}
                onPress={() => router.push(`/profile/${u.id}` as never)}
                hitSlop={4}
              >
                <UserAvatar user={u} colors={colors} />
                <View style={st.rowInfo}>
                  <Text style={[st.rowName, { color: colors.text }]} numberOfLines={1}>
                    {u.displayName ?? u.username ?? "—"}
                  </Text>
                  <Text style={[st.rowEmail, { color: colors.muted }]} numberOfLines={1}>{u.email}</Text>
                  <View style={st.rowMeta}>
                    <View style={[st.statusPill, { backgroundColor: u.emailVerified ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)" }]}>
                      <Text style={[st.statusText, { color: u.emailVerified ? "#22c55e" : "#64748b" }]}>
                        {u.emailVerified ? "VERIFIED" : "UNVERIFIED"}
                      </Text>
                    </View>
                    {u.createdAt && (
                      <Text style={[st.joinedText, { color: colors.muted }]}>
                        {new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
              <View style={st.rowActions}>
                <Pressable
                  style={[st.actionBtn, { borderColor: "#f87171" }]}
                  onPress={() => void handleRemove(u)}
                  hitSlop={4}
                >
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
    header: { padding: 12, borderBottomWidth: 1, gap: 10 },
    headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: "800" },
    sectionSub: { fontSize: 12, marginTop: 2 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    countPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
    countPillText: { fontSize: 11, fontWeight: "800" },
    collapseHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    collapseChevron: { fontSize: 16, fontWeight: "800" },
    inviteBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
    inviteBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
    searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, gap: 6 },
    searchIcon: { fontSize: 14 },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 9 },
    toolbarRow: { flexDirection: "row", gap: 6 },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
    chipText: { fontSize: 11, fontWeight: "700" },
    globalCard: { borderRadius: 12, borderWidth: 1.5, padding: 12, gap: 6 },
    globalCardTop: { flexDirection: "row", alignItems: "center" },
    globalTitle: { fontSize: 14, fontWeight: "800" },
    globalStatus: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    globalDetailsToggle: { fontSize: 12, fontWeight: "700" },
    globalDetailsText: { fontSize: 12, lineHeight: 17 },
    minVersionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
    minVersionInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontWeight: "700",
    },
    minVersionSave: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
    minVersionSaveText: { color: "#fff", fontWeight: "800", fontSize: 13 },
    disableUpdateBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
    disableUpdateText: { fontSize: 12, fontWeight: "600" },
    list: { padding: 12, gap: 8 },
    empty: { textAlign: "center", padding: 24, fontSize: 14 },
    pageInfo: { textAlign: "center", fontSize: 12, paddingTop: 12, paddingBottom: 4 },
    paginationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4 },
    pageBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
    pageBtnDisabled: { opacity: 0.4 },
    pageBtnText: { fontSize: 13, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 10, gap: 10 },
    rowTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    rowInfo: { flex: 1, gap: 3 },
    rowName: { fontSize: 14, fontWeight: "700" },
    rowEmail: { fontSize: 12 },
    rowMeta: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 2 },
    statusPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
    statusText: { fontSize: 10, fontWeight: "700" },
    joinedText: { fontSize: 10 },
    rowActions: { flexDirection: "row", gap: 6 },
    actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1 },
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
