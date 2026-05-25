import { useMutation, useQuery } from "@apollo/client";
import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { BulkInviteModal } from "../components/BulkInviteModal";
import {
  CANCEL_INVITATION,
  LIST_INVITATIONS,
  LIST_USERS,
  REMOVE_ADMIN,
  REMOVE_USER,
  RESEND_INVITATION,
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
        <BulkInviteModal
          inviteType="user"
          onClose={() => { setInviteModal(false); void refetch(); }}
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
    variables: { skip, take: PAGE_SIZE, role: "admin" },
    fetchPolicy: "network-only",
  });

  const [removeAdmin, { loading: revokingAdmin }] = useMutation(REMOVE_ADMIN);
  const [removeUser, { loading: deletingUser }] = useMutation(REMOVE_USER);
  const acting = revokingAdmin || deletingUser;

  const admins = data?.listUsers ?? [];
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
        <BulkInviteModal
          inviteType="admin"
          onClose={() => { setInviteModal(false); void refetch(); }}
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

// ─── Invitations Tab ──────────────────────────────────────────────────────────

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy?: { id: string; displayName?: string | null; username?: string | null; email: string; role?: string | null; profileImageUrl?: string | null } | null;
};

type InviterUser = NonNullable<InvitationRow["invitedBy"]>;

function InviterPopover({ user }: { user: InviterUser }) {
  const [open, setOpen] = useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const email = user.email.toLowerCase();
  const name = user.displayName?.trim() || user.username?.trim() || email;
  const isGmail = email.endsWith("@gmail.com");
  const avatarSrc = user.profileImageUrl?.trim() || (isGmail && !imgFailed
    ? `https://www.google.com/s2/photos/profile/${encodeURIComponent(email)}?sz=80`
    : null);
  const initial = name[0]?.toUpperCase() ?? "?";
  const role = user.role?.toLowerCase() ?? "user";
  const isAdmin = role === "admin";

  function openPopover() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <span className="inviter-anchor" onMouseEnter={openPopover} onMouseLeave={scheduleClose}>
      <span className="inviter-name">{name}</span>
      {open && (
        <span className="inviter-popover" onMouseEnter={openPopover} onMouseLeave={scheduleClose}>
          {/* Header strip with avatar */}
          <span className="inviter-pop-header">
            <span className="inviter-pop-avatar">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" onError={() => setImgFailed(true)} />
              ) : (
                initial
              )}
            </span>
            <span className="inviter-pop-title">
              <strong className="inviter-pop-name">{name}</strong>
              {user.username && (
                <span className="inviter-pop-handle">@{user.username}</span>
              )}
            </span>
            <span className={`admin-role-badge ${isAdmin ? "admin-role-badge--admin" : "admin-role-badge--user"}`} style={{ marginLeft: "auto", flexShrink: 0 }}>
              {role}
            </span>
          </span>
          {/* Details */}
          <span className="inviter-pop-details">
            <span className="inviter-pop-row">
              <span className="inviter-pop-icon">✉</span>
              <span className="inviter-pop-val">{user.email}</span>
            </span>
            <span className="inviter-pop-row">
              <span className="inviter-pop-icon">👤</span>
              <span className="inviter-pop-val">{isAdmin ? "Admin user" : "Regular user"}</span>
            </span>
          </span>
          {/* Footer */}
          <span className="inviter-pop-footer">
            <NavLink to={`/profile/${user.id}`} className="inviter-pop-link">
              View full profile →
            </NavLink>
          </span>
        </span>
      )}
    </span>
  );
}

function MultiChip({
  label,
  active,
  onClick,
  variant,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: "admin" | "danger" | "warn";
}) {
  const base = "inv-filter-chip";
  const mod = active
    ? variant === "admin"
      ? " inv-filter-chip--admin inv-filter-chip--on"
      : variant === "danger"
        ? " inv-filter-chip--danger inv-filter-chip--on"
        : variant === "warn"
          ? " inv-filter-chip--warn inv-filter-chip--on"
          : " inv-filter-chip--on"
    : "";
  return (
    <button type="button" className={base + mod} onClick={onClick}>
      {label}
    </button>
  );
}

