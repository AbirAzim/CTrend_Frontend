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

export type AdminOverviewNavTarget =
  | "users"
  | "users-online"
  | "admins"
  | "invitations"
  | "reports"
  | "posts"
  | "worldcup";

type ActivityMetric = "signups" | "posts" | "votes" | "comments";

type MetricSummary = {
  total: number;
  last7: number;
  prev7: number;
  today: number;
  yesterday: number;
  avgPerDay: number;
  peak: number;
  peakDate: string | null;
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
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function sumMetric(days: AdminDailyStat[], key: ActivityMetric, start = 0, end = days.length) {
  return days.slice(start, end).reduce((sum, d) => sum + d[key], 0);
}

function summarizeMetric(days: AdminDailyStat[], key: ActivityMetric): MetricSummary {
  const values = days.map((d) => d[key]);
  const total = values.reduce((a, b) => a + b, 0);
  const today = values[values.length - 1] ?? 0;
  const yesterday = values[values.length - 2] ?? 0;
  const last7 = sumMetric(days, key, Math.max(0, days.length - 7));
  const prev7 = sumMetric(days, key, Math.max(0, days.length - 14), Math.max(0, days.length - 7));
  const peak = Math.max(0, ...values);
  const peakDate = days.find((d) => d[key] === peak && peak > 0)?.date ?? null;
  return {
    total,
    last7,
    prev7,
    today,
    yesterday,
    avgPerDay: days.length > 0 ? Math.round(total / days.length) : 0,
    peak,
    peakDate,
  };
}

function trendLabel(current: number, previous: number) {
  if (previous <= 0) {
    return current > 0 ? "new this week" : "flat vs prior week";
  }
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "same as prior week";
  return `${delta > 0 ? "+" : ""}${delta}% vs prior week`;
}

function trendDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function compactDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const METRIC_COLORS: Record<ActivityMetric, string> = {
  signups: "#3b82f6",
  posts: "#f59e0b",
  votes: "#22c55e",
  comments: "#8b5cf6",
};

const METRIC_LABELS: Record<ActivityMetric, string> = {
  signups: "Signups",
  posts: "Posts",
  votes: "Votes",
  comments: "Comments",
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const coords = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - 4 - (v / max) * (h - 8);
    return { x, y };
  });
  const line = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const area = coords.length
    ? `M0,${h} L${coords.map((p) => `${p.x},${p.y}`).join(" L")} L${w},${h} Z`
    : "";

  return (
    <svg className="admin-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      {area ? <path d={area} fill={`${color}22`} /> : null}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricBarChart({
  metric,
  days,
  summary,
}: {
  metric: ActivityMetric;
  days: AdminDailyStat[];
  summary: MetricSummary;
}) {
  const color = METRIC_COLORS[metric];
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const avg = summary.avgPerDay;

  return (
    <div className="admin-chart-card admin-chart-card--metric">
      <div className="admin-chart-head">
        <div>
          <h3 className="admin-chart-title">{METRIC_LABELS[metric]}</h3>
          <p className="admin-chart-sub muted small">
            14-day total {fmt(summary.total)} · avg {fmt(avg)}/day
          </p>
        </div>
        <span
          className={`admin-trend-badge${summary.last7 >= summary.prev7 ? " admin-trend-badge--up" : summary.last7 < summary.prev7 ? " admin-trend-badge--down" : ""}`}
        >
          {trendDelta(summary.last7, summary.prev7) > 0 ? "↑" : trendDelta(summary.last7, summary.prev7) < 0 ? "↓" : "→"}
          {" "}
          {trendLabel(summary.last7, summary.prev7)}
        </span>
      </div>
      <Sparkline values={values} color={color} />
      <div className="admin-chart-bars admin-chart-bars--labeled" role="img" aria-label={`${METRIC_LABELS[metric]} daily chart`}>
        {days.map((d) => {
          const v = d[metric];
          const h = Math.max(v > 0 ? 10 : 3, Math.round((v / max) * 100));
          const isPeak = v === summary.peak && v > 0;
          return (
            <div key={d.date} className="admin-chart-bar-col" title={`${compactDate(d.date)}: ${fmt(v)}`}>
              <span className={`admin-chart-bar-value${v === 0 ? " admin-chart-bar-value--zero" : ""}`}>
                {v > 0 ? fmt(v) : "·"}
              </span>
              <div className="admin-chart-bar-track">
                <div
                  className={`admin-chart-bar-fill${isPeak ? " admin-chart-bar-fill--peak" : ""}`}
                  style={{ height: `${h}%`, backgroundColor: color }}
                />
                {avg > 0 ? (
                  <div
                    className="admin-chart-avg-line"
                    style={{ bottom: `${Math.min(100, Math.round((avg / max) * 100))}%` }}
                    title={`Daily avg: ${fmt(avg)}`}
                  />
                ) : null}
              </div>
              <span className="admin-chart-bar-label">{compactDate(d.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StackedActivityChart({ days }: { days: AdminDailyStat[] }) {
  const metrics: ActivityMetric[] = ["signups", "posts", "votes", "comments"];
  const totals = days.map((d) => d.signups + d.posts + d.votes + d.comments);
  const maxTotal = Math.max(1, ...totals);

  return (
    <div className="admin-chart-card admin-chart-card--wide">
      <div className="admin-chart-head">
        <div>
          <h3 className="admin-chart-title">Daily engagement mix</h3>
          <p className="admin-chart-sub muted small">
            Stacked breakdown — signups, posts, votes, comments per day
          </p>
        </div>
        <div className="admin-chart-legend">
          {metrics.map((m) => (
            <span key={m} className="admin-chart-legend-item">
              <span className="admin-chart-legend-swatch" style={{ backgroundColor: METRIC_COLORS[m] }} />
              {METRIC_LABELS[m]}
            </span>
          ))}
        </div>
      </div>
      <div className="admin-stacked-chart" role="img" aria-label="Stacked daily engagement chart">
        {days.map((d, i) => {
          const total = totals[i] ?? 0;
          const segments = metrics.map((m) => ({
            key: m,
            value: d[m],
            color: METRIC_COLORS[m],
          }));
          return (
            <div key={d.date} className="admin-stacked-col" title={`${compactDate(d.date)}: ${fmt(total)} total`}>
              <span className="admin-stacked-total">{total > 0 ? fmt(total) : "·"}</span>
              <div
                className="admin-stacked-bar"
                style={{ height: `${Math.max(total > 0 ? 12 : 4, Math.round((total / maxTotal) * 100))}%` }}
              >
                {segments.map((seg) =>
                  seg.value > 0 ? (
                    <div
                      key={seg.key}
                      className="admin-stacked-seg"
                      style={{ flexGrow: seg.value, backgroundColor: seg.color }}
                      title={`${METRIC_LABELS[seg.key]}: ${fmt(seg.value)}`}
                    />
                  ) : null,
                )}
              </div>
              <span className="admin-chart-bar-label">{compactDate(d.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CellBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="admin-cell-bar-wrap">
      <span className="admin-cell-bar-num">{fmt(value)}</span>
      <div className="admin-cell-bar-track">
        <div className="admin-cell-bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

type StatCard = {
  label: string;
  value: string;
  hint?: string;
  accent?: "blue" | "green" | "amber" | "violet" | "rose" | "slate";
  onClick?: () => void;
  actionLabel?: string;
};

function StatGrid({ cards }: { cards: StatCard[] }) {
  return (
    <div className="admin-stat-grid">
      {cards.map((c) => {
        const clickable = Boolean(c.onClick);
        const Tag = clickable ? "button" : "div";
        return (
          <Tag
            key={c.label}
            type={clickable ? "button" : undefined}
            className={`admin-stat-card admin-stat-card--${c.accent ?? "slate"}${clickable ? " admin-stat-card--clickable" : ""}`}
            onClick={c.onClick}
          >
            <span className="admin-stat-label">{c.label}</span>
            <span className="admin-stat-value">{c.value}</span>
            {c.hint ? <span className="admin-stat-hint">{c.hint}</span> : null}
            {c.actionLabel ? <span className="admin-stat-action">{c.actionLabel}</span> : null}
          </Tag>
        );
      })}
    </div>
  );
}

function MetricSummaryCard({
  title,
  metric,
  summary,
  days,
  accent,
}: {
  title: string;
  metric: ActivityMetric;
  summary: MetricSummary;
  days: AdminDailyStat[];
  accent: string;
}) {
  const peakLabel = summary.peakDate ? shortDate(summary.peakDate) : "—";
  const delta = trendDelta(summary.last7, summary.prev7);
  const values = days.map((d) => d[metric]);

  return (
    <div className="admin-metric-card" style={{ borderTopColor: accent }}>
      <div className="admin-metric-card-head">
        <h3 className="admin-metric-title">{title}</h3>
        <span
          className={`admin-trend-pill${delta > 0 ? " admin-trend-pill--up" : delta < 0 ? " admin-trend-pill--down" : ""}`}
        >
          {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
        </span>
      </div>
      <Sparkline values={values} color={accent} />
      <div className="admin-metric-grid">
        <div>
          <span className="admin-metric-k">14-day total</span>
          <strong className="admin-metric-v">{fmt(summary.total)}</strong>
        </div>
        <div>
          <span className="admin-metric-k">Today</span>
          <strong className="admin-metric-v">{fmt(summary.today)}</strong>
          <span className="admin-metric-sub muted small">
            yesterday {fmt(summary.yesterday)}
          </span>
        </div>
        <div>
          <span className="admin-metric-k">Daily avg</span>
          <strong className="admin-metric-v">{fmt(summary.avgPerDay)}</strong>
        </div>
        <div>
          <span className="admin-metric-k">Best day</span>
          <strong className="admin-metric-v">{fmt(summary.peak)}</strong>
          <span className="admin-metric-sub muted small">{peakLabel}</span>
        </div>
      </div>
      <p className="admin-metric-foot muted small">
        Last 7 days: {fmt(summary.last7)} · {trendLabel(summary.last7, summary.prev7)}
      </p>
    </div>
  );
}

function ActivityTable({ days }: { days: AdminDailyStat[] }) {
  const totals = days.reduce(
    (acc, d) => ({
      signups: acc.signups + d.signups,
      posts: acc.posts + d.posts,
      votes: acc.votes + d.votes,
      comments: acc.comments + d.comments,
    }),
    { signups: 0, posts: 0, votes: 0, comments: 0 },
  );
  const maxSignups = Math.max(1, ...days.map((d) => d.signups));
  const maxPosts = Math.max(1, ...days.map((d) => d.posts));
  const maxVotes = Math.max(1, ...days.map((d) => d.votes));
  const maxComments = Math.max(1, ...days.map((d) => d.comments));
  const maxTotal = Math.max(
    1,
    ...days.map((d) => d.signups + d.posts + d.votes + d.comments),
  );

  return (
    <div className="admin-activity-table-wrap">
      <h4 className="admin-activity-table-title">Daily numbers</h4>
      <table className="admin-table admin-activity-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Signups</th>
            <th>Posts</th>
            <th>Votes</th>
            <th>Comments</th>
            <th>Total activity</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => {
            const total = d.signups + d.posts + d.votes + d.comments;
            return (
              <tr key={d.date}>
                <td>{shortDate(d.date)}</td>
                <td><CellBar value={d.signups} max={maxSignups} color={METRIC_COLORS.signups} /></td>
                <td><CellBar value={d.posts} max={maxPosts} color={METRIC_COLORS.posts} /></td>
                <td><CellBar value={d.votes} max={maxVotes} color={METRIC_COLORS.votes} /></td>
                <td><CellBar value={d.comments} max={maxComments} color={METRIC_COLORS.comments} /></td>
                <td><CellBar value={total} max={maxTotal} color="var(--cx-accent, #6366f1)" /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>14-day total</td>
            <td className="admin-activity-num">{fmt(totals.signups)}</td>
            <td className="admin-activity-num">{fmt(totals.posts)}</td>
            <td className="admin-activity-num">{fmt(totals.votes)}</td>
            <td className="admin-activity-num">{fmt(totals.comments)}</td>
            <td className="admin-activity-num admin-activity-num--total">
              {fmt(totals.signups + totals.posts + totals.votes + totals.comments)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function AdminOverviewTab({
  onNavigate,
}: {
  onNavigate: (target: AdminOverviewNavTarget) => void;
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
  const signupSummary = summarizeMetric(days, "signups");
  const voteSummary = summarizeMetric(days, "votes");
  const postSummary = summarizeMetric(days, "posts");
  const commentSummary = summarizeMetric(days, "comments");

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
          {
            label: "Total users",
            value: fmt(s.totalUsers),
            hint: `+${fmt(s.newUsersLast7Days)} this week`,
            accent: "blue",
            onClick: () => onNavigate("users"),
            actionLabel: "Open users →",
          },
          {
            label: "Online now",
            value: fmt(s.onlineUsers),
            hint: "WebSocket presence",
            accent: "green",
            onClick: () => onNavigate("users-online"),
            actionLabel: "See who's online →",
          },
          {
            label: "Verified",
            value: fmt(s.verifiedUsers),
            hint: `${verifyPct}% of users`,
            accent: "violet",
          },
          {
            label: "Admins",
            value: fmt(s.totalAdmins),
            accent: "slate",
            onClick: () => onNavigate("admins"),
            actionLabel: "Manage admins →",
          },
          {
            label: "Total posts",
            value: fmt(s.totalPosts),
            hint: `${fmt(s.postsLast7Days)} this week`,
            accent: "amber",
            onClick: () => onNavigate("posts"),
            actionLabel: "Manage posts →",
          },
          {
            label: "Total votes",
            value: fmt(s.totalVotes),
            hint: `${fmt(s.votesLast7Days)} this week`,
            accent: "rose",
          },
          {
            label: "Active voters (7d)",
            value: fmt(s.activeVotersLast7Days),
            hint: "Unique voters",
            accent: "green",
          },
          {
            label: "Comments",
            value: fmt(s.totalComments),
            accent: "slate",
          },
          {
            label: "Pending invites",
            value: fmt(s.pendingInvitations),
            accent: "violet",
            onClick: () => onNavigate("invitations"),
            actionLabel: "View invites →",
          },
          {
            label: "Reported posts",
            value: fmt(s.reportedPosts),
            accent: "rose",
            onClick: () => onNavigate("reports"),
            actionLabel: "Review reports →",
          },
          {
            label: "Campaign winners",
            value: fmt(s.campaignWinners),
            accent: "amber",
          },
        ]}
      />

      <section className="admin-activity-section">
        <div className="admin-activity-head">
          <div>
            <h3 className="admin-activity-title">Activity breakdown (14 days)</h3>
            <p className="muted small">
              Real counts per day — totals, averages, and week-over-week trends
            </p>
          </div>
        </div>

        <div className="admin-metric-grid-wrap">
          <MetricSummaryCard title="Signups" metric="signups" days={days} summary={signupSummary} accent={METRIC_COLORS.signups} />
          <MetricSummaryCard title="Votes" metric="votes" days={days} summary={voteSummary} accent={METRIC_COLORS.votes} />
          <MetricSummaryCard title="Posts" metric="posts" days={days} summary={postSummary} accent={METRIC_COLORS.posts} />
          <MetricSummaryCard title="Comments" metric="comments" days={days} summary={commentSummary} accent={METRIC_COLORS.comments} />
        </div>

        <StackedActivityChart days={days} />

        <div className="admin-chart-grid admin-chart-grid--metrics">
          <MetricBarChart metric="signups" days={days} summary={signupSummary} />
          <MetricBarChart metric="votes" days={days} summary={voteSummary} />
          <MetricBarChart metric="posts" days={days} summary={postSummary} />
          <MetricBarChart metric="comments" days={days} summary={commentSummary} />
        </div>

        <ActivityTable days={days} />
      </section>

      <div className="admin-quick-links">
        <h3 className="admin-quick-links-title">Quick actions</h3>
        <div className="admin-quick-links-grid">
          {[
            { id: "users" as const, label: "Manage users", emoji: "👥" },
            { id: "reports" as const, label: "Review reports", emoji: "🚩" },
            { id: "invitations" as const, label: "Invitations", emoji: "✉️" },
            { id: "worldcup" as const, label: "World Cup", emoji: "⚽" },
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
