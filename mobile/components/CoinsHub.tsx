import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  CLAIM_DAILY_COINS,
  COIN_HISTORY,
  COIN_LEADERBOARD,
} from "@ctrend/shared/graphql/coins";
import { COIN_AMOUNTS, COIN_META, type CoinType } from "@ctrend/shared/lib/coins";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import { useAuth } from "../context/AuthContext";
import { useCoins } from "../context/CoinsContext";
import { useTheme, type ColorPalette } from "../context/ThemeContext";

type HistoryItem = { id: string; type: CoinType; amount: number; createdAt: string };
type LeaderRow = {
  rank: number;
  coins: number;
  user: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

const PAGE = 30;
type Tab = "history" | "leaderboard" | "earn";

const EARN_ORDER: CoinType[] = [
  "INVITE",
  "PREDICTION_CORRECT",
  "CAMPAIGN_WINNER",
  "POST",
  "PREDICTION",
  "VOTE_WINNER",
  "VOTE",
  "HYPE",
  "DAILY_STREAK",
  "COMMENT",
  "POST_VOTED",
  "POST_HYPED",
];

export function CoinsHub({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const { balance, refresh } = useCoins();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const st = makeStyles(colors);
  const isSelf = !userId || userId === user?.id;

  const [tab, setTab] = useState<Tab>("history");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const { data: histData, fetchMore, loading: histLoading } = useQuery<{
    coinHistory: HistoryItem[];
  }>(COIN_HISTORY, {
    variables: { userId: userId ?? null, skip: 0, take: PAGE },
    fetchPolicy: "cache-and-network",
  });

  const { data: lbData, loading: lbLoading } = useQuery<{
    coinLeaderboard: LeaderRow[];
  }>(COIN_LEADERBOARD, {
    variables: { take: 50 },
    skip: tab !== "leaderboard",
    fetchPolicy: "cache-and-network",
  });

  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);

  const history = histData?.coinHistory ?? [];
  const leaderboard = lbData?.coinLeaderboard ?? [];
  const canLoadMore = history.length > 0 && history.length % PAGE === 0;
  const earnedTotal = useMemo(
    () => history.reduce((a, h) => a + h.amount, 0),
    [history],
  );

  async function onClaim() {
    setClaimMsg(null);
    try {
      const { data } = await claim();
      const res = (data as { claimDailyCoins?: { awarded: number; streakDays: number } } | undefined)
        ?.claimDailyCoins;
      if (res?.awarded) {
        setClaimMsg(`+${COIN_AMOUNTS.DAILY_STREAK} coins! ${res.streakDays}-day streak 🔥`);
      } else {
        setClaimMsg("Already claimed today — come back tomorrow!");
      }
      refresh();
    } catch {
      setClaimMsg("Couldn't claim right now.");
    }
  }

  const header = (
    <View>
      <View style={st.hero}>
        <View style={st.heroCoin}>
          <Text style={st.heroCoinGlyph}>¢</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.heroLabel}>{isSelf ? "YOUR COINS" : "COINS EARNED"}</Text>
          <Text style={st.heroBalance}>{isSelf ? (balance ?? 0) : earnedTotal}</Text>
          {isSelf && (
            <Pressable style={st.claimBtn} onPress={() => void onClaim()} disabled={claiming}>
              <Text style={st.claimBtnText}>
                {claiming ? "Claiming…" : "📅 Claim daily bonus"}
              </Text>
            </Pressable>
          )}
          {claimMsg && <Text style={st.claimMsg}>{claimMsg}</Text>}
        </View>
      </View>

      <View style={st.tabs}>
        {(["history", "leaderboard", "earn"] as const).map((t) => (
          <Pressable
            key={t}
            style={[st.tab, tab === t && st.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>
              {t === "history" ? "History" : t === "leaderboard" ? "🏆 Leaderboard" : "How to earn"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  function renderHistory(h: HistoryItem) {
    const meta = COIN_META[h.type] ?? { label: h.type, icon: "¢" };
    return (
      <View style={st.row}>
        <View style={st.rowIcon}>
          <Text style={st.rowIconText}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.rowLabel}>{meta.label}</Text>
          <Text style={st.rowTime}>{formatRelativeTime(h.createdAt)}</Text>
        </View>
        <Text style={st.rowAmount}>+{h.amount}</Text>
      </View>
    );
  }

  function renderLeader(row: LeaderRow) {
    const u = row.user;
    const name = u?.displayName?.trim() || u?.username || "User";
    const isMe = !!u?.id && u.id === user?.id;
    const img = normalizeProfileImageUrl(u?.profileImageUrl ?? null);
    const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
    return (
      <Pressable
        style={[st.lbRow, isMe && st.lbRowMe]}
        onPress={() => u?.id && router.push(`/coins/${u.id}` as `/${string}`)}
      >
        <Text style={st.lbRank}>{medal ?? `#${row.rank}`}</Text>
        <View style={st.lbAvatar}>
          {img ? (
            <Image source={{ uri: img }} style={st.lbAvatarImg} />
          ) : (
            <Text style={st.lbAvatarFallback}>{name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text style={st.lbName} numberOfLines={1}>
          {name}
          {isMe ? " (you)" : ""}
        </Text>
        <Text style={st.lbCoins}>¢ {row.coins}</Text>
      </Pressable>
    );
  }

  function renderEarn(t: CoinType) {
    return (
      <View style={st.row}>
        <View style={st.rowIcon}>
          <Text style={st.rowIconText}>{COIN_META[t].icon}</Text>
        </View>
        <Text style={[st.rowLabel, { flex: 1 }]}>{COIN_META[t].label}</Text>
        <Text style={st.rowAmount}>+{COIN_AMOUNTS[t]}</Text>
      </View>
    );
  }

  const listProps =
    tab === "history"
      ? {
          data: history as HistoryItem[],
          keyExtractor: (h: HistoryItem) => h.id,
          renderItem: ({ item }: { item: HistoryItem }) => renderHistory(item),
          onEndReached: () => {
            if (!canLoadMore || histLoading) return;
            void fetchMore({
              variables: { userId: userId ?? null, skip: history.length, take: PAGE },
              updateQuery: (prev, { fetchMoreResult }) =>
                fetchMoreResult
                  ? {
                      coinHistory: [
                        ...(prev.coinHistory ?? []),
                        ...fetchMoreResult.coinHistory,
                      ],
                    }
                  : prev,
            });
          },
          empty: histLoading ? "" : isSelf
            ? "No coins yet. Start hyping, voting and posting to earn!"
            : "Nothing here yet.",
        }
      : tab === "leaderboard"
        ? {
            data: leaderboard as LeaderRow[],
            keyExtractor: (r: LeaderRow) => r.user?.id ?? String(r.rank),
            renderItem: ({ item }: { item: LeaderRow }) => renderLeader(item),
            onEndReached: () => {},
            empty: lbLoading ? "" : "No one has earned coins yet.",
          }
        : {
            data: EARN_ORDER as CoinType[],
            keyExtractor: (t: CoinType) => t,
            renderItem: ({ item }: { item: CoinType }) => renderEarn(item),
            onEndReached: () => {},
            empty: "",
          };

  return (
    <View style={[st.flex, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[st.topRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[st.back, { color: colors.muted }]}>← Back</Text>
        </Pressable>
        <Text style={st.screenTitle}>Coins</Text>
        <View style={{ width: 56 }} />
      </View>

      <FlatList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={listProps.data as any[]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        keyExtractor={listProps.keyExtractor as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderItem={listProps.renderItem as any}
        ListHeaderComponent={header}
        onEndReached={listProps.onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          listProps.empty ? (
            <Text style={st.empty}>{listProps.empty}</Text>
          ) : null
        }
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 40 }}
      />
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingBottom: 8,
    },
    back: { fontSize: 15, fontWeight: "600", width: 56 },
    screenTitle: { fontSize: 17, fontWeight: "800", color: c.text },
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(245,197,24,0.32)",
      backgroundColor: "rgba(245,197,24,0.12)",
    },
    heroCoin: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: "#f5c518",
      alignItems: "center",
      justifyContent: "center",
    },
    heroCoinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 28 },
    heroLabel: { color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
    heroBalance: { color: c.text, fontSize: 34, fontWeight: "900", lineHeight: 38 },
    claimBtn: {
      alignSelf: "flex-start",
      marginTop: 8,
      backgroundColor: "#f5c518",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
    },
    claimBtnText: { color: "#7a4a05", fontWeight: "800", fontSize: 13 },
    claimMsg: { color: c.text, fontWeight: "700", fontSize: 12, marginTop: 8 },
    tabs: { flexDirection: "row", gap: 6, marginTop: 18, marginBottom: 12 },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.section,
      alignItems: "center",
    },
    tabActive: { backgroundColor: "rgba(245,197,24,0.18)" },
    tabText: { color: c.muted, fontWeight: "800", fontSize: 12.5 },
    tabTextActive: { color: c.text },
    empty: { color: c.muted, textAlign: "center", paddingVertical: 30, fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      marginBottom: 6,
    },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.section,
      alignItems: "center",
      justifyContent: "center",
    },
    rowIconText: { fontSize: 18 },
    rowLabel: { color: c.text, fontWeight: "700", fontSize: 14 },
    rowTime: { color: c.muted, fontSize: 12, marginTop: 1 },
    rowAmount: { color: "#e0a500", fontWeight: "900", fontSize: 15 },
    lbRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: 12,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      marginBottom: 6,
    },
    lbRowMe: { borderColor: "rgba(245,197,24,0.5)", backgroundColor: "rgba(245,197,24,0.10)" },
    lbRank: { width: 34, textAlign: "center", fontWeight: "900", fontSize: 15, color: c.muted },
    lbAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: "hidden",
      backgroundColor: c.section,
      alignItems: "center",
      justifyContent: "center",
    },
    lbAvatarImg: { width: "100%", height: "100%" },
    lbAvatarFallback: { color: c.muted, fontWeight: "800" },
    lbName: { flex: 1, color: c.text, fontWeight: "700", fontSize: 14 },
    lbCoins: { color: "#e0a500", fontWeight: "900", fontSize: 14 },
  });
}
