import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import {
  INVITE_ADMIN,
  INVITE_USER,
  LIST_USERS,
  PROMOTE_TO_ADMIN,
  REMOVE_ADMIN,
  REMOVE_USER,
} from "../graphql/admin";
import { USER_POSTS } from "../graphql/profile";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

const SYSTEM_ADMIN_EMAIL = "systemadminctrend@gmail.com";
const PAGE_SIZE = 20;

type UserRow = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  role?: string | null;
  roles?: string[] | null;
  profileImageUrl?: string | null;
};

function hasAdminRole(user: UserRow): boolean {
  if (user.roles?.length) {
    return user.roles.some((r) => r.toLowerCase() === "admin");
  }
  return user.role?.toLowerCase() === "admin";
}

function avatarUrl(user: UserRow): string | null {
  if (user.profileImageUrl?.trim()) return user.profileImageUrl.trim();
  const email = user.email.trim().toLowerCase();
  if (email.endsWith("@gmail.com")) {
    return `https://www.google.com/s2/photos/profile/${encodeURIComponent(email)}?sz=64`;
  }
  return null;
}

// ─── Role badges ─────────────────────────────────────────────────────────────

function RoleBadges({ user }: { user: UserRow }) {
  const roles = user.roles?.length ? user.roles : user.role ? [user.role] : [];
  return (
    <span className="admin-roles-wrap">
      {roles.map((r) => {
        const normalized = r.toLowerCase();
        const cls =
          normalized === "admin"
            ? "admin-role-badge admin-role-badge--admin"
            : "admin-role-badge admin-role-badge--user";
        return (
          <span key={r} className={cls}>
            {normalized}
          </span>
        );
      })}
      {user.email === SYSTEM_ADMIN_EMAIL && (
        <span className="admin-role-badge admin-role-badge--system">system</span>
      )}
    </span>
  );
}

// ─── Invite / Promote Modal ──────────────────────────────────────────────────

type InviteStep = "form" | "confirm-promote" | "success";

