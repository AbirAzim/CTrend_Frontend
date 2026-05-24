import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { INVITE_ADMIN, INVITE_USER, LIST_USERS, REMOVE_ADMIN, REMOVE_USER } from "../graphql/admin";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

const SYSTEM_ADMIN_EMAIL = "systemadminctrend@gmail.com";
const PAGE_SIZE = 20;

type UserRow = {
  id: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  role?: string | null;
};

// ─── Invite Modal ────────────────────────────────────────────────────────────

function InviteModal({ type, onClose }: { type: "user" | "admin"; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const [inviteUser, { loading: invitingUser }] = useMutation(INVITE_USER);
  const [inviteAdmin, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);
  const loading = invitingUser || invitingAdmin;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setErrorMsg("");
    try {
      if (type === "admin") {
        await inviteAdmin({ variables: { email: email.trim() } });
      } else {
        await inviteUser({ variables: { email: email.trim() } });
      }
      setStatus("success");
      setEmail("");
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      setErrorMsg(
        msg.includes("A user with this email already exists")
          ? "This email is already registered on CTrend."
          : msg,
      );
      setStatus("error");
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="dialog" aria-modal>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="admin-modal-title">
          Invite {type === "admin" ? "New Admin" : "New User"}
        </h2>
        {type === "admin" && (
          <p className="muted small" style={{ marginBottom: 12 }}>
            This person will receive admin-level access to CTrend.
          </p>
        )}
        {status === "success" ? (
          <>
            <p className="admin-modal-success">
              Invitation sent! They'll receive an email to set up their account.
            </p>
            <button type="button" className="btn-ghost" onClick={onClose} style={{ marginTop: 12 }}>
              Close
            </button>
          </>
        ) : (
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
            {status === "error" && <p className="error" role="alert">{errorMsg}</p>}
            <div className="admin-modal-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Sending…" : "Send invitation"}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="admin-modal-overlay" role="dialog" aria-modal>
      <div className="admin-modal">
        <p className="admin-confirm-msg">{message}</p>
        <div className="admin-modal-actions">
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Removing…" : "Confirm"}
          </button>
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Table ──────────────────────────────────────────────────────────────

function UserTable({
  users,
  onRemove,
  removing,
}: {
  users: UserRow[];
  onRemove: (user: UserRow) => void;
  removing: boolean;
}) {
  if (users.length === 0) {
    return <p className="muted small">No users found.</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Username</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL;
            return (
              <tr key={user.id} className="admin-table-row">
                <td>
                  <div className="admin-user-cell">
                    <span className="admin-user-avatar">
                      {(user.displayName || user.username || user.email)[0]!.toUpperCase()}
                    </span>
                    <span>{user.displayName || <span className="muted">No name</span>}</span>
                  </div>
                </td>
                <td className="admin-table-email">{user.email}</td>
                <td>{user.username ? `@${user.username}` : <span className="muted">—</span>}</td>
                <td>
                  <button
                    type="button"
                    className="btn-ghost admin-remove-btn"
                    disabled={isSystemAdmin || removing}
                    title={isSystemAdmin ? "System admin cannot be removed" : "Remove"}
                    onClick={() => onRemove(user)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

  const [removeUser, { loading: removingUser }] = useMutation(REMOVE_USER);
  const removing = removingUser;

  const allUsers = (data?.listUsers ?? []).filter((u) => u.role !== "admin");
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

      <UserTable
        users={filtered}
        onRemove={(u) => { setRemoveError(null); setConfirmTarget(u); }}
        removing={removing}
      />

      <div className="admin-pagination">
        <button
          type="button"
          className="btn-ghost"
          disabled={skip === 0 || loading}
          onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        >
          ← Previous
        </button>
        <span className="muted small">Showing {skip + 1}–{skip + allUsers.length}</span>
        <button
          type="button"
          className="btn-ghost"
          disabled={allUsers.length < PAGE_SIZE || loading}
          onClick={() => setSkip((s) => s + PAGE_SIZE)}
        >
          Next →
        </button>
      </div>

      {inviteModal && <InviteModal type="user" onClose={() => setInviteModal(false)} />}
      {confirmTarget && (
        <ConfirmDialog
          message={`Remove ${confirmTarget.displayName || confirmTarget.email}? This cannot be undone.`}
          onConfirm={() => void handleRemove(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
          loading={removing}
        />
      )}
    </div>
  );
}

// ─── Admins Tab ──────────────────────────────────────────────────────────────

function AdminsTab() {
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<UserRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);

  const { data, loading, error, refetch } = useQuery<{ listUsers: UserRow[] }>(LIST_USERS, {
    variables: { skip, take: PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const [removeAdmin, { loading: removingAdmin }] = useMutation(REMOVE_ADMIN);
  const removing = removingAdmin;

  const admins = (data?.listUsers ?? []).filter((u) => u.role === "admin");
  const filtered = searchTerm.trim()
    ? admins.filter(
        (u) =>
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.displayName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.username ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : admins;

  async function handleRemove(user: UserRow) {
    setRemoveError(null);
    try {
      await removeAdmin({ variables: { email: user.email } });
      setConfirmTarget(null);
      void refetch();
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      setRemoveError(
        msg.includes("ForbiddenException") || msg.includes("system admin")
          ? "The system admin account cannot be removed."
          : msg,
      );
      setConfirmTarget(null);
    }
  }

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
          + Invite Admin
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

      {!loading && filtered.length === 0 && (
        <p className="muted small">No admins found.</p>
      )}

      {filtered.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th>Status</th>
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
                        <span className="admin-user-avatar admin-user-avatar--admin">
                          {(user.displayName || user.username || user.email)[0]!.toUpperCase()}
                        </span>
                        <span>{user.displayName || <span className="muted">No name</span>}</span>
                      </div>
                    </td>
                    <td className="admin-table-email">{user.email}</td>
                    <td>{user.username ? `@${user.username}` : <span className="muted">—</span>}</td>
                    <td>
                      {isSystemAdmin ? (
                        <span className="admin-role-badge admin-role-badge--system">system</span>
                      ) : (
                        <span className="admin-role-badge admin-role-badge--admin">admin</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost admin-remove-btn"
                        disabled={isSystemAdmin || removing}
                        title={isSystemAdmin ? "System admin cannot be removed" : "Remove admin"}
                        onClick={() => { setRemoveError(null); setConfirmTarget(user); }}
                      >
                        Remove
                      </button>
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
        <span className="muted small">Showing {skip + 1}–{skip + admins.length}</span>
        <button
          type="button"
          className="btn-ghost"
          disabled={admins.length < PAGE_SIZE || loading}
          onClick={() => setSkip((s) => s + PAGE_SIZE)}
        >
          Next →
        </button>
      </div>

      {inviteModal && <InviteModal type="admin" onClose={() => setInviteModal(false)} />}
      {confirmTarget && (
        <ConfirmDialog
          message={`Remove admin access for ${confirmTarget.displayName || confirmTarget.email}? They will lose all admin privileges.`}
          onConfirm={() => void handleRemove(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
          loading={removing}
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
