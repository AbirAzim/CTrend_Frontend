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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ADMIN_PLATFORM_STATS } from "@ctrend/shared/graphql/admin";
import { useTheme } from "../../context/ThemeContext";

type Daily = { date: string; signups: number; posts: number; votes: number; comments: number };
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

function fmt(n: number) {
  return n.toLocaleString();
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatCard({
  label,
  value,
  hint,
  accent,
  colors,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[st.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[st.statAccent, { backgroundColor: accent }]} />
      <Text style={[st.statLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[st.statValue, { color: colors.text }]}>{value}</Text>
      {hint ? <Text style={[st.statHint, { color: colors.subtext }]}>{hint}</Text> : null}
    </View>
  );
}

function MiniChart({
  title,
  days,
  pick,
  color,
  colors,
}: {
  title: string;
  days: Daily[];
  pick: (d: Daily) => number;
  color: string;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const max = Math.max(1, ...days.map(pick));
  return (
    <View style={[st.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[st.chartTitle, { color: colors.text }]}>{title}</Text>
      <View style={st.chartRow}>
        {days.map((d) => {
          const v = pick(d);
          const h = Math.max(v > 0 ? 6 : 2, Math.round((v / max) * 52));
          return (
            <View key={d.date} style={st.barCol}>
              <View style={[st.barTrack, { backgroundColor: colors.section }]}>
                <View style={[st.barFill, { height: h, backgroundColor: color }]} />
              </View>
              <Text style={[st.barLabel, { color: colors.muted }]} numberOfLines={1}>
                {shortDate(d.date).split(" ")[1] ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const QUICK_LINKS = [
  { href: "/admin/users", label: "Users", emoji: "👥" },
  { href: "/admin/reports", label: "Reports", emoji: "🚩" },
  { href: "/admin/invitations", label: "Invites", emoji: "✉️" },
  { href: "/admin/world-cup", label: "World Cup", emoji: "⚽" },
] as const;

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refetch()} tintColor={colors.accent} />}
    >
      <View>
        <Text style={[st.headTitle, { color: colors.text }]}>Platform overview</Text>
        <Text style={[st.headSub, { color: colors.muted }]}>
          {s.onlineUsers} online · auto-refresh 1m
        </Text>
      </View>

      <View style={st.statGrid}>
        <StatCard label="Users" value={fmt(s.totalUsers)} hint={`+${fmt(s.newUsersLast7Days)} / 7d`} accent="#3b82f6" colors={colors} />
        <StatCard label="Online" value={fmt(s.onlineUsers)} accent="#22c55e" colors={colors} />
        <StatCard label="Verified" value={fmt(s.verifiedUsers)} hint={`${verifyPct}%`} accent="#8b5cf6" colors={colors} />
        <StatCard label="Admins" value={fmt(s.totalAdmins)} accent="#64748b" colors={colors} />
      </View>

      <View style={st.statGrid}>
        <StatCard label="Posts" value={fmt(s.totalPosts)} hint={`+${fmt(s.postsLast7Days)} / 7d`} accent="#f59e0b" colors={colors} />
        <StatCard label="Votes" value={fmt(s.totalVotes)} hint={`+${fmt(s.votesLast7Days)} / 7d`} accent="#f43f5e" colors={colors} />
        <StatCard label="Active voters" value={fmt(s.activeVotersLast7Days)} hint="7 days" accent="#10b981" colors={colors} />
        <StatCard label="Comments" value={fmt(s.totalComments)} accent="#64748b" colors={colors} />
      </View>

      <View style={st.statGrid}>
        <StatCard label="Pending invites" value={fmt(s.pendingInvitations)} accent="#6366f1" colors={colors} />
        <StatCard label="Reports" value={fmt(s.reportedPosts)} accent="#ef4444" colors={colors} />
        <StatCard label="Winners" value={fmt(s.campaignWinners)} accent="#eab308" colors={colors} />
      </View>

      <MiniChart title="Signups · 14d" days={days} pick={(d) => d.signups} color="#3b82f6" colors={colors} />
      <MiniChart title="Votes · 14d" days={days} pick={(d) => d.votes} color="#22c55e" colors={colors} />
      <MiniChart title="Posts · 14d" days={days} pick={(d) => d.posts} color="#f59e0b" colors={colors} />

      <Text style={[st.sectionLabel, { color: colors.muted }]}>QUICK LINKS</Text>
      <View style={st.linkGrid}>
        {QUICK_LINKS.map((l) => (
          <Pressable
            key={l.href}
            style={[st.linkCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.navigate(l.href as never)}
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
  headTitle: { fontSize: 20, fontWeight: "800" },
  headSub: { fontSize: 12, marginTop: 4, fontWeight: "600" },
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
  chartCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
  chartTitle: { fontSize: 13, fontWeight: "800", marginBottom: 10 },
  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 72 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barTrack: { width: "100%", height: 56, borderRadius: 6, justifyContent: "flex-end", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 6 },
  barLabel: { fontSize: 8, fontWeight: "700" },
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