function InvitationsTab() {
  const [emailSearch, setEmailSearch] = useState("");
  const [inviterSearch, setInviterSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery(LIST_INVITATIONS, {
    variables: {},
    fetchPolicy: "network-only",
  });

  const [cancelInv, { loading: cancelling }] = useMutation(CANCEL_INVITATION, {
    onCompleted: () => { setActionError(null); void refetch(); },
    onError: (e) => setActionError(e.message),
  });

  const [resendInv, { loading: resending }] = useMutation(RESEND_INVITATION, {
    onCompleted: () => { setActionError(null); void refetch(); },
    onError: (e) => setActionError(e.message),
  });

  const acting = cancelling || resending;
  const allInvitations = (data?.listInvitations ?? []) as InvitationRow[];

  function inviterLabel(row: InvitationRow): string {
    const u = row.invitedBy;
    if (!u) return "—";
    return u.displayName?.trim() || u.username?.trim() || u.email;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  function isExpired(iso: string): boolean {
    return new Date(iso).getTime() < Date.now();
  }

  function resolvedStatus(inv: InvitationRow): "accepted" | "expired" | "pending" {
    const s = inv.status.toLowerCase();
    if (s === "accepted") return "accepted";
    if (s === "pending" && isExpired(inv.expiresAt)) return "expired";
    return "pending";
  }

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) { next.delete(value); } else { next.add(value); }
    return next;
  }

  const invitations = allInvitations.filter((inv) => {
    if (emailSearch.trim() && !inv.email.toLowerCase().includes(emailSearch.trim().toLowerCase())) return false;
    if (inviterSearch.trim()) {
      const label = inviterLabel(inv).toLowerCase();
      const inviterEmail = inv.invitedBy?.email.toLowerCase() ?? "";
      if (!label.includes(inviterSearch.trim().toLowerCase()) && !inviterEmail.includes(inviterSearch.trim().toLowerCase())) return false;
    }
    if (roleFilter.size > 0 && !roleFilter.has(inv.role.toLowerCase())) return false;
    if (statusFilter.size > 0 && !statusFilter.has(resolvedStatus(inv))) return false;
    return true;
  });

  const hasFilters =
    emailSearch.trim() ||
    inviterSearch.trim() ||
    roleFilter.size > 0 ||
    statusFilter.size > 0;

  function clearFilters() {
    setEmailSearch("");
    setInviterSearch("");
    setRoleFilter(new Set());
    setStatusFilter(new Set());
  }

  return (
    <div>
      <div className="admin-section-head">
        <div>
          <h2 className="admin-section-title">Invitations</h2>
          <p className="muted small">All sent invitations and their status</p>
        </div>
        {hasFilters && (
          <button type="button" className="btn-ghost" style={{ fontSize: 13 }} onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="inv-filter-bar">
        <div className="inv-filter-row">
          <input
            type="search"
            className="ig-input inv-filter-input"
            placeholder="Search email…"
            value={emailSearch}
            onChange={(e) => setEmailSearch(e.target.value)}
          />
          <input
            type="search"
            className="ig-input inv-filter-input"
            placeholder="Search invited by…"
            value={inviterSearch}
            onChange={(e) => setInviterSearch(e.target.value)}
          />
        </div>
        <div className="inv-filter-row inv-filter-row--chips">
          <span className="inv-filter-label">Role:</span>
          <MultiChip label="User" active={roleFilter.has("user")} onClick={() => setRoleFilter((s) => toggleSet(s, "user"))} />
          <MultiChip label="Admin" active={roleFilter.has("admin")} onClick={() => setRoleFilter((s) => toggleSet(s, "admin"))} variant="admin" />
          <span className="inv-filter-sep" />
          <span className="inv-filter-label">Status:</span>
          <MultiChip label="Pending" active={statusFilter.has("pending")} onClick={() => setStatusFilter((s) => toggleSet(s, "pending"))} />
          <MultiChip label="Accepted" active={statusFilter.has("accepted")} onClick={() => setStatusFilter((s) => toggleSet(s, "accepted"))} variant="admin" />
          <MultiChip label="Expired" active={statusFilter.has("expired")} onClick={() => setStatusFilter((s) => toggleSet(s, "expired"))} variant="warn" />
        </div>
      </div>

      {actionError && <p className="error" role="alert">{actionError}</p>}
      {loading && <p className="muted small">Loading invitations…</p>}
      {error && <p className="error">Failed to load: {error.message}</p>}
      {!loading && invitations.length === 0 && (
        <p className="muted small">{hasFilters ? "No invitations match your filters." : "No invitations found."}</p>
      )}

      {invitations.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Invited by</th>
                <th>Sent</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => {
                const status = resolvedStatus(inv);
                const isPending = status === "pending";
                const isAccepted = status === "accepted";
                const expired = status === "expired";
                return (
                  <tr key={inv.id} className="admin-table-row">
                    <td className="admin-table-email">{inv.email}</td>
                    <td>
                      <span className={`admin-role-badge ${inv.role === "ADMIN" || inv.role === "admin" ? "admin-role-badge--admin" : "admin-role-badge--user"}`}>
                        {inv.role.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      {inv.invitedBy
                        ? <InviterPopover user={inv.invitedBy} />
                        : <span className="muted small">—</span>}
                    </td>
                    <td>{formatDate(inv.createdAt)}</td>
                    <td style={{ color: expired ? "#dc2626" : undefined }}>
                      {formatDate(inv.expiresAt)}
                      {expired && <span style={{ marginLeft: 4, fontSize: "0.75rem" }}>(expired)</span>}
                    </td>
                    <td>
                      <span className={`wc-admin-chip wc-admin-chip--${isAccepted ? "done" : expired ? "live" : "sched"}`}>
                        {isAccepted ? "Accepted" : expired ? "Expired" : "Pending"}
                      </span>
                    </td>
                    <td>
                      <div className="admin-action-btns">
                        {isPending && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={acting}
                            onClick={() => void resendInv({ variables: { id: inv.id } })}
                          >
                            Resend
                          </button>
                        )}
                        {isPending && (
                          <button
                            type="button"
                            className="btn-ghost admin-remove-btn"
                            disabled={acting}
                            onClick={() => void cancelInv({ variables: { id: inv.id } })}
                          >
                            Cancel
                          </button>
                        )}
                        {(isAccepted || expired) && (
                          <span className="muted small">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Admin Page (root) ────────────────────────────────────────────────────────

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "admins" | "invitations" | "campaigns" | "worldcup">("users");

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
          className={`admin-tab${activeTab === "invitations" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("invitations")}
        >
          Invitations
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
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "campaigns" && <CampaignsTab />}
        {activeTab === "worldcup" && <WorldCupTab />}
      </div>
    </div>
  );
}
