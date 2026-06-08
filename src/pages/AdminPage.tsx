import { useMutation, useQuery } from "@apollo/client";
import React, { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { BulkInviteModal } from "../components/BulkInviteModal";
import { EditPostModal } from "../components/EditPostModal";
import { AdminTabNav, type AdminTabId } from "../components/admin/AdminTabNav";
import { AdminMessagesTab } from "./AdminMessagesTab";
import { AdminReportedTab } from "./AdminReportedTab";
import {
  CANCEL_INVITATION,
  CREATE_CATEGORY,
  DELETE_CATEGORY,
  LIST_INVITATIONS,
  ADMIN_PLATFORM_POSTS,
  ADMIN_PLATFORM_POSTS_COUNT,
  LIST_USERS,
  LIST_USERS_COUNT,
  REMOVE_ADMIN,
  REMOVE_USER,
  RESEND_INVITATION,
  UPDATE_CATEGORY,
  PLATFORM_SETTINGS,
  SET_ALLOW_USER_GLOBAL_POSTS,
} from "../graphql/admin";
import { CATEGORIES, DELETE_POST } from "../graphql/feed";
import { USER_POSTS } from "../graphql/profile";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { categoryColorHex } from "../lib/categoryColor";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
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
  UPDATE_CAMPAIGN,
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
  emailVerified?: boolean | null;
  createdAt?: string | null;
};

type UserSearchBy = "all" | "email" | "name" | "username";
type UserStatusFilter = "all" | "verified" | "unverified";
type UserSortBy = "joined" | "name";
type UserSortOrder = "asc" | "desc";

function formatJoinedAt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function UserStatusBadge({ user }: { user: UserRow }) {
  const verified = Boolean(user.emailVerified);
  return (
    <span className={`admin-user-status admin-user-status--${verified ? "verified" : "unverified"}`}>
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}

function MessageIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function AdminSearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`admin-toolbar-search-wrap${className ? ` ${className}` : ""}`}>
      <span className="admin-toolbar-search-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="admin-toolbar-input admin-toolbar-search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function AdminToolbarSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="admin-toolbar-field">
      <span className="admin-toolbar-label">{label}</span>
      <select
        className="admin-toolbar-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function AdminSectionHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="admin-section-head">
      <div>
        <h2 className="admin-section-title">{title}</h2>
        <p className="muted small">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function AdminCtaButton({
  children,
  onClick,
  disabled,
  variant = "default",
  icon = "+",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "admin";
  icon?: string;
}) {
  return (
    <button
      type="button"
      className={`admin-btn-cta${variant === "admin" ? " admin-btn-cta--admin" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="admin-btn-cta-icon" aria-hidden>{icon}</span>
      {children}
    </button>
  );
}

function AdminActionsCell({
  message,
  children,
}: {
  message?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <td className="admin-table-actions" data-label="Actions">
      <div className="admin-action-stack">
        {message ? <div className="admin-action-msg-row">{message}</div> : null}
        <div className="admin-action-links-row">{children}</div>
      </div>
    </td>
  );
}

function AdminPaginationBar({
  skip,
  total,
  shown,
  loading,
  onPrev,
  onNext,
}: {
  skip: number;
  total: number;
  shown: number;
  loading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="admin-pagination">
      <button
        type="button"
        className="admin-page-btn"
        disabled={skip === 0 || loading}
        onClick={onPrev}
      >
        ← Previous
      </button>
      <span className="admin-pagination-meta">
        Showing {total === 0 ? 0 : skip + 1}–{Math.min(skip + shown, total)} of {total}
      </span>
      <button
        type="button"
        className="admin-page-btn"
        disabled={skip + shown >= total || loading}
        onClick={onNext}
      >
        Next →
      </button>
    </div>
  );
}

function AdminUserMessageButton({
  userId,
  userLabel,
  onCompose,
}: {
  userId: string;
  userLabel: string;
  onCompose: (userId: string) => void;
}) {
  return (
    <div className="admin-msg-wrap">
      <button
        type="button"
        className="admin-icon-btn admin-icon-btn--message"
        title={`Send moderator message to ${userLabel}`}
        aria-label={`Send moderator message to ${userLabel}`}
        onClick={() => onCompose(userId)}
      >
        <MessageIcon size={16} />
      </button>
    </div>
  );
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

type AdminPerson = {
  id: string;
  displayName?: string | null;
  username: string;
  email?: string | null;
  profileImageUrl?: string | null;
};

function adminPersonAvatarUrl(person: AdminPerson): string | null {
  const normalized = normalizeProfileImageUrl(person.profileImageUrl);
  if (normalized) return normalized;
  const email = person.email?.trim().toLowerCase();
  if (email?.endsWith("@gmail.com")) {
    return `https://www.google.com/s2/photos/profile/${encodeURIComponent(email)}?sz=64`;
  }
  return null;
}

function AdminPersonLink({
  person,
  adminStyle = false,
  compact = false,
}: {
  person: AdminPerson;
  adminStyle?: boolean;
  compact?: boolean;
}) {
  const label = person.displayName?.trim() || person.username;
  const src = adminPersonAvatarUrl(person);
  const initials = (label || "?")[0]!.toUpperCase();
  const [failed, setFailed] = useState(false);

  return (
    <NavLink
      to={`/profile/${person.id}`}
      className={`admin-person-link${compact ? " admin-person-link--compact" : ""}`}
      onClick={(e) => e.stopPropagation()}
      title={`View profile: ${label}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className={`admin-user-avatar admin-user-avatar--img${adminStyle ? " admin-user-avatar--admin" : ""}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={`admin-user-avatar${adminStyle ? " admin-user-avatar--admin" : ""}`}>
          {initials}
        </span>
      )}
      <span className="admin-person-link-label">{label}</span>
    </NavLink>
  );
}

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

