import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ADMIN_PLATFORM_STATS } from "@ctrend/shared/graphql/admin";
import { AdminPlatformControls } from "../../components/admin/AdminPlatformControls";
import { useTheme } from "../../context/ThemeContext";

type Daily = { date: string; signups: number; posts: number; votes: number; comments: number };
type ActivityMetric = "signups" | "posts" | "votes" | "comments";
type Stats = {
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
  dailyActivity: Daily[];
};

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

const QUICK_LINKS = [
  { href: "/admin/users", label: "Users", emoji: "👥" },
  { href: "/admin/reports", label: "Reports", emoji: "🚩" },
  { href: "/admin/invitations", label: "Invites", emoji: "✉️" },
  { href: "/admin/world-cup", label: "World Cup", emoji: "⚽" },
] as const;

function fmt(n: number) {
  return n.toLocaleString();
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function compactDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sumMetric(days: Daily[], key: ActivityMetric, start = 0, end = days.length) {
  return days.slice(start, end).reduce((sum, d) => sum + d[key], 0);
}

function summarizeMetric(days: Daily[], key: ActivityMetric): MetricSummary {
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

function trendDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function trendLabel(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? "new this week" : "flat vs prior week";
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return "same as prior week";
  return `${delta > 0 ? "+" : ""}${delta}% vs prior week`;
}

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
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {area ? <Path d={area} fill={`${color}33`} /> : null}
      <Polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
  action,
  onPress,
  colors,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  action?: string;
  onPress?: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const inner = (
    <>
      <View style={[st.statAccent, { backgroundColor: accent }]} />
      <Text style={[st.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[st.statValue, { color: colors.text }]}>{value}</Text>
      {hint ? <Text style={[st.statHint, { color: colors.subtext }]}>{hint}</Text> : null}
      {action ? <Text style={[st.statAction, { color: colors.accent }]}>{action}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          st.statCard,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.88 : 1 },
        ]}
        onPress={onPress}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={[st.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {inner}
    </View>
  );
}

function MetricSummaryCard({
  title,
  metric,
  days,
  summary,
  colors,
}: {
  title: string;
  metric: ActivityMetric;
  days: Daily[];
  summary: MetricSummary;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const color = METRIC_COLORS[metric];
  const delta = trendDelta(summary.last7, summary.prev7);
  const peakLabel = summary.peakDate ? shortDate(summary.peakDate) : "—";

  return (
    <View style={[st.metricCard, { backgroundColor: colors.section, borderColor: colors.border }]}>
      <View style={st.metricHead}>
        <Text style={[st.metricTitle, { color: colors.text }]}>{title}</Text>
        <View
          style={[
            st.trendPill,
            {
              backgroundColor:
                delta > 0 ? "rgba(34,197,94,0.18)" : delta < 0 ? "rgba(244,63,94,0.15)" : colors.card,
            },
          ]}
        >
          <Text
            style={{
              color: delta > 0 ? "#22c55e" : delta < 0 ? "#f43f5e" : colors.muted,
              fontSize: 10,
              fontWeight: "800",
            }}
          >
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
          </Text>
        </View>
      </View>
      <Sparkline values={days.map((d) => d[metric])} color={color} />
      <View style={st.metricGrid}>
        <View style={st.metricCell}>
          <Text style={[st.metricK, { color: colors.muted }]}>14d total</Text>
          <Text style={[st.metricV, { color: colors.text }]}>{fmt(summary.total)}</Text>
        </View>
        <View style={st.metricCell}>
          <Text style={[st.metricK, { color: colors.muted }]}>Today</Text>
          <Text style={[st.metricV, { color: colors.text }]}>{fmt(summary.today)}</Text>
          <Text style={[st.metricSub, { color: colors.muted }]}>yday {fmt(summary.yesterday)}</Text>
        </View>
        <View style={st.metricCell}>
          <Text style={[st.metricK, { color: colors.muted }]}>Daily avg</Text>
          <Text style={[st.metricV, { color: colors.text }]}>{fmt(summary.avgPerDay)}</Text>
        </View>
        <View style={st.metricCell}>
          <Text style={[st.metricK, { color: colors.muted }]}>Best day</Text>
          <Text style={[st.metricV, { color: colors.text }]}>{fmt(summary.peak)}</Text>
          <Text style={[st.metricSub, { color: colors.muted }]} numberOfLines={1}>{peakLabel}</Text>
        </View>
      </View>
      <Text style={[st.metricFoot, { color: colors.muted }]}>
        7d: {fmt(summary.last7)} · {trendLabel(summary.last7, summary.prev7)}
      </Text>
    </View>
  );
}

function MetricBarChart({
  metric,
  days,
  summary,
  colors,
}: {
  metric: ActivityMetric;
  days: Daily[];
  summary: MetricSummary;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const color = METRIC_COLORS[metric];
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values);

  return (
    <View style={[st.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.chartTitle, { color: colors.text }]}>{METRIC_LABELS[metric]}</Text>
      <Text style={[st.chartSub, { color: colors.muted }]}>
        14d {fmt(summary.total)} · avg {fmt(summary.avgPerDay)}/day
      </Text>
      <View style={st.chartRow}>
        {days.map((d) => {
          const v = d[metric];
          const h = Math.max(v > 0 ? 8 : 3, Math.round((v / max) * 52));
          return (
            <View key={d.date} style={st.barCol}>
              <Text style={[st.barValue, { color: v > 0 ? colors.text : colors.muted }]}>
                {v > 0 ? (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)) : "·"}
              </Text>
              <View style={[st.barTrack, { backgroundColor: colors.section }]}>
                <View style={[st.barFill, { height: h, backgroundColor: color }]} />
              </View>
              <Text style={[st.barLabel, { color: colors.muted }]} numberOfLines={1}>
                {compactDate(d.date).split(" ")[1] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StackedChart({ days, colors }: { days: Daily[]; colors: ReturnType<typeof useTheme>["colors"] }) {
  const metrics: ActivityMetric[] = ["signups", "posts", "votes", "comments"];
  const totals = days.map((d) => d.signups + d.posts + d.votes + d.comments);
  const maxTotal = Math.max(1, ...totals);

  return (
    <View style={[st.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.chartTitle, { color: colors.text }]}>Daily engagement mix</Text>
      <View style={st.legendRow}>
        {metrics.map((m) => (
          <View key={m} style={st.legendItem}>
            <View style={[st.legendSwatch, { backgroundColor: METRIC_COLORS[m] }]} />
            <Text style={[st.legendText, { color: colors.muted }]}>{METRIC_LABELS[m]}</Text>
          </View>
        ))}
      </View>
      <View style={st.chartRow}>
        {days.map((d, i) => {
          const total = totals[i] ?? 0;
          const h = Math.max(total > 0 ? 10 : 4, Math.round((total / maxTotal) * 56));
          return (
            <View key={d.date} style={st.barCol}>
              <Text style={[st.barValue, { color: colors.text }]}>
                {total > 0 ? (total >= 1000 ? `${Math.round(total / 100) / 10}k` : String(total)) : "·"}
              </Text>
              <View style={[st.stackedBar, { height: h, backgroundColor: colors.section }]}>
                {metrics.map((m) =>
                  d[m] > 0 ? (
                    <View
                      key={m}
                      style={{ flex: d[m], backgroundColor: METRIC_COLORS[m], minHeight: 2 }}
                    />
                  ) : null,
                )}
              </View>
              <Text style={[st.barLabel, { color: colors.muted }]} numberOfLines={1}>
                {compactDate(d.date).split(" ")[1] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActivityTable({ days, colors }: { days: Daily[]; colors: ReturnType<typeof useTheme>["colors"] }) {
  const maxByKey = {
    signups: Math.max(1, ...days.map((d) => d.signups)),
    posts: Math.max(1, ...days.map((d) => d.posts)),
    votes: Math.max(1, ...days.map((d) => d.votes)),
    comments: Math.max(1, ...days.map((d) => d.comments)),
  };
  const maxTotal = Math.max(1, ...days.map((d) => d.signups + d.posts + d.votes + d.comments));

  return (
    <View style={[st.tableWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.tableTitle, { color: colors.text }]}>Daily numbers</Text>
      {[...days].reverse().slice(0, 7).map((d) => {
        const total = d.signups + d.posts + d.votes + d.comments;
        return (
          <View key={d.date} style={[st.tableRow, { borderBottomColor: colors.border }]}>
            <Text style={[st.tableDate, { color: colors.text }]} numberOfLines={1}>
              {shortDate(d.date)}
            </Text>
            <View style={st.tableNums}>
              {(["signups", "posts", "votes", "comments"] as ActivityMetric[]).map((k) => (
                <View key={k} style={st.cellBarWrap}>
                  <Text style={[st.cellNum, { color: colors.subtext }]}>{fmt(d[k])}</Text>
                  <View style={[st.cellTrack, { backgroundColor: colors.section }]}>
                    <View
                      style={{
                        height: 3,
                        width: `${Math.round((d[k] / maxByKey[k]) * 100)}%`,
                        backgroundColor: METRIC_COLORS[k],
                        borderRadius: 999,
                      }}
                    />
                  </View>
                </View>
              ))}
              <View style={st.cellBarWrap}>
                <Text style={[st.cellTotal, { color: colors.accent }]}>{fmt(total)}</Text>
                <View style={[st.cellTrack, { backgroundColor: colors.section }]}>
                  <View
                    style={{
                      height: 3,
                      width: `${Math.round((total / maxTotal) * 100)}%`,
                      backgroundColor: colors.accent,
                      borderRadius: 999,
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function AdminOverviewScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, refetch, networkStatus } = useQuery<{ adminPlatformStats: Stats }>(
    ADMIN_PLATFORM_STATS,
    { fetchPolicy: "cache-and-network", pollInterval: 60_000 },
  );
  const s = data?.adminPlatformStats;
  const days = s?.dailyActivity ?? [];
  const refreshing = networkStatus === 4;

  if (loading && !s) {
    return (
      <View style={[st.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!s) {
    return (
      <View style={[st.center, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.text }}>Could not load stats</Text>
        <Pressable onPress={() => void refetch()} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const verifyPct = s.totalUsers > 0 ? Math.round((s.verifiedUsers / s.totalUsers) * 100) : 0;
  const signupSummary = summarizeMetric(days, "signups");
  const voteSummary = summarizeMetric(days, "votes");
  const postSummary = summarizeMetric(days, "posts");
  const commentSummary = summarizeMetric(days, "comments");

  const nav = (href: string) => router.navigate(href as never);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.accent} />
      }
    >
      <View style={st.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={[st.headTitle, { color: colors.text }]}>Platform overview</Text>
          <Text style={[st.headSub, { color: colors.muted }]}>
            {s.onlineUsers} online · refreshes every minute
          </Text>
        </View>
        <Pressable
          style={[st.refreshBtn, { borderColor: colors.border }]}
          onPress={() => void refetch()}
        >
          <Text style={[st.refreshBtnText, { color: colors.subtext }]}>↻ Refresh</Text>
        </Pressable>
      </View>

      <AdminPlatformControls />

      <View style={st.statGrid}>
        <StatCard
          label="Total users"
          value={fmt(s.totalUsers)}
          hint={`+${fmt(s.newUsersLast7Days)} this week`}
          accent="#3b82f6"
          action="Open users →"
          onPress={() => nav("/admin/users")}
          colors={colors}
        />
        <StatCard
          label="Online now"
          value={fmt(s.onlineUsers)}
          hint="WebSocket presence"
          accent="#22c55e"
          action="See who's online →"
          onPress={() => nav("/admin/online-users")}
          colors={colors}
        />
        <StatCard
          label="Verified"
          value={fmt(s.verifiedUsers)}
          hint={`${verifyPct}% of users`}
          accent="#8b5cf6"
          colors={colors}
        />
        <StatCard
          label="Admins"
          value={fmt(s.totalAdmins)}
          accent="#64748b"
          action="Manage admins →"
          onPress={() => nav("/admin/admin-management")}
          colors={colors}
        />
        <StatCard
          label="Total posts"
          value={fmt(s.totalPosts)}
          hint={`+${fmt(s.postsLast7Days)} this week`}
          accent="#f59e0b"
          action="Manage posts →"
          onPress={() => nav("/admin/posts")}
          colors={colors}
        />
        <StatCard
          label="Total votes"
          value={fmt(s.totalVotes)}
          hint={`+${fmt(s.votesLast7Days)} this week`}
          accent="#f43f5e"
          colors={colors}
        />
        <StatCard
          label="Active voters (7d)"
          value={fmt(s.activeVotersLast7Days)}
          hint="Unique voters"
          accent="#10b981"
          colors={colors}
        />
        <StatCard
          label="Comments"
          value={fmt(s.totalComments)}
          accent="#64748b"
          colors={colors}
        />
        <StatCard
          label="Pending invites"
          value={fmt(s.pendingInvitations)}
          accent="#6366f1"
          action="View invites →"
          onPress={() => nav("/admin/invitations")}
          colors={colors}
        />
        <StatCard
          label="Reported posts"
          value={fmt(s.reportedPosts)}
          accent="#ef4444"
          action="Review reports →"
          onPress={() => nav("/admin/reports")}
          colors={colors}
        />
        <StatCard
          label="Campaign winners"
          value={fmt(s.campaignWinners)}
          accent="#eab308"
          colors={colors}
        />
      </View>

      <View style={[st.activitySection, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.sectionTitle, { color: colors.text }]}>Activity breakdown (14 days)</Text>
        <Text style={[st.sectionSub, { color: colors.muted }]}>
          Totals, trends, and daily counts
        </Text>

        <MetricSummaryCard title="Signups" metric="signups" days={days} summary={signupSummary} colors={colors} />
        <MetricSummaryCard title="Votes" metric="votes" days={days} summary={voteSummary} colors={colors} />
        <MetricSummaryCard title="Posts" metric="posts" days={days} summary={postSummary} colors={colors} />
        <MetricSummaryCard title="Comments" metric="comments" days={days} summary={commentSummary} colors={colors} />

        <StackedChart days={days} colors={colors} />
        <MetricBarChart metric="signups" days={days} summary={signupSummary} colors={colors} />
        <MetricBarChart metric="votes" days={days} summary={voteSummary} colors={colors} />
        <MetricBarChart metric="posts" days={days} summary={postSummary} colors={colors} />
        <MetricBarChart metric="comments" days={days} summary={commentSummary} colors={colors} />
        <ActivityTable days={days} colors={colors} />
      </View>

      <Text style={[st.sectionLabel, { color: colors.muted }]}>QUICK ACTIONS</Text>
      <View style={st.linkGrid}>
        {QUICK_LINKS.map((l) => (
          <Pressable
            key={l.href}
            style={({ pressed }) => [
              st.linkCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.88 : 1 },
            ]}
            onPress={() => nav(l.href)}
          >
            <Text style={st.linkEmoji}>{l.emoji}</Text>
            <Text style={[st.linkLabel, { color: colors.text }]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headTitle: { fontSize: 20, fontWeight: "800" },
  headSub: { fontSize: 12, marginTop: 4, fontWeight: "600" },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  refreshBtnText: { fontSize: 12, fontWeight: "700" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: 148,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    overflow: "hidden",
  },
  statAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  statLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  statValue: { fontSize: 24, fontWeight: "900", marginTop: 6, fontVariant: ["tabular-nums"] },
  statHint: { fontSize: 11, fontWeight: "600", marginTop: 4 },
  statAction: { fontSize: 11, fontWeight: "800", marginTop: 8 },
  activitySection: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  sectionSub: { fontSize: 12, fontWeight: "600", marginTop: -6, marginBottom: 4 },
  metricCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  metricHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  metricTitle: { fontSize: 13, fontWeight: "800" },
  trendPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCell: { width: "48%", flexGrow: 1, minWidth: 120 },
  metricK: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  metricV: { fontSize: 18, fontWeight: "900", marginTop: 2, fontVariant: ["tabular-nums"] },
  metricSub: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  metricFoot: { fontSize: 11, fontWeight: "600" },
  chartCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
  chartTitle: { fontSize: 13, fontWeight: "800" },
  chartSub: { fontSize: 11, fontWeight: "600", marginTop: 2, marginBottom: 8 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, minHeight: 88 },
  barCol: { flex: 1, alignItems: "center", gap: 3 },
  barValue: { fontSize: 8, fontWeight: "800", fontVariant: ["tabular-nums"], minHeight: 10 },
  barTrack: { width: "100%", height: 56, borderRadius: 6, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 6 },
  barLabel: { fontSize: 8, fontWeight: "700" },
  stackedBar: {
    width: "100%",
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "column-reverse",
    justifyContent: "flex-end",
  },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 10, fontWeight: "700" },
  tableWrap: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  tableTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
  tableRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  tableDate: { fontSize: 12, fontWeight: "700" },
  tableNums: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cellBarWrap: { width: "22%", minWidth: 62, gap: 3 },
  cellNum: { fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  cellTotal: { fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  cellTrack: { height: 3, borderRadius: 999, overflow: "hidden" },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  linkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  linkCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkEmoji: { fontSize: 18 },
  linkLabel: { fontSize: 13, fontWeight: "700" },
});
