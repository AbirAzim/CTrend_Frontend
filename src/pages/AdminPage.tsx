import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { NavLink } from "react-router-dom";
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
import {
  CAMPAIGN_WINNERS,
  CREATE_WORLD_CUP_CAMPAIGN_POST,
  MARK_CAMPAIGN_PRIZE_PAID,
  PROCESS_MATCH_RESULT,
  SYNC_WORLD_CUP_FIXTURES,
  WORLD_CUP_FIXTURES,
} from "../graphql/worldcup";
import {
  CAMPAIGNS_ADMIN,
  CREATE_CAMPAIGN,
  TOGGLE_CAMPAIGN,
} from "../graphql/campaigns";

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
                    <div className="admin-action-btns">
                      <NavLink
                        to={`/profile/${user.id}`}
                        className="btn-ghost"
                      >
                        View Profile
                      </NavLink>
                      <button
                        type="button"
                        className="btn-ghost admin-remove-btn"
                        disabled={removing}
                        onClick={() => { setRemoveError(null); setConfirmTarget(user); }}
                      >
                        Remove
                      </button>
                    </div>
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
                        <NavLink
                          to={`/profile/${user.id}`}
                          className="btn-ghost"
                        >
                          View Profile
                        </NavLink>
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

// ─── Campaigns Tab ───────────────────────────────────────────────────────────

type CampaignRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  bannerText: string;
  ctaLabel: string;
  ctaUrl: string;
  isActive: boolean;
  prizePerWinner: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
};

function CampaignsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    bannerText: "",
    ctaLabel: "",
    ctaUrl: "",
    prizePerWinner: 100,
  });
  const [createError, setCreateError] = useState("");

  const { data, loading, refetch } = useQuery<{ campaigns: CampaignRow[] }>(
    CAMPAIGNS_ADMIN,
    { fetchPolicy: "network-only" },
  );

  const [createCampaign, { loading: creating }] = useMutation(CREATE_CAMPAIGN);
  const [toggleCampaign] = useMutation(TOGGLE_CAMPAIGN);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    try {
      await createCampaign({
        variables: {
          input: {
            ...form,
            prizePerWinner: Number(form.prizePerWinner),
          },
        },
      });
      setShowCreate(false);
      setForm({ name: "", slug: "", bannerText: "", ctaLabel: "", ctaUrl: "", prizePerWinner: 100 });
      void refetch();
    } catch (err: unknown) {
      setCreateError(getApolloErrorMessage(err));
    }
  }

  async function handleToggle(id: string, current: boolean) {
    try {
      await toggleCampaign({ variables: { id, isActive: !current } });
      void refetch();
    } catch {
      // silent
    }
  }

  const campaigns = data?.campaigns ?? [];

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">Campaigns</h2>
          <p className="muted small">Promotional campaigns shown as feed banners to all users</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          style={{ background: "var(--ig-border)", borderRadius: 12, padding: 16, marginBottom: 20 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <span>Campaign name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="World Cup Fever 2026"
              />
            </label>
            <label className="field">
              <span>Slug (URL key)</span>
              <input
                required
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="world-cup-2026"
              />
            </label>
            <label className="field" style={{ gridColumn: "1/-1" }}>
              <span>Banner text</span>
              <input
                required
                value={form.bannerText}
                onChange={(e) => setForm((f) => ({ ...f, bannerText: e.target.value }))}
                placeholder="Predict match winners and win 100 BDT!"
              />
            </label>
            <label className="field">
              <span>CTA button label</span>
              <input
                required
                value={form.ctaLabel}
                onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                placeholder="World Cup 2026"
              />
            </label>
            <label className="field">
              <span>CTA URL (frontend route)</span>
              <input
                required
                value={form.ctaUrl}
                onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                placeholder="/world-cup"
              />
            </label>
            <label className="field">
              <span>Prize per winner (BDT)</span>
              <input
                type="number"
                min={1}
                value={form.prizePerWinner}
                onChange={(e) => setForm((f) => ({ ...f, prizePerWinner: Number(e.target.value) }))}
              />
            </label>
          </div>
          {createError && <p className="error" role="alert" style={{ marginTop: 8 }}>{createError}</p>}
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Creating…" : "Create Campaign"}
            </button>
          </div>
        </form>
      )}

      {loading && campaigns.length === 0 && <p className="muted small">Loading…</p>}
      {!loading && campaigns.length === 0 && <p className="muted small">No campaigns yet.</p>}

      {campaigns.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>CTA</th>
                <th>Prize</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="admin-table-row">
                  <td><strong>{c.name}</strong></td>
                  <td className="muted small">{c.slug}</td>
                  <td className="muted small">{c.ctaLabel} → {c.ctaUrl}</td>
                  <td><span className="admin-stat-chip">{c.prizePerWinner} BDT</span></td>
                  <td>
                    <span className={`admin-stat-chip${c.isActive ? " admin-stat-chip--active" : ""}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={c.isActive ? "btn-danger" : "btn-primary"}
                      style={{ fontSize: 13 }}
                      onClick={() => void handleToggle(c.id, c.isActive)}
                    >
                      {c.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── World Cup Tab ────────────────────────────────────────────────────────────

type WcFixture = {
  id: string;
  homeTeam: { name: string | null; shortName: string | null; crest: string | null };
  awayTeam: { name: string | null; shortName: string | null; crest: string | null };
  kickoff: string;
  status: string;
  stage: string;
  group: string | null;
  campaignPostId: string | null;
};

type WcWinner = {
  id: string;
  fixtureId: string;
  postId: string;
  prize: number;
  winningOption: number | null;
  paid: boolean;
  note: string | null;
  createdAt: string;
  user: { id: string; username: string; displayName: string | null; email: string } | null;
};

function WorldCupTab() {
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const { data: fixturesData, loading: fixturesLoading, refetch: refetchFixtures } = useQuery<{
    worldCupFixtures: WcFixture[];
  }>(WORLD_CUP_FIXTURES, { fetchPolicy: "network-only" });

  const { data: winnersData, refetch: refetchWinners } = useQuery<{
    campaignWinners: WcWinner[];
  }>(CAMPAIGN_WINNERS, { fetchPolicy: "network-only" });

  const [syncFixtures, { loading: syncing }] = useMutation(SYNC_WORLD_CUP_FIXTURES);
  const [createPost, { loading: creatingPost }] = useMutation(CREATE_WORLD_CUP_CAMPAIGN_POST);
  const [processResult, { loading: processingResult }] = useMutation(PROCESS_MATCH_RESULT);
  const [markPaid] = useMutation(MARK_CAMPAIGN_PRIZE_PAID);

  async function handleSync() {
    setSyncMsg(null);
    try {
      await syncFixtures();
      setSyncMsg("Fixtures synced successfully.");
      void refetchFixtures();
    } catch (err: unknown) {
      setSyncMsg("Sync failed: " + getApolloErrorMessage(err));
    }
  }

  async function handleCreatePost(fixtureId: string) {
    setActionMsg((prev) => ({ ...prev, [fixtureId]: "Creating…" }));
    try {
      await createPost({ variables: { fixtureId } });
      setActionMsg((prev) => ({ ...prev, [fixtureId]: "Post created!" }));
      void refetchFixtures();
    } catch (err: unknown) {
      setActionMsg((prev) => ({ ...prev, [fixtureId]: getApolloErrorMessage(err) }));
    }
  }

  async function handleProcessResult(fixtureId: string) {
    setActionMsg((prev) => ({ ...prev, [`result-${fixtureId}`]: "Processing…" }));
    try {
      await processResult({ variables: { fixtureId } });
      setActionMsg((prev) => ({ ...prev, [`result-${fixtureId}`]: "Done! Winner drawn." }));
      void refetchWinners();
    } catch (err: unknown) {
      setActionMsg((prev) => ({
        ...prev,
        [`result-${fixtureId}`]: getApolloErrorMessage(err),
      }));
    }
  }

  async function handleMarkPaid(winnerId: string) {
    try {
      await markPaid({ variables: { winnerId } });
      void refetchWinners();
    } catch {
      // silent — admin can retry
    }
  }

  const fixtures = fixturesData?.worldCupFixtures ?? [];
  const winners = winnersData?.campaignWinners ?? [];
  const winnersByFixture = new Map(winners.map((w) => [w.fixtureId, w]));
  const now = new Date();

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">World Cup 2026 Fixtures</h2>
          <p className="muted small">Sync fixtures, create campaign posts, and process results</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleSync()}
          disabled={syncing}
        >
          {syncing ? "Syncing…" : "Sync Fixtures"}
        </button>
      </div>

      {syncMsg && (
        <p className={`muted small${syncMsg.startsWith("Sync failed") ? " error" : ""}`} style={{ marginBottom: 12 }}>
          {syncMsg}
        </p>
      )}

      {fixturesLoading && fixtures.length === 0 && (
        <p className="muted small">Loading fixtures…</p>
      )}
      {fixtures.length === 0 && !fixturesLoading && (
        <p className="muted small">No fixtures synced yet. Click "Sync Fixtures" above.</p>
      )}

      {fixtures.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Match</th>
                  <th style={{ minWidth: 120 }}>Kickoff</th>
                  <th style={{ minWidth: 100 }}>Status</th>
                  <th style={{ minWidth: 130 }}>Campaign Post</th>
                  <th style={{ minWidth: 160 }}>Result / Draw</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f) => {
                  const kickoff = new Date(f.kickoff);
                  const isPast = kickoff <= now;
                  const winner = winnersByFixture.get(f.id);
                  const isLive = f.status === "IN_PLAY" || f.status === "PAUSED";
                  const isFinished = f.status === "FINISHED";
                  const groupLabel = f.group
                    ? f.group.replace("GROUP_", "Group ")
                    : f.stage.replace(/_/g, " ");

                  const statusChipClass = isFinished
                    ? "wc-admin-chip wc-admin-chip--done"
                    : isLive
                      ? "wc-admin-chip wc-admin-chip--live"
                      : "wc-admin-chip";

                  const statusLabel = isLive
                    ? "● Live"
                    : isFinished
                      ? "✓ Finished"
                      : f.status === "POSTPONED"
                        ? "Postponed"
                        : "Scheduled";

                  return (
                    <tr key={f.id} className="admin-table-row">
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span>
                            {f.homeTeam.crest && (
                              <img src={f.homeTeam.crest} alt="" style={{ width: 18, height: 13, objectFit: "contain", marginRight: 5, verticalAlign: "middle" }} />
                            )}
                            <strong>{f.homeTeam.shortName ?? f.homeTeam.name ?? "TBD"}</strong>
                            {" vs "}
                            <strong>{f.awayTeam.shortName ?? f.awayTeam.name ?? "TBD"}</strong>
                            {f.awayTeam.crest && (
                              <img src={f.awayTeam.crest} alt="" style={{ width: 18, height: 13, objectFit: "contain", marginLeft: 5, verticalAlign: "middle" }} />
                            )}
                          </span>
                          <span className="muted" style={{ fontSize: 11 }}>{groupLabel}</span>
                        </div>
                      </td>
                      <td className="muted small">
                        {kickoff.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>
                        <span className={statusChipClass}>{statusLabel}</span>
                      </td>
                      <td>
                        {f.campaignPostId ? (
                          <span className="wc-admin-chip wc-admin-chip--done">✓ Created</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ fontSize: 12, padding: "3px 10px" }}
                              onClick={() => void handleCreatePost(f.id)}
                              disabled={creatingPost}
                            >
                              + Create Post
                            </button>
                            {actionMsg[f.id] && (
                              <span className="muted small">{actionMsg[f.id]}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {winner ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span className="wc-admin-chip wc-admin-chip--done">
                              {winner.user ? `🏆 @${winner.user.username}` : winner.note ?? "No winner"}
                            </span>
                          </div>
                        ) : isPast && f.campaignPostId ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ fontSize: 12, padding: "3px 10px" }}
                              onClick={() => void handleProcessResult(f.id)}
                              disabled={processingResult}
                            >
                              Draw Winner
                            </button>
                            {actionMsg[`result-${f.id}`] && (
                              <span className="muted small">{actionMsg[`result-${f.id}`]}</span>
                            )}
                          </div>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {winners.length > 0 && (
        <>
          <h2 className="admin-section-title" style={{ marginTop: 24 }}>
            Campaign Winners
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Winner</th>
                  <th>Prize</th>
                  <th>Note</th>
                  <th>Date</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w) => (
                  <tr key={w.id} className="admin-table-row">
                    <td>
                      {w.user ? (
                        <span>
                          <strong>@{w.user.username}</strong>
                          <span className="muted small" style={{ marginLeft: 6 }}>
                            {w.user.email}
                          </span>
                        </span>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-stat-chip">{w.prize} BDT</span>
                    </td>
                    <td className="muted small">{w.note ?? "—"}</td>
                    <td className="muted small">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      {w.paid ? (
                        <span className="admin-stat-chip admin-stat-chip--active">Paid</span>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ fontSize: 13 }}
                          onClick={() => void handleMarkPaid(w.id)}
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Admin Page (root) ────────────────────────────────────────────────────────

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "admins" | "campaigns" | "worldcup">("users");

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
        <button
          type="button"
          className={`admin-tab${activeTab === "campaigns" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("campaigns")}
        >
          Campaigns
        </button>
        <button
          type="button"
          className={`admin-tab${activeTab === "worldcup" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("worldcup")}
        >
          🏆 World Cup
        </button>
      </div>

      <div className="admin-section">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "admins" && <AdminsTab />}
        {activeTab === "campaigns" && <CampaignsTab />}
        {activeTab === "worldcup" && <WorldCupTab />}
      </div>
    </div>
  );
}