function UsersTab({ onComposeMessage }: { onComposeMessage: (userId: string) => void }) {
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchBy, setSearchBy] = useState<UserSearchBy>("all");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [sortBy, setSortBy] = useState<UserSortBy>("joined");
  const [sortOrder, setSortOrder] = useState<UserSortOrder>("desc");
  const [confirmTarget, setConfirmTarget] = useState<UserRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);

  const listVariables = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      role: "user",
      search: searchTerm.trim() || undefined,
      searchBy: searchBy === "all" ? undefined : searchBy,
      status: status === "all" ? undefined : status,
      sortBy,
      sortOrder,
    }),
    [skip, searchTerm, searchBy, status, sortBy, sortOrder],
  );

  const countVariables = useMemo(
    () => ({
      role: "user",
      search: searchTerm.trim() || undefined,
      searchBy: searchBy === "all" ? undefined : searchBy,
      status: status === "all" ? undefined : status,
    }),
    [searchTerm, searchBy, status],
  );

  useEffect(() => {
    setSkip(0);
  }, [searchTerm, searchBy, status, sortBy, sortOrder]);

  const { data, loading, error, refetch } = useQuery<{ listUsers: UserRow[] }>(LIST_USERS, {
    variables: listVariables,
    fetchPolicy: "network-only",
  });

  const { data: countData, refetch: refetchCount } = useQuery<{ listUsersCount: number }>(
    LIST_USERS_COUNT,
    { variables: countVariables, fetchPolicy: "network-only" },
  );

  const [removeUser, { loading: removing }] = useMutation(REMOVE_USER);

  const users = data?.listUsers ?? [];
  const totalCount = countData?.listUsersCount ?? 0;

  async function handleRemove(user: UserRow) {
    setRemoveError(null);
    try {
      await removeUser({ variables: { email: user.email } });
      setConfirmTarget(null);
      void refetch();
      void refetchCount();
    } catch (err: unknown) {
      setRemoveError(getApolloErrorMessage(err));
      setConfirmTarget(null);
    }
  }

  return (
    <div>
      <AdminSectionHead
        title="All Users"
        subtitle="Regular users on the platform"
        action={<AdminCtaButton onClick={() => setInviteModal(true)}>Invite User</AdminCtaButton>}
      />

      <div className="admin-toolbar">
        <AdminSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search users…"
        />
        <div className="admin-toolbar-controls">
          <AdminToolbarSelect label="Search in" value={searchBy} onChange={(v) => setSearchBy(v as UserSearchBy)}>
            <option value="all">All fields</option>
            <option value="name">Display name</option>
            <option value="email">Email</option>
            <option value="username">Username</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Status" value={status} onChange={(v) => setStatus(v as UserStatusFilter)}>
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Sort by" value={sortBy} onChange={(v) => setSortBy(v as UserSortBy)}>
            <option value="joined">Joined date</option>
            <option value="name">Name</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Order" value={sortOrder} onChange={(v) => setSortOrder(v as UserSortOrder)}>
            <option value="desc">{sortBy === "name" ? "Z → A" : "Newest first"}</option>
            <option value="asc">{sortBy === "name" ? "A → Z" : "Oldest first"}</option>
          </AdminToolbarSelect>
          {(searchTerm || searchBy !== "all" || status !== "all" || sortBy !== "joined" || sortOrder !== "desc") ? (
            <button
              type="button"
              className="admin-toolbar-reset"
              onClick={() => {
                setSearchTerm("");
                setSearchBy("all");
                setStatus("all");
                setSortBy("joined");
                setSortOrder("desc");
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {removeError && <p className="error" role="alert">{removeError}</p>}
      {loading && <p className="muted small">Loading users…</p>}
      {error && <p className="error">Failed to load users: {error.message}</p>}

      {!loading && users.length === 0 && !error && (
        <p className="muted small">No users found.</p>
      )}

      {users.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Roles</th>
                <th>Engagement</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="admin-table-row">
                  <td data-label="Name">
                    <div className="admin-user-cell">
                      <AdminAvatar user={user} />
                      <span>{user.displayName || user.username || <span className="muted">No name</span>}</span>
                    </div>
                  </td>
                  <td className="admin-table-email" data-label="Email">{user.email}</td>
                  <td data-label="Status"><UserStatusBadge user={user} /></td>
                  <td className="admin-table-joined" data-label="Joined">
                    <span title={user.createdAt ?? undefined}>{formatJoinedAt(user.createdAt)}</span>
                    {user.createdAt ? (
                      <span className="muted small admin-joined-relative">
                        {formatRelativeTime(user.createdAt)}
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Roles"><RoleBadges user={user} /></td>
                  <td data-label="Engagement"><UserStats userId={user.id} /></td>
                  <AdminActionsCell
                    message={
                      <AdminUserMessageButton
                        userId={user.id}
                        userLabel={user.displayName || user.username || user.email}
                        onCompose={onComposeMessage}
                      />
                    }
                  >
                    <NavLink
                      to={`/profile/${user.id}`}
                      className="admin-action-link"
                    >
                      View Profile
                    </NavLink>
                    <button
                      type="button"
                      className="admin-action-link admin-action-link--danger"
                      disabled={removing}
                      onClick={() => { setRemoveError(null); setConfirmTarget(user); }}
                    >
                      Remove
                    </button>
                  </AdminActionsCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPaginationBar
        skip={skip}
        total={totalCount}
        shown={users.length}
        loading={loading}
        onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        onNext={() => setSkip((s) => s + PAGE_SIZE)}
      />

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

function AdminsTab({ onComposeMessage }: { onComposeMessage: (userId: string) => void }) {
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchBy, setSearchBy] = useState<UserSearchBy>("all");
  const [status, setStatus] = useState<UserStatusFilter>("all");
  const [sortBy, setSortBy] = useState<UserSortBy>("joined");
  const [sortOrder, setSortOrder] = useState<UserSortOrder>("desc");
  const [confirmTarget, setConfirmTarget] = useState<AdminConfirmTarget | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);

  const listVariables = useMemo(
    () => ({
      skip,
      take: PAGE_SIZE,
      role: "admin",
      search: searchTerm.trim() || undefined,
      searchBy: searchBy === "all" ? undefined : searchBy,
      status: status === "all" ? undefined : status,
      sortBy,
      sortOrder,
    }),
    [skip, searchTerm, searchBy, status, sortBy, sortOrder],
  );

  const countVariables = useMemo(
    () => ({
      role: "admin",
      search: searchTerm.trim() || undefined,
      searchBy: searchBy === "all" ? undefined : searchBy,
      status: status === "all" ? undefined : status,
    }),
    [searchTerm, searchBy, status],
  );

  useEffect(() => {
    setSkip(0);
  }, [searchTerm, searchBy, status, sortBy, sortOrder]);

  const { data, loading, error, refetch } = useQuery<{ listUsers: UserRow[] }>(LIST_USERS, {
    variables: listVariables,
    fetchPolicy: "network-only",
  });
  const { data: countData, refetch: refetchCount } = useQuery<{ listUsersCount: number }>(
    LIST_USERS_COUNT,
    { variables: countVariables, fetchPolicy: "network-only" },
  );

  const [removeAdmin, { loading: revokingAdmin }] = useMutation(REMOVE_ADMIN);
  const [removeUser, { loading: deletingUser }] = useMutation(REMOVE_USER);
  const acting = revokingAdmin || deletingUser;

  const admins = data?.listUsers ?? [];
  const totalAdmins = countData?.listUsersCount ?? 0;

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
      void refetchCount();
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
      <AdminSectionHead
        title="Admin Management"
        subtitle="Manage who has admin access to Ke Jitbe"
        action={
          <AdminCtaButton variant="admin" onClick={() => setInviteModal(true)}>
            Invite / Promote Admin
          </AdminCtaButton>
        }
      />

      <div className="admin-toolbar">
        <AdminSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search admins…"
        />
        <div className="admin-toolbar-controls">
          <AdminToolbarSelect label="Search in" value={searchBy} onChange={(v) => setSearchBy(v as UserSearchBy)}>
            <option value="all">All fields</option>
            <option value="name">Display name</option>
            <option value="email">Email</option>
            <option value="username">Username</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Status" value={status} onChange={(v) => setStatus(v as UserStatusFilter)}>
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Sort by" value={sortBy} onChange={(v) => setSortBy(v as UserSortBy)}>
            <option value="joined">Joined date</option>
            <option value="name">Name</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect label="Order" value={sortOrder} onChange={(v) => setSortOrder(v as UserSortOrder)}>
            <option value="desc">{sortBy === "name" ? "Z → A" : "Newest first"}</option>
            <option value="asc">{sortBy === "name" ? "A → Z" : "Oldest first"}</option>
          </AdminToolbarSelect>
          {(searchTerm || searchBy !== "all" || status !== "all" || sortBy !== "joined" || sortOrder !== "desc") ? (
            <button
              type="button"
              className="admin-toolbar-reset"
              onClick={() => {
                setSearchTerm("");
                setSearchBy("all");
                setStatus("all");
                setSortBy("joined");
                setSortOrder("desc");
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {removeError && <p className="error" role="alert">{removeError}</p>}
      {loading && <p className="muted small">Loading admins…</p>}
      {error && <p className="error">Failed to load admins: {error.message}</p>}
      {!loading && admins.length === 0 && !error && (
        <p className="muted small">No admins found.</p>
      )}

      {admins.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Roles</th>
                <th>Engagement</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((user) => {
                const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL;
                return (
                  <tr key={user.id} className="admin-table-row">
                    <td data-label="Name">
                      <div className="admin-user-cell">
                        <AdminAvatar user={user} adminStyle />
                        <span>{user.displayName || <span className="muted">No name</span>}</span>
                      </div>
                    </td>
                    <td className="admin-table-email" data-label="Email">{user.email}</td>
                    <td data-label="Status"><UserStatusBadge user={user} /></td>
                    <td className="admin-table-joined" data-label="Joined">
                      <span title={user.createdAt ?? undefined}>{formatJoinedAt(user.createdAt)}</span>
                      {user.createdAt ? (
                        <span className="muted small admin-joined-relative">
                          {formatRelativeTime(user.createdAt)}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Roles"><RoleBadges user={user} /></td>
                    <td data-label="Engagement"><UserStats userId={user.id} /></td>
                    <AdminActionsCell
                      message={
                        <AdminUserMessageButton
                          userId={user.id}
                          userLabel={user.displayName || user.username || user.email}
                          onCompose={onComposeMessage}
                        />
                      }
                    >
                      <NavLink to={`/profile/${user.id}`} className="admin-action-link">
                        View Profile
                      </NavLink>
                      <button
                        type="button"
                        className="admin-action-link admin-action-link--warn"
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
                        className="admin-action-link admin-action-link--danger"
                        disabled={isSystemAdmin || acting}
                        title={isSystemAdmin ? "System admin cannot be modified" : "Remove account entirely"}
                        onClick={() => {
                          setRemoveError(null);
                          setConfirmTarget({ user, action: "remove-account" });
                        }}
                      >
                        Remove Account
                      </button>
                    </AdminActionsCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminPaginationBar
        skip={skip}
        total={totalAdmins}
        shown={admins.length}
        loading={loading}
        onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        onNext={() => setSkip((s) => s + PAGE_SIZE)}
      />

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
  isDefault?: boolean | null;
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
  const [updateCampaign, { loading: updatingCampaign }] = useMutation(UPDATE_CAMPAIGN);

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

  async function handleMakeDefault(id: string) {
    try {
      await updateCampaign({ variables: { id, input: { isDefault: true } } });
      void refetch();
    } catch {
      // silent
    }
  }

  const campaigns = data?.campaigns ?? [];

  return (
    <div>
      <AdminSectionHead
        title="Campaigns"
        subtitle="Promotional campaigns shown as feed banners to all users"
        action={
          <AdminCtaButton onClick={() => setShowCreate((v) => !v)} icon={showCreate ? "×" : "+"}>
            {showCreate ? "Cancel" : "New Campaign"}
          </AdminCtaButton>
        }
      />

      {showCreate && (
        <form className="admin-form-panel" onSubmit={(e) => void handleCreate(e)}>
          <div className="admin-form-grid">
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
          {createError && <p className="error" role="alert">{createError}</p>}
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn-cta" disabled={creating}>
              {creating ? "Creating…" : "Create Campaign"}
            </button>
          </div>
        </form>
      )}

      {loading && campaigns.length === 0 && <p className="muted small">Loading…</p>}
      {!loading && campaigns.length === 0 && <p className="muted small">No campaigns yet.</p>}

      {campaigns.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>CTA</th>
                <th>Prize</th>
                <th>Status</th>
                <th>Default</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="admin-table-row">
                  <td data-label="Name"><strong>{c.name}</strong></td>
                  <td className="muted small" data-label="Slug">{c.slug}</td>
                  <td className="muted small" data-label="CTA">{c.ctaLabel} → {c.ctaUrl}</td>
                  <td data-label="Prize"><span className="admin-stat-chip">{c.prizePerWinner} BDT</span></td>
                  <td data-label="Status">
                    <span className={`admin-stat-chip${c.isActive ? " admin-stat-chip--active" : ""}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td data-label="Default">
                    {c.isDefault ? (
                      <span className="admin-stat-chip admin-stat-chip--active">Default</span>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                  <AdminActionsCell>
                    {!c.isDefault ? (
                      <button
                        type="button"
                        className="admin-action-link admin-action-link--success"
                        onClick={() => void handleMakeDefault(c.id)}
                        disabled={!c.isActive || updatingCampaign}
                        title={!c.isActive ? "Activate campaign first to make it default" : "Make this campaign default"}
                      >
                        Make Default
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`admin-action-link${c.isActive ? " admin-action-link--danger" : " admin-action-link--success"}`}
                      onClick={() => void handleToggle(c.id, c.isActive)}
                    >
                      {c.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </AdminActionsCell>
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
      <AdminSectionHead
        title="World Cup 2026 Fixtures"
        subtitle="Sync fixtures, create campaign posts, and process results"
        action={
          <AdminCtaButton onClick={() => void handleSync()} disabled={syncing} icon="↻">
            {syncing ? "Syncing…" : "Sync Fixtures"}
          </AdminCtaButton>
        }
      />

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
            <table className="admin-table admin-table--stack">
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
                      <td data-label="Match">
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
                      <td className="muted small" data-label="Kickoff">
                        {kickoff.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td data-label="Status">
                        <span className={statusChipClass}>{statusLabel}</span>
                      </td>
                      <td data-label="Campaign post">
                        {f.campaignPostId ? (
                          <span className="wc-admin-chip wc-admin-chip--done">✓ Created</span>
                        ) : (
                          <div className="admin-action-links">
                            <button
                              type="button"
                              className="admin-action-link"
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
                      <td data-label="Result">
                        {winner ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span className="wc-admin-chip wc-admin-chip--done">
                              {winner.user ? `🏆 @${winner.user.username}` : winner.note ?? "No winner"}
                            </span>
                          </div>
                        ) : isPast && f.campaignPostId ? (
                          <div className="admin-action-links">
                            <button
                              type="button"
                              className="admin-action-link admin-action-link--success"
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
            <table className="admin-table admin-table--stack">
              <thead>
                <tr>
                  <th>Winner</th>
                  <th>Prize</th>
                  <th>Note</th>
                  <th>Date</th>
                  <th className="admin-table-actions">Paid</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w) => (
                  <tr key={w.id} className="admin-table-row">
                    <td data-label="Winner">
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
                    <td data-label="Prize">
                      <span className="admin-stat-chip">{w.prize} BDT</span>
                    </td>
                    <td className="muted small" data-label="Note">{w.note ?? "—"}</td>
                    <td className="muted small" data-label="Date">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>
                    <AdminActionsCell>
                      {w.paid ? (
                        <span className="admin-stat-chip admin-stat-chip--active">Paid</span>
                      ) : (
                        <button
                          type="button"
                          className="admin-action-link admin-action-link--success"
                          onClick={() => void handleMarkPaid(w.id)}
                        >
                          Mark Paid
                        </button>
                      )}
                    </AdminActionsCell>
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
      <AdminSectionHead
        title="Invitations"
        subtitle="All sent invitations and their status"
        action={
          hasFilters ? (
            <button type="button" className="admin-toolbar-reset" onClick={clearFilters}>
              Clear filters
            </button>
          ) : undefined
        }
      />

      <div className="admin-toolbar">
        <div className="admin-toolbar-controls admin-toolbar-controls--wide">
          <AdminSearchInput
            value={emailSearch}
            onChange={setEmailSearch}
            placeholder="Search email…"
            className="admin-toolbar-search--half"
          />
          <AdminSearchInput
            value={inviterSearch}
            onChange={setInviterSearch}
            placeholder="Search invited by…"
            className="admin-toolbar-search--half"
          />
        </div>
        <div className="admin-toolbar-controls admin-toolbar-controls--chips">
          <span className="admin-toolbar-label admin-toolbar-label--inline">Role</span>
          <MultiChip label="User" active={roleFilter.has("user")} onClick={() => setRoleFilter((s) => toggleSet(s, "user"))} />
          <MultiChip label="Admin" active={roleFilter.has("admin")} onClick={() => setRoleFilter((s) => toggleSet(s, "admin"))} variant="admin" />
          <span className="admin-toolbar-sep" aria-hidden />
          <span className="admin-toolbar-label admin-toolbar-label--inline">Status</span>
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
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Invited by</th>
                <th>Sent</th>
                <th>Expires</th>
                <th>Status</th>
                <th className="admin-table-actions">Actions</th>
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
                    <td className="admin-table-email" data-label="Email">{inv.email}</td>
                    <td data-label="Role">
                      <span className={`admin-role-badge ${inv.role === "ADMIN" || inv.role === "admin" ? "admin-role-badge--admin" : "admin-role-badge--user"}`}>
                        {inv.role.toLowerCase()}
                      </span>
                    </td>
                    <td data-label="Invited by">
                      {inv.invitedBy
                        ? <InviterPopover user={inv.invitedBy} />
                        : <span className="muted small">—</span>}
                    </td>
                    <td data-label="Sent">{formatDate(inv.createdAt)}</td>
                    <td data-label="Expires" style={{ color: expired ? "#dc2626" : undefined }}>
                      {formatDate(inv.expiresAt)}
                      {expired && <span style={{ marginLeft: 4, fontSize: "0.75rem" }}>(expired)</span>}
                    </td>
                    <td data-label="Status">
                      <span className={`wc-admin-chip wc-admin-chip--${isAccepted ? "done" : expired ? "live" : "sched"}`}>
                        {isAccepted ? "Accepted" : expired ? "Expired" : "Pending"}
                      </span>
                    </td>
                    <AdminActionsCell>
                      {isPending && (
                        <button
                          type="button"
                          className="admin-action-link"
                          disabled={acting}
                          onClick={() => void resendInv({ variables: { id: inv.id } })}
                        >
                          Resend
                        </button>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          className="admin-action-link admin-action-link--danger"
                          disabled={acting}
                          onClick={() => void cancelInv({ variables: { id: inv.id } })}
                        >
                          Cancel
                        </button>
                      )}
                      {(isAccepted || expired) && (
                        <span className="muted small">—</span>
                      )}
                    </AdminActionsCell>
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

// ─── Categories Tab ──────────────────────────────────────────────────────────

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
};

function CategoriesTab() {
  const { data, loading, error, refetch } = useQuery(CATEGORIES, {
    fetchPolicy: "cache-and-network",
  });
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [pageError, setPageError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingColorId, setSavingColorId] = useState<string | null>(null);
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});

  const [createMut, { loading: creating }] = useMutation(CREATE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES }],
  });
  const [updateMut, { loading: updating }] = useMutation(UPDATE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES }],
  });
  const [deleteMut] = useMutation(DELETE_CATEGORY, {
    refetchQueries: [{ query: CATEGORIES }],
  });

  const categories = (data?.categories ?? []) as CategoryRow[];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setPageError(null);
    const name = newName.trim();
    if (!name) return;
    try {
      await createMut({ variables: { name } });
      setNewName("");
      void refetch();
    } catch (err) {
      setPageError(getApolloErrorMessage(err));
    }
  }

  async function handleUpdate() {
    if (!editing) return;
    setPageError(null);
    const name = editName.trim();
    if (!name) return;
    try {
      await updateMut({ variables: { id: editing.id, name } });
      setEditing(null);
      setEditName("");
      void refetch();
    } catch (err) {
      setPageError(getApolloErrorMessage(err));
    }
  }

  async function handleColorChange(cat: CategoryRow, color: string) {
    // color = "" clears the admin color (back to the derived default).
    setPageError(null);
    setSavingColorId(cat.id);
    try {
      await updateMut({ variables: { id: cat.id, name: cat.name, color } });
      void refetch();
    } catch (err) {
      setPageError(getApolloErrorMessage(err));
    }
    setSavingColorId(null);
  }

  async function handleDelete(cat: CategoryRow) {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    setPageError(null);
    setDeletingId(cat.id);
    try {
      await deleteMut({ variables: { id: cat.id } });
      void refetch();
    } catch (err) {
      setPageError(getApolloErrorMessage(err));
    }
    setDeletingId(null);
  }

  return (
    <div>
      <AdminSectionHead
        title="Post Categories"
        subtitle="Categories users pick when creating compares"
      />

      <form className="admin-toolbar admin-toolbar--inline" onSubmit={(e) => void handleCreate(e)}>
        <div className="admin-toolbar-search-wrap admin-toolbar-search--grow">
          <span className="admin-toolbar-search-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            className="admin-toolbar-input admin-toolbar-search"
            placeholder="New category name (e.g. Music)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
          />
        </div>
        <button type="submit" className="admin-btn-cta" disabled={creating || !newName.trim()}>
          <span className="admin-btn-cta-icon" aria-hidden>+</span>
          {creating ? "Adding…" : "Add Category"}
        </button>
      </form>

      {pageError && <p className="error" role="alert">{pageError}</p>}
      {loading && !data && <p className="muted small">Loading categories…</p>}
      {error && <p className="error">Failed to load: {error.message}</p>}

      {categories.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--stack">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Color</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const isEditing = editing?.id === cat.id;
                return (
                  <tr key={cat.id} className="admin-table-row">
                    <td data-label="Name">
                      {isEditing ? (
                        <input
                          type="text"
                          className="admin-toolbar-input admin-toolbar-input--plain"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={60}
                          autoFocus
                        />
                      ) : (
                        <strong>{cat.name}</strong>
                      )}
                    </td>
                    <td className="admin-table-email" data-label="Slug">{cat.slug}</td>
                    <td data-label="Color">
                      <div className="admin-cat-color">
                        <input
                          type="color"
                          className="admin-cat-color-input"
                          aria-label={`Accent color for ${cat.name}`}
                          title="Pick category color"
                          value={
                            colorDrafts[cat.id] ??
                            categoryColorHex(cat) ??
                            "#888888"
                          }
                          disabled={savingColorId === cat.id}
                          onChange={(e) =>
                            setColorDrafts((d) => ({ ...d, [cat.id]: e.target.value }))
                          }
                          onBlur={(e) => {
                            const next = e.target.value.toLowerCase();
                            if (next !== (cat.color ?? "").toLowerCase()) {
                              void handleColorChange(cat, next);
                            }
                          }}
                        />
                        {cat.color ? (
                          <button
                            type="button"
                            className="admin-action-link"
                            disabled={savingColorId === cat.id}
                            onClick={() => {
                              setColorDrafts((d) => {
                                const rest = { ...d };
                                delete rest[cat.id];
                                return rest;
                              });
                              void handleColorChange(cat, "");
                            }}
                          >
                            Reset
                          </button>
                        ) : (
                          <span className="muted small">auto</span>
                        )}
                      </div>
                    </td>
                    <AdminActionsCell>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="admin-action-link admin-action-link--success"
                            disabled={updating}
                            onClick={() => void handleUpdate()}
                          >
                            {updating ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="admin-action-link"
                            onClick={() => { setEditing(null); setEditName(""); }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-action-link"
                            onClick={() => { setEditing(cat); setEditName(cat.name); }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-action-link admin-action-link--danger"
                            disabled={deletingId === cat.id}
                            onClick={() => void handleDelete(cat)}
                          >
                            {deletingId === cat.id ? "…" : "Delete"}
                          </button>
                        </>
                      )}
                    </AdminActionsCell>
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

// ─── Post Management Tab (platform-wide / SYSTEM posts) ─────────────────────

type PlatformPostEditor = AdminPerson;

type PlatformPostRow = {
  id: string;
  type?: string | null;
  format?: string | null;
  caption?: string | null;
  imageUrls?: string[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  scheduledAt?: string | null;
  votingEndsAt?: string | null;
  endingSoonLeadMinutes?: number | null;
  isVotingOpen?: boolean | null;
  isPrizeClaimed?: boolean | null;
  votePrizeClaimedAt?: string | null;
  canClaimPrize?: boolean | null;
  commentCount?: number | null;
  hypeCount?: number | null;
  saveCount?: number | null;
  totalVotes?: number | null;
  upvoteCount?: number | null;
  downvoteCount?: number | null;
  authorId?: string | null;
  authorDisplayName?: string | null;
  authorUsername?: string | null;
  authorEmail?: string | null;
  authorProfileImageUrl?: string | null;
  author?: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    email?: string | null;
    profileImageUrl?: string | null;
  } | null;
  category?: { id: string; name: string; slug?: string | null } | null;
  campaign?: { id: string; name: string; slug?: string | null } | null;
  options?: Array<{
    label: string;
    imageUrl?: string | null;
    imageFocalX?: number | null;
    imageFocalY?: number | null;
  }> | null;
  voteWinner?: {
    selectedOptionIndex?: number | null;
    pickedAt?: string | null;
    user?: {
      id: string;
      username?: string | null;
      displayName?: string | null;
      profileImageUrl?: string | null;
    } | null;
  } | null;
  editedBy?: PlatformPostEditor[] | null;
  lastEditedBy?: PlatformPostEditor | null;
};

type PostStatusFilter = "all" | "PUBLISHED" | "SCHEDULED";
type PostVotingFilter = "all" | "live" | "closed";
type PostSortBy = "createdAt" | "votes" | "caption" | "updatedAt";
type PostSortOrder = "asc" | "desc";

type PostScope = "admin" | "user" | "user-all";

function PostsTab() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<PostScope>("admin");
  const [skip, setSkip] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PostStatusFilter>("all");
  const [votingFilter, setVotingFilter] = useState<PostVotingFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<PostSortBy>("createdAt");
  const [sortOrder, setSortOrder] = useState<PostSortOrder>("desc");
  const [editingPost, setEditingPost] = useState<PlatformPostRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformPostRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: catsData } = useQuery<{ categories: Array<{ id: string; name: string }> }>(
    CATEGORIES,
  );
  const categories = catsData?.categories ?? [];

  const listFilter = useMemo(
    () => ({
      search: searchTerm.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      categoryId: categoryFilter === "all" ? undefined : categoryFilter,
      votingFilter: votingFilter === "all" ? undefined : votingFilter,
      scope,
      sortBy,
      sortOrder,
    }),
    [searchTerm, statusFilter, categoryFilter, votingFilter, scope, sortBy, sortOrder],
  );

  const countFilter = useMemo(
    () => ({
      search: listFilter.search,
      status: listFilter.status,
      categoryId: listFilter.categoryId,
      votingFilter: listFilter.votingFilter,
      scope: listFilter.scope,
    }),
    [listFilter],
  );

  useEffect(() => {
    setSkip(0);
  }, [searchTerm, statusFilter, categoryFilter, votingFilter, scope, sortBy, sortOrder]);

  const { data, loading, error, refetch } = useQuery<{
    adminPlatformPosts: PlatformPostRow[];
  }>(ADMIN_PLATFORM_POSTS, {
    variables: {
      query: listFilter,
      skip,
      take: PAGE_SIZE,
    },
    fetchPolicy: "network-only",
  });

  const { data: countData, refetch: refetchCount } = useQuery<{ adminPlatformPostsCount: number }>(
    ADMIN_PLATFORM_POSTS_COUNT,
    {
      variables: { filter: countFilter },
      fetchPolicy: "cache-and-network",
    },
  );
  const [deletePostMut, { loading: deletingPost }] = useMutation(DELETE_POST);

  const posts = data?.adminPlatformPosts ?? [];
  const total = countData?.adminPlatformPostsCount ?? posts.length;
  const visibleLiveCount = posts.filter((p) => p.isVotingOpen).length;
  const visibleClosedCount = posts.length - visibleLiveCount;
  const visibleScheduledCount = posts.filter((p) => p.status === "SCHEDULED").length;
  const visibleTotalVotes = posts.reduce(
    (sum, p) => sum + (p.totalVotes ?? (p.upvoteCount ?? 0) + (p.downvoteCount ?? 0)),
    0,
  );

  function openPost(postId: string) {
    navigate(`/post/${postId}`);
  }

  async function handleDeletePost(post: PlatformPostRow) {
    setDeleteError(null);
    try {
      await deletePostMut({ variables: { postId: post.id } });
      setDeleteTarget(null);
      if (posts.length === 1 && skip > 0) {
        setSkip((s) => Math.max(0, s - PAGE_SIZE));
      } else {
        void refetch();
      }
      void refetchCount();
    } catch (err: unknown) {
      setDeleteError(getApolloErrorMessage(err));
      setDeleteTarget(null);
    }
  }

  return (
    <div className="admin-tab-panel">
      <AdminSectionHead
        title="Post management"
        subtitle={
          scope === "admin"
            ? "Admin platform-wide polls — search, filter, open a post, or edit as any admin."
            : scope === "user"
              ? "Normal-user posts broadcast platform-wide — search, filter, open, or remove."
              : "Normal (friend-only) user posts — not shown in the public feed. Search, filter, open, or remove."
        }
        action={
          scope === "admin" ? (
            <Link to="/create" className="admin-btn-cta">
              <span className="admin-btn-cta-icon" aria-hidden>+</span>
              New platform post
            </Link>
          ) : undefined
        }
      />

      <div className="admin-subtabs" role="tablist" aria-label="Post management scope">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "admin"}
          className={`admin-subtab${scope === "admin" ? " is-active" : ""}`}
          onClick={() => setScope("admin")}
        >
          Admin Post Management
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "user"}
          className={`admin-subtab${scope === "user" ? " is-active" : ""}`}
          onClick={() => setScope("user")}
        >
          User Post Management
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "user-all"}
          className={`admin-subtab${scope === "user-all" ? " is-active" : ""}`}
          onClick={() => setScope("user-all")}
        >
          User Normal Posts
        </button>
      </div>

      <div className="admin-posts-summary">
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Total matches</span>
          <strong className="admin-posts-summary-value">{total.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">On this page</span>
          <strong className="admin-posts-summary-value">{posts.length.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Live polls</span>
          <strong className="admin-posts-summary-value">{visibleLiveCount.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Closed polls</span>
          <strong className="admin-posts-summary-value">{visibleClosedCount.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Scheduled</span>
          <strong className="admin-posts-summary-value">{visibleScheduledCount.toLocaleString()}</strong>
        </div>
        <div className="admin-posts-summary-card">
          <span className="admin-posts-summary-label">Votes shown</span>
          <strong className="admin-posts-summary-value">{visibleTotalVotes.toLocaleString()}</strong>
        </div>
      </div>

      <div className="admin-toolbar admin-toolbar--posts">
        <AdminSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search caption or option labels…"
        />
        <div className="admin-toolbar-controls">
          <AdminToolbarSelect
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as PostStatusFilter)}
          >
            <option value="all">All</option>
            <option value="PUBLISHED">Published</option>
            <option value="SCHEDULED">Scheduled</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect
            label="Voting"
            value={votingFilter}
            onChange={(v) => setVotingFilter(v as PostVotingFilter)}
          >
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="closed">Closed</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
          >
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminToolbarSelect>
          <AdminToolbarSelect
            label="Sort by"
            value={sortBy}
            onChange={(v) => setSortBy(v as PostSortBy)}
          >
            <option value="createdAt">Created</option>
            <option value="updatedAt">Last updated</option>
            <option value="votes">Votes</option>
            <option value="caption">Caption</option>
          </AdminToolbarSelect>
          <AdminToolbarSelect
            label="Order"
            value={sortOrder}
            onChange={(v) => setSortOrder(v as PostSortOrder)}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </AdminToolbarSelect>
          {(searchTerm ||
            statusFilter !== "all" ||
            votingFilter !== "all" ||
            categoryFilter !== "all" ||
            sortBy !== "createdAt" ||
            sortOrder !== "desc") ? (
            <button
              type="button"
              className="admin-toolbar-reset"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("all");
                setVotingFilter("all");
                setCategoryFilter("all");
                setSortBy("createdAt");
                setSortOrder("desc");
              }}
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="error" role="alert">
          {getApolloErrorMessage(error)}
        </p>
      ) : null}
      {deleteError ? (
        <p className="error" role="alert">
          {deleteError}
        </p>
      ) : null}

      {loading && posts.length === 0 ? (
        <p className="muted">Loading platform posts…</p>
      ) : null}

      {!loading && posts.length === 0 ? (
        <p className="muted">No posts match your filters.</p>
      ) : null}

      {posts.length > 0 ? (
        <div className="admin-table-wrap admin-table-wrap--posts">
          <table className="admin-table admin-table--stack admin-table--posts">
            <thead>
              <tr>
                <th>Post</th>
                <th>Created by</th>
                <th>Category</th>
                <th>Engagement</th>
                <th>Status</th>
                <th>Winner</th>
                <th>Edited by</th>
                <th>Last edited</th>
                <th>Created</th>
                <th className="admin-table-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => {
                const votes =
                  post.totalVotes ??
                  (post.upvoteCount ?? 0) + (post.downvoteCount ?? 0);
                const caption = post.caption?.trim() || "(No caption)";
                const preview =
                  caption.length > 48 ? `${caption.slice(0, 48)}…` : caption;
                const compareItems = (post.options ?? []).map((opt, i) => ({
                  label: opt.label?.trim() || `Option ${i + 1}`,
                  imageUrl:
                    opt.imageUrl?.trim() ||
                    post.imageUrls?.[i]?.trim() ||
                    "",
                }));
                const comparePreviewItems = Array.from({ length: Math.max(2, compareItems.length) })
                  .map((_, i) => compareItems[i] ?? { label: `Option ${i + 1}`, imageUrl: "" })
                  .slice(0, 2);
                const editors = post.editedBy ?? [];
                const creatorSource = post.author ?? (post.authorId
                  ? {
                      id: post.authorId,
                      displayName: post.authorDisplayName,
                      username: post.authorUsername,
                      email: post.authorEmail,
                      profileImageUrl: post.authorProfileImageUrl,
                    }
                  : null);
                const creator: AdminPerson | null = creatorSource
                  ? {
                      id: creatorSource.id,
                      displayName: creatorSource.displayName,
                      username: creatorSource.username ?? "unknown",
                      email: creatorSource.email,
                      profileImageUrl: creatorSource.profileImageUrl,
                    }
                  : null;

                return (
                  <tr
                    key={post.id}
                    className="admin-table-row admin-table-row--clickable"
                    onClick={() => openPost(post.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openPost(post.id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open post: ${caption}`}
                  >
                    <td className="admin-post-cell" data-label="Post">
                      <div className="admin-post-cell-main">
                        <div>
                          <strong className="admin-post-caption">{preview}</strong>
                          <span className="muted small admin-post-id">
                            {post.id.slice(0, 10)}…
                          </span>
                          <ul className="admin-post-compare-inline-list">
                            {comparePreviewItems.map((item, i) => (
                              <li
                                key={`${post.id}-inline-opt-${i}`}
                                className="admin-post-compare-inline-item"
                              >
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt=""
                                    className="admin-post-compare-inline-thumb"
                                  />
                                ) : (
                                  <span className="admin-post-compare-inline-thumb admin-post-compare-inline-thumb--empty">
                                    ?
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </td>
                    <td
                      className="admin-post-person-cell"
                      data-label="Created by"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {creator ? (
                        <AdminPersonLink person={creator} adminStyle compact />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-label="Category">{post.category?.name ?? "—"}</td>
                    <td data-label="Engagement">
                      <div className="admin-post-engagement-grid">
                        <span className="admin-post-engagement-item">
                          <strong>{votes.toLocaleString()}</strong>
                          <em>Votes</em>
                        </span>
                        <span className="admin-post-engagement-item">
                          <strong>{(post.commentCount ?? 0).toLocaleString()}</strong>
                          <em>Comments</em>
                        </span>
                        <span className="admin-post-engagement-item">
                          <strong>{(post.hypeCount ?? 0).toLocaleString()}</strong>
                          <em>Hype</em>
                        </span>
                        <span className="admin-post-engagement-item">
                          <strong>{(post.saveCount ?? 0).toLocaleString()}</strong>
                          <em>Keeps</em>
                        </span>
                      </div>
                    </td>
                    <td data-label="Status">
                      <div className="admin-post-status-chips">
                        <span className={`admin-post-status-chip admin-post-status-chip--${(post.status ?? "PUBLISHED").toLowerCase()}`}>
                          {post.status ?? "PUBLISHED"}
                        </span>
                        <span className={`admin-post-status-chip admin-post-status-chip--${post.isVotingOpen ? "live" : "closed"}`}>
                          {post.isVotingOpen ? "Live" : "Closed"}
                        </span>
                      </div>
                      {post.votingEndsAt ? (
                        <span className="muted small admin-post-ends">
                          Ends {formatRelativeTime(post.votingEndsAt)}
                        </span>
                      ) : null}
                      {post.isPrizeClaimed ? (
                        <span className="muted small admin-post-ends">
                          Prize claimed {post.votePrizeClaimedAt ? `· ${formatRelativeTime(post.votePrizeClaimedAt)}` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="admin-post-person-cell"
                      data-label="Winner"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {post.voteWinner?.user ? (
                        <NavLink
                          to={`/profile/${post.voteWinner.user.id}`}
                          className="admin-post-winner-link"
                          onClick={(e) => e.stopPropagation()}
                          title="Open winner profile"
                        >
                          {post.voteWinner.user.profileImageUrl ? (
                            <img
                              src={post.voteWinner.user.profileImageUrl}
                              alt=""
                              className="admin-post-winner-avatar"
                            />
                          ) : (
                            <span className="admin-post-winner-avatar admin-post-winner-avatar--fallback">
                              {(post.voteWinner.user.displayName?.trim() ||
                                post.voteWinner.user.username ||
                                "W")[0]!.toUpperCase()}
                            </span>
                          )}
                          <span className="muted small">
                            {post.voteWinner.user.displayName?.trim() ||
                              `@${post.voteWinner.user.username ?? "user"}`}
                          </span>
                        </NavLink>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td
                      className="admin-post-editors-cell"
                      data-label="Edited by"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {editors.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="admin-person-list admin-person-list--stacked">
                          {editors.map((editor) => (
                            <AdminPersonLink
                              key={editor.id}
                              person={editor}
                              adminStyle
                              compact
                            />
                          ))}
                        </div>
                      )}
                    </td>
                    <td
                      className="admin-table-joined admin-post-person-cell"
                      data-label="Last edited"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {post.lastEditedBy ? (
                        <>
                          <AdminPersonLink
                            person={post.lastEditedBy}
                            adminStyle
                            compact
                          />
                          {post.updatedAt ? (
                            <span className="muted small">
                              {formatRelativeTime(post.updatedAt)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="admin-table-joined" data-label="Created">
                      <span className="admin-post-created-badge">
                        {formatJoinedAt(post.createdAt)}
                      </span>
                      {post.scheduledAt ? (
                        <span className="admin-post-created-badge admin-post-created-badge--scheduled">
                          Scheduled
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="admin-table-actions"
                      data-label="Actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="admin-link-btn"
                        onClick={() => openPost(post.id)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="admin-link-btn admin-link-btn--secondary"
                        onClick={() => setEditingPost(post)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="admin-link-btn admin-link-btn--danger"
                        disabled={deletingPost}
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(post);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <AdminPaginationBar
        skip={skip}
        total={total}
        shown={posts.length}
        loading={loading}
        onPrev={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}
        onNext={() => setSkip((s) => s + PAGE_SIZE)}
      />
      <div className="admin-posts-refresh">
        <button type="button" className="btn-ghost" onClick={() => void refetch()}>
          Refresh list
        </button>
      </div>

      {editingPost ? (
        <EditPostModal
          post={{
            id: editingPost.id,
            format: editingPost.format,
            caption: editingPost.caption,
            imageUrls: editingPost.imageUrls ?? [],
            options: editingPost.options,
            category: editingPost.category,
            campaign: editingPost.campaign,
            votingEndsAt: editingPost.votingEndsAt,
            endingSoonLeadMinutes: editingPost.endingSoonLeadMinutes,
            isVotingOpen: editingPost.isVotingOpen,
            status: editingPost.status,
            scheduledAt: editingPost.scheduledAt,
          }}
          onClose={() => setEditingPost(null)}
          onSaved={() => {
            setEditingPost(null);
            void refetch();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <ConfirmDialog
          message={`Delete this post "${(deleteTarget.caption?.trim() || "Untitled post").slice(0, 80)}"? This cannot be undone.`}
          confirmLabel="Delete post"
          onConfirm={() => void handleDeletePost(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
          loading={deletingPost}
        />
      ) : null}
    </div>
  );
}

// ─── Platform: allow normal users to post globally ───────────────────────────

function AdminUserGlobalPostsControl() {
  const { data, refetch } = useQuery(PLATFORM_SETTINGS);
  const [setAllow] = useMutation(SET_ALLOW_USER_GLOBAL_POSTS);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (data?.platformSettings) {
      setEnabled(Boolean(data.platformSettings.allowUserGlobalPosts));
    }
  }, [data?.platformSettings?.allowUserGlobalPosts]);

  function setEnabledOptimistic(next: boolean) {
    if (next === enabled) return;
    const previous = enabled;
    setEnabled(next);
    setError(null);
    void setAllow({ variables: { enabled: next } })
      .then(() => {
        void refetch();
      })
      .catch((err: unknown) => {
        setEnabled(previous);
        setError(getApolloErrorMessage(err));
      });
  }

  return (
    <section
      className={`admin-global-posts-bar${enabled ? " admin-global-posts-bar--danger" : " admin-global-posts-bar--safe"}`}
      aria-label="Global user posts setting"
    >
      <div className="admin-global-posts-bar__row">
        <span className="admin-global-posts-bar__label" id="admin-global-posts-title">
          Let normal users post globally
          {enabled ? (
            <span className="admin-global-posts-bar__pill admin-global-posts-bar__pill--danger">
              Risk active
            </span>
          ) : (
            <span className="admin-global-posts-bar__pill admin-global-posts-bar__pill--safe">
              Restricted
            </span>
          )}
        </span>
        <div className="admin-global-posts-bar__controls">
          <label
            className="ig-toggle-switch-wrap admin-global-posts-toggle"
            title={enabled ? "Turn off global user posts" : "Allow global user posts"}
          >
            <input
              type="checkbox"
              role="switch"
              aria-labelledby="admin-global-posts-title"
              aria-checked={enabled}
              checked={enabled}
              onChange={(e) => setEnabledOptimistic(e.target.checked)}
            />
            <span className="ig-toggle-switch" aria-hidden />
          </label>
          <button
            type="button"
            className="admin-global-posts-details-btn"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((o) => !o)}
          >
            {detailsOpen ? "Hide details" : "Details"}
          </button>
        </div>
      </div>
      {detailsOpen ? (
        <div className="admin-global-posts-bar__details" id="admin-global-posts-details">
          <p className="muted small">
            <strong>Important platform control.</strong> When off (default), only admin{" "}
            <strong>Platform-wide</strong> posts reach everyone with the <strong>Ke Jitbe</strong> brand.
            When on, users can choose a global post — their name and photo appear on the feed and in
            notifications for all members (not an official Ke Jitbe platform post).
          </p>
        </div>
      ) : null}
      {error ? <p className="admin-error small admin-global-posts-bar__error">{error}</p> : null}
    </section>
  );
}

// ─── Admin Page (root) ────────────────────────────────────────────────────────

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTabId>("users");
  const [messagesTargetUserId, setMessagesTargetUserId] = useState<string | null>(null);

  function openAdminMessagesForUser(userId: string) {
    setMessagesTargetUserId(userId);
    setActiveTab("admin-messages");
  }

  function clearMessagesTargetUser() {
    setMessagesTargetUserId(null);
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin Dashboard</h1>
          <p className="muted small">Manage users and admin access</p>
        </div>
        <span className="admin-role-badge admin-role-badge--admin">admin</span>
      </div>

      <AdminUserGlobalPostsControl />

      <AdminTabNav activeTab={activeTab} onChange={setActiveTab} />

      <div className="admin-section">
        {activeTab === "users" && <UsersTab onComposeMessage={openAdminMessagesForUser} />}
        {activeTab === "admins" && <AdminsTab onComposeMessage={openAdminMessagesForUser} />}
        {activeTab === "invitations" && <InvitationsTab />}
        {activeTab === "campaigns" && <CampaignsTab />}
        {activeTab === "categories" && <CategoriesTab />}
        {activeTab === "posts" && <PostsTab />}
        {activeTab === "reports" && <AdminReportedTab />}
        {activeTab === "worldcup" && <WorldCupTab />}
        {activeTab === "admin-messages" && (
          <AdminMessagesTab
            initialUserId={messagesTargetUserId}
            onInitialUserConsumed={clearMessagesTargetUser}
          />
        )}
      </div>
    </div>
  );
}