function InviteModal({
  type,
  onClose,
  onDone,
}: {
  type: "user" | "admin";
  onClose: () => void;
  onDone?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<InviteStep>("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [promoteError, setPromoteError] = useState("");

  const [inviteUser, { loading: invitingUser }] = useMutation(INVITE_USER);
  const [inviteAdmin, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);
  const [promoteToAdmin, { loading: promoting }] = useMutation(PROMOTE_TO_ADMIN);
  const loading = invitingUser || invitingAdmin;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const trimmed = email.trim();
    try {
      if (type === "admin") {
        await inviteAdmin({ variables: { email: trimmed } });
      } else {
        await inviteUser({ variables: { email: trimmed } });
      }
      setStep("success");
      onDone?.();
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      if (type === "admin" && (msg.includes("already has an account") || msg.includes("promoteToAdmin"))) {
        setPendingEmail(trimmed);
        setStep("confirm-promote");
      } else {
        setErrorMsg(msg.includes("A user with this email already exists")
          ? "This email is already registered on CTrend."
          : msg);
      }
    }
  }

  async function onConfirmPromote() {
    setPromoteError("");
    try {
      await promoteToAdmin({ variables: { email: pendingEmail } });
      setStep("success");
      onDone?.();
    } catch (err: unknown) {
      setPromoteError(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        {step === "confirm-promote" ? (
          <>
            <h2 className="admin-modal-title">Grant Admin Access</h2>
            <p className="muted small" style={{ marginBottom: 14 }}>
              <strong>{pendingEmail}</strong> already has a CTrend account.
              Grant them admin access instead?
            </p>
            {promoteError && <p className="error" role="alert">{promoteError}</p>}
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void onConfirmPromote()}
                disabled={promoting}
              >
                {promoting ? "Granting…" : "Grant admin access"}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose} disabled={promoting}>
                Cancel
              </button>
            </div>
          </>
        ) : step === "success" ? (
          <>
            <p className="admin-modal-success">
              {type === "admin"
                ? "Admin access granted! They'll receive an email to finish setting up their account."
                : "Invitation sent! They'll receive an email to join CTrend."}
            </p>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              style={{ marginTop: 12 }}
            >
              Close
            </button>
          </>
        ) : (
          <>
            <h2 className="admin-modal-title">
              Invite {type === "admin" ? "New Admin" : "New User"}
            </h2>
            {type === "admin" && (
              <p className="muted small" style={{ marginBottom: 12 }}>
                If they already have an account, you'll be prompted to grant admin access instead.
              </p>
            )}
            <form onSubmit={(ev) => void onSubmit(ev)} className="admin-modal-form">
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
              {errorMsg && <p className="error" role="alert">{errorMsg}</p>}
              <div className="admin-modal-actions">
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? "Sending…" : "Send invitation"}
                </button>
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal>
      <div className="admin-modal">
        <p className="admin-confirm-msg">{message}</p>
        <div className="admin-modal-actions">
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function AdminAvatar({ user, adminStyle }: { user: UserRow; adminStyle?: boolean }) {
  const src = avatarUrl(user);
  const initials = (user.displayName || user.username || user.email)[0]!.toUpperCase();
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={user.displayName ?? user.username ?? ""}
        className={`admin-user-avatar admin-user-avatar--img${adminStyle ? " admin-user-avatar--admin" : ""}`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`admin-user-avatar${adminStyle ? " admin-user-avatar--admin" : ""}`}>
      {initials}
    </span>
  );
}

// ─── Per-user engagement stats ───────────────────────────────────────────────

function UserStats({ userId }: { userId: string }) {
  const { data, loading } = useQuery(USER_POSTS, {
    variables: { userId },
    fetchPolicy: "cache-first",
    errorPolicy: "all",
  });

  if (loading) return <span className="muted small">…</span>;
  const posts: Array<{
    totalVotes?: number | null;
    upvoteCount?: number | null;
    downvoteCount?: number | null;
    isVotingOpen?: boolean | null;
  }> = data?.getPostsByUser ?? [];
  const totalVotes = posts.reduce(
    (sum, p) => sum + (p.totalVotes ?? (p.upvoteCount ?? 0) + (p.downvoteCount ?? 0)),
    0,
  );
  const activePolls = posts.filter((p) => p.isVotingOpen !== false).length;

  return (
    <span className="admin-user-stats">
      <span className="admin-stat-chip">{posts.length} posts</span>
      <span className="admin-stat-chip">{totalVotes.toLocaleString()} votes</span>
      {activePolls > 0 && (
        <span className="admin-stat-chip admin-stat-chip--active">{activePolls} live</span>
      )}
    </span>
  );
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab() {
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<UserRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);

  const { data, loading, error, refetch } = useQuery<{ listUsers: UserRow[] }>(LIST_USERS, {
    variables: { skip, take: PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const [removeUser, { loading: removing }] = useMutation(REMOVE_USER);

  const allUsers = (data?.listUsers ?? []).filter((u) => !hasAdminRole(u));
  const filtered = searchTerm.trim()
    ? allUsers.filter(
        (u) =>
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.displayName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.username ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : allUsers;

  async function handleRemove(user: UserRow) {
    setRemoveError(null);
    try {
      await removeUser({ variables: { email: user.email } });
      setConfirmTarget(null);
      void refetch();
    } catch (err: unknown) {
      setRemoveError(getApolloErrorMessage(err));
      setConfirmTarget(null);
    }
  }

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">All Users</h2>
          <p className="muted small">Regular users on the platform</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setInviteModal(true)}>
          + Invite User
        </button>
      </div>

      <input
        type="search"
        className="ig-input admin-search"
        placeholder="Search by name, email, or username…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {removeError && <p className="error" role="alert">{removeError}</p>}
      {loading && <p className="muted small">Loading users…</p>}
      {error && <p className="error">Failed to load users: {error.message}</p>}

      {!loading && filtered.length === 0 && !error && (
        <p className="muted small">No users found.</p>
      )}

      {filtered.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Engagement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="admin-table-row">
                  <td>
                    <div className="admin-user-cell">
                      <AdminAvatar user={user} />
                      <span>{user.displayName || <span className="muted">No name</span>}</span>
                    </div>
                  </td>
                  <td className="admin-table-email">{user.email}</td>
                  <td><RoleBadges user={user} /></td>
                  <td><UserStats userId={user.id} /></td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost admin-remove-btn"
                      disabled={removing}
                      onClick={() => { setRemoveError(null); setConfirmTarget(user); }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination">
        <button
          type="button"
          className="btn-ghost"
          disabled={skip === 0 || loading}
          onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        >
          ← Previous
        </button>
        <span className="muted small">
          Showing {skip + 1}–{skip + allUsers.length}
        </span>
        <button
          type="button"
          className="btn-ghost"
          disabled={allUsers.length < PAGE_SIZE || loading}
          onClick={() => setSkip((s) => s + PAGE_SIZE)}
        >
          Next →
        </button>
      </div>

      {inviteModal && (
        <InviteModal
          type="user"
          onClose={() => setInviteModal(false)}
          onDone={() => void refetch()}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          message={`Remove ${confirmTarget.displayName || confirmTarget.email}? This cannot be undone.`}
          confirmLabel="Remove user"
          onConfirm={() => void handleRemove(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
          loading={removing}
        />
      )}
    </div>
  );
}

// ─── Admins Tab ──────────────────────────────────────────────────────────────

type AdminAction = "revoke" | "remove-account";
type AdminConfirmTarget = { user: UserRow; action: AdminAction };

function AdminsTab() {
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<AdminConfirmTarget | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);

  const { data, loading, error, refetch } = useQuery<{ listUsers: UserRow[] }>(LIST_USERS, {
    variables: { skip, take: PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const [removeAdmin, { loading: revokingAdmin }] = useMutation(REMOVE_ADMIN);
  const [removeUser, { loading: deletingUser }] = useMutation(REMOVE_USER);
  const acting = revokingAdmin || deletingUser;

  const admins = (data?.listUsers ?? []).filter(hasAdminRole);
  const filtered = searchTerm.trim()
    ? admins.filter(
        (u) =>
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.displayName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.username ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : admins;

  async function handleConfirm() {
    if (!confirmTarget) return;
    setRemoveError(null);
    const { user, action } = confirmTarget;
    try {
      if (action === "revoke") {
        await removeAdmin({ variables: { email: user.email } });
      } else {
        // Full removal: demote first, then delete account
        await removeAdmin({ variables: { email: user.email } });
        await removeUser({ variables: { email: user.email } });
      }
      setConfirmTarget(null);
      void refetch();
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      setRemoveError(
        msg.toLowerCase().includes("system admin")
          ? "The system admin account cannot be modified."
          : msg,
      );
      setConfirmTarget(null);
    }
  }

  const confirmMessage = confirmTarget
    ? confirmTarget.action === "revoke"
      ? `Revoke admin access for ${confirmTarget.user.displayName || confirmTarget.user.email}? Their account will be kept as a regular user.`
      : `Permanently remove ${confirmTarget.user.displayName || confirmTarget.user.email}'s account? This cannot be undone.`
    : "";

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">Admin Management</h2>
          <p className="muted small">Manage who has admin access to CTrend</p>
        </div>
        <button
          type="button"
          className="btn-primary admin-btn-admin"
          onClick={() => setInviteModal(true)}
        >
          + Invite / Promote Admin
        </button>
      </div>

      <input
        type="search"
        className="ig-input admin-search"
        placeholder="Search admins…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {removeError && <p className="error" role="alert">{removeError}</p>}
      {loading && <p className="muted small">Loading admins…</p>}
      {error && <p className="error">Failed to load admins: {error.message}</p>}
      {!loading && filtered.length === 0 && !error && (
        <p className="muted small">No admins found.</p>
      )}

      {filtered.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Engagement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL;
                return (
                  <tr key={user.id} className="admin-table-row">
                    <td>
                      <div className="admin-user-cell">
                        <AdminAvatar user={user} adminStyle />
                        <span>{user.displayName || <span className="muted">No name</span>}</span>
                      </div>
                    </td>
                    <td className="admin-table-email">{user.email}</td>
                    <td><RoleBadges user={user} /></td>
                    <td><UserStats userId={user.id} /></td>
                    <td>
                      <div className="admin-action-btns">
                        <button
                          type="button"
                          className="btn-ghost admin-remove-btn"
                          disabled={isSystemAdmin || acting}
                          title={isSystemAdmin ? "System admin cannot be modified" : "Revoke admin role (keeps account)"}
                          onClick={() => {
                            setRemoveError(null);
                            setConfirmTarget({ user, action: "revoke" });
                          }}
                        >
                          Revoke Admin
                        </button>
                        <button
                          type="button"
                          className="btn-ghost admin-remove-btn admin-remove-btn--danger"
                          disabled={isSystemAdmin || acting}
                          title={isSystemAdmin ? "System admin cannot be modified" : "Remove account entirely"}
                          onClick={() => {
                            setRemoveError(null);
                            setConfirmTarget({ user, action: "remove-account" });
                          }}
                        >
                          Remove Account
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-pagination">
        <button
          type="button"
          className="btn-ghost"
          disabled={skip === 0 || loading}
          onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        >
          ← Previous
        </button>
        <span className="muted small">
          Showing {skip + 1}–{skip + admins.length}
        </span>
        <button
          type="button"
          className="btn-ghost"
          disabled={admins.length < PAGE_SIZE || loading}
          onClick={() => setSkip((s) => s + PAGE_SIZE)}
        >
          Next →
        </button>
      </div>

      {inviteModal && (
        <InviteModal
          type="admin"
          onClose={() => setInviteModal(false)}
          onDone={() => void refetch()}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          message={confirmMessage}
          confirmLabel={confirmTarget.action === "revoke" ? "Revoke admin" : "Remove account"}
          onConfirm={() => void handleConfirm()}
          onCancel={() => setConfirmTarget(null)}
          loading={acting}
        />
      )}
    </div>
  );
}

// ─── Admin Page (root) ────────────────────────────────────────────────────────

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "admins">("users");

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin Dashboard</h1>
          <p className="muted small">Manage users and admin access</p>
        </div>
        <span className="admin-role-badge admin-role-badge--admin">admin</span>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab${activeTab === "users" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          type="button"
          className={`admin-tab${activeTab === "admins" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("admins")}
        >
          Admin Management
        </button>
      </div>

      <div className="admin-section">
        {activeTab === "users" ? <UsersTab /> : <AdminsTab />}
      </div>
    </div>
  );
}
