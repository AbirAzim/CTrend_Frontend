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

function InviteModal({
  type,
  onClose,
}: {
  type: "user" | "admin";
  onClose: () => void;
}) {
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
          Invite {type === "admin" ? "Admin" : "Friend"}
        </h2>
        {status === "success" ? (
          <p className="admin-modal-success">
            Invitation sent! The user will receive an email to set up their account.
          </p>
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
            {status === "error" && (
              <p className="error" role="alert">{errorMsg}</p>
            )}
            <div className="admin-modal-actions">
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Sending…" : "Send invitation"}
              </button>
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {status === "success" && (
          <button type="button" className="btn-ghost" onClick={onClose} style={{ marginTop: 12 }}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

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
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={loading}
          >
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

export function AdminPage() {
  const [skip, setSkip] = useState(0);
  const [inviteModal, setInviteModal] = useState<"user" | "admin" | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<UserRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data, loading: listLoading, error: listError, refetch } = useQuery<{
    listUsers: UserRow[];
  }>(LIST_USERS, {
    variables: { skip, take: PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const [removeUser, { loading: removingUser }] = useMutation(REMOVE_USER);
  const [removeAdmin, { loading: removingAdmin }] = useMutation(REMOVE_ADMIN);
  const removing = removingUser || removingAdmin;

  const users = data?.listUsers ?? [];
  const filtered = searchTerm.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.displayName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.username ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : users;

  async function handleRemove(user: UserRow) {
    setRemoveError(null);
    try {
      if (user.role === "admin") {
        await removeAdmin({ variables: { email: user.email } });
      } else {
        await removeUser({ variables: { email: user.email } });
      }
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
    <div className="admin-page">
      <div className="admin-header">
        <h1 className="admin-title">Admin Dashboard</h1>
        <span className="admin-role-badge admin-role-badge--admin">admin</span>
      </div>

      <section className="admin-section">
        <div className="admin-section-head">
          <h2 className="admin-section-title">User Management</h2>
          <div className="admin-section-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setInviteModal("user")}
            >
              Invite User
            </button>
            <button
              type="button"
              className="btn-primary admin-btn-admin"
              onClick={() => setInviteModal("admin")}
            >
              Invite Admin
            </button>
          </div>
        </div>

        <input
          type="search"
          className="ig-input admin-search"
          placeholder="Search by name, email, or username…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {removeError && (
          <p className="error" role="alert">{removeError}</p>
        )}

        {listLoading && <p className="muted small">Loading users…</p>}
        {listError && (
          <p className="error" role="alert">Failed to load users: {listError.message}</p>
        )}

        {!listLoading && filtered.length === 0 && (
          <p className="muted small">No users found.</p>
        )}

        {filtered.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL;
                  return (
                    <tr key={user.id} className="admin-table-row">
                      <td>{user.displayName || <span className="muted">—</span>}</td>
                      <td className="admin-table-email">{user.email}</td>
                      <td>{user.username ? `@${user.username}` : <span className="muted">—</span>}</td>
                      <td>
                        <span
                          className={`admin-role-badge ${
                            user.role === "admin"
                              ? "admin-role-badge--admin"
                              : "admin-role-badge--user"
                          }`}
                        >
                          {user.role ?? "user"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost admin-remove-btn"
                          disabled={isSystemAdmin || removing}
                          title={
                            isSystemAdmin
                              ? "System admin cannot be removed"
                              : `Remove ${user.role === "admin" ? "admin" : "user"}`
                          }
                          onClick={() => {
                            setRemoveError(null);
                            setConfirmTarget(user);
                          }}
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
            disabled={skip === 0 || listLoading}
            onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
          >
            ← Previous
          </button>
          <span className="muted small">
            Showing {skip + 1}–{skip + users.length}
          </span>
          <button
            type="button"
            className="btn-ghost"
            disabled={users.length < PAGE_SIZE || listLoading}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
          >
            Next →
          </button>
        </div>
      </section>

      {inviteModal && (
        <InviteModal type={inviteModal} onClose={() => setInviteModal(null)} />
      )}

      {confirmTarget && (
        <ConfirmDialog
          message={`Are you sure you want to remove ${confirmTarget.displayName || confirmTarget.email}? This action cannot be undone.`}
          onConfirm={() => void handleRemove(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
          loading={removing}
        />
      )}
    </div>
  );
}
