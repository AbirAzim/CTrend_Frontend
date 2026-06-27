import { useQuery } from "@apollo/client";
import { ADMIN_PLATFORM_STATS } from "../../graphql/admin";

export type AdminDailyStat = {
  date: string;
  signups: number;
  posts: number;
  votes: number;
  comments: number;
};

export type AdminPlatformStats = {
  totalUsers: number;
  totalAdmins: number;
  verifiedUsers: number;
  onlineUsers: number;
  newUsersLast7Days: number;
  totalPosts: number;
  totalVotes: number;
  totalComments: number;
  activeVotersLast7Days: number;
  postsLast7Days: number;
  votesLast7Days: number;
  pendingInvitations: number;
  reportedPosts: number;
  campaignWinners: number;
  dailyActivity: AdminDailyStat[];
};

function fmt(n: number) {
  return n.toLocaleString();
}

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ActivityChart({
  title,
  subtitle,
  days,
  pick,
  color,
}: {
  title: string;
  subtitle: string;
  days: AdminDailyStat[];
  pick: (d: AdminDailyStat) => number;
  color: string;
}) {
  const max = Math.max(1, ...days.map(pick));
  return (
    <div className="admin-chart-card">
      <div className="admin-chart-head">
        <h3 className="admin-chart-title">{title}</h3>
        <p className="admin-chart-sub muted small">{subtitle}</p>
      </div>
      <div className="admin-chart-bars" role="img" aria-label={title}>
        {days.map((d) => {
          const v = pick(d);
          const h = Math.max(v > 0 ? 8 : 2, Math.round((v / max) * 100));
          return (
            <div key={d.date} className="admin-chart-bar-col" title={`${shortDate(d.date)}: ${v}`}>
              <div className="admin-chart-bar-track">
                <div
                  className="admin-chart-bar-fill"
                  style={{ height: `${h}%`, backgroundColor: color }}
                />
              </div>
              <span className="admin-chart-bar-label">{shortDate(d.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StatCard = {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "green" | "amber" | "violet" | "rose" | "slate";
};

function StatGrid({ cards }: { cards: StatCard[] }) {
  return (
    <div className="admin-stat-grid">
      {cards.map((c) => (
        <div key={c.label} className={`admin-stat-card admin-stat-card--${c.accent ?? "slate"}`}>
          <span className="admin-stat-label">{c.label}</span>
          <span className="admin-stat-value">{c.value}</span>
          {c.hint ? <span className="admin-stat-hint">{c.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function AdminOverviewTab({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const { data, loading, error, refetch } = useQuery<{ adminPlatformStats: AdminPlatformStats }>(
    ADMIN_PLATFORM_STATS,
    { fetchPolicy: "cache-and-network", pollInterval: 60_000 },
  );
  const s = data?.adminPlatformStats;
  const days = s?.dailyActivity ?? [];

  if (loading && !s) {
    return (
      <div className="admin-overview-loading">
        <div className="admin-spinner" aria-hidden />
        <p className="muted">Loading platform stats…</p>
      </div>
    );
  }

  if (error || !s) {
    return (
      <div className="admin-overview-error">
        <p>Could not load analytics.</p>
        <button type="button" className="admin-btn-cta" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const verifyPct = pct(s.verifiedUsers, s.totalUsers);

  return (
    <div className="admin-overview">
      <div className="admin-overview-head">
        <div>
          <h2 className="admin-section-title">Platform overview</h2>
          <p className="muted small">
            Live snapshot · refreshes every minute · {s.onlineUsers} online now
          </p>
        </div>
        <button type="button" className="admin-btn-ghost-sm" onClick={() => void refetch()}>
          ↻ Refresh
        </button>
      </div>

      <StatGrid
        cards={[
          { label: "Total users", value: fmt(s.totalUsers), hint: `+${fmt(s.newUsersLast7Days)} this week`, accent: "blue" },
          { label: "Online now", value: fmt(s.onlineUsers), hint: "WebSocket presence", accent: "green" },
          { label: "Verified", value: fmt(s.verifiedUsers), hint: `${verifyPct}% of users`, accent: "violet" },
          { label: "Admins", value: fmt(s.totalAdmins), accent: "slate" },
        ]}
      />

      <StatGrid
        cards={[
          { label: "Total posts", value: fmt(s.totalPosts), hint: `${fmt(s.postsLast7Days)} this week`, accent: "amber" },
          { label: "Total votes", value: fmt(s.totalVotes), hint: `${fmt(s.votesLast7Days)} this week`, accent: "rose" },
          { label: "Active voters (7d)", value: fmt(s.activeVotersLast7Days), hint: "Unique voters", accent: "green" },
          { label: "Comments", value: fmt(s.totalComments), accent: "slate" },
        ]}
      />

      <StatGrid
        cards={[
          { label: "Pending invites", value: fmt(s.pendingInvitations), accent: "violet" },
          { label: "Reported posts", value: fmt(s.reportedPosts), accent: "rose" },
          { label: "Campaign winners", value: fmt(s.campaignWinners), accent: "amber" },
        ]}
      />

      <div className="admin-chart-grid">
        <ActivityChart
          title="Signups (14 days)"
          subtitle="New user registrations per day"
          days={days}
          pick={(d) => d.signups}
          color="#3b82f6"
        />
        <ActivityChart
          title="Votes (14 days)"
          subtitle="Daily voting activity"
          days={days}
          pick={(d) => d.votes}
          color="#22c55e"
        />
        <ActivityChart
          title="Posts (14 days)"
          subtitle="New compares created"
          days={days}
          pick={(d) => d.posts}
          color="#f59e0b"
        />
      </div>

      <div className="admin-quick-links">
        <h3 className="admin-quick-links-title">Quick actions</h3>
        <div className="admin-quick-links-grid">
          {[
            { id: "users", label: "Manage users", emoji: "👥" },
            { id: "reports", label: "Review reports", emoji: "🚩" },
            { id: "invitations", label: "Invitations", emoji: "✉️" },
            { id: "worldcup", label: "World Cup", emoji: "⚽" },
          ].map((link) => (
            <button
              key={link.id}
              type="button"
              className="admin-quick-link"
              onClick={() => onNavigate(link.id)}
            >
              <span className="admin-quick-link-emoji">{link.emoji}</span>
              <span>{link.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
