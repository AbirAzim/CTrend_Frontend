import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@apollo/client/react";
import { REFERRAL_POINTS } from "@ctrend/shared/graphql/coins";
import { REFERRAL_POINTS_HISTORY } from "@ctrend/shared/graphql/referrals";
import { COIN_AMOUNTS, COIN_META, type CoinType } from "@ctrend/shared/lib/coins";
import { formatRelativeTime } from "@ctrend/shared/lib/formatRelativeTime";
import { formatPointsBdt } from "@ctrend/shared/lib/referralInvite";
import { referralHistoryLabel } from "@ctrend/shared/lib/referralHistory";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ColorPalette } from "../context/ThemeContext";
import { useTabBar } from "../context/TabBarContext";
import { BottomNav } from "./BottomNav";

type HistoryItem = {
  id: string;
  type: CoinType;
  amount: number;
  createdAt: string;
  relatedUserId?: string | null;
  relatedUserName?: string | null;
};

const PAGE = 30;
const REFERRAL_TYPES: CoinType[] = ["INVITE", "REFERRAL_INVITEE"];
type Tab = "history" | "earn";

export function PointsHub({ userId }: { userId?: string }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { translateY } = useTabBar();
  const st = makeStyles(colors);
  const isSelf = !userId || userId === user?.id;
  const targetId = userId ?? user?.id ?? "";

  useEffect(() => {
    translateY.setValue(0);
  }, [translateY]);

  const [tab, setTab] = useState<Tab>("history");

  const { data: pointsData } = useQuery<{ referralPoints: number }>(REFERRAL_POINTS, {
    variables: { userId: targetId },
    skip: !targetId,
    fetchPolicy: "cache-and-network",
  });

  const { data: histData, fetchMore, loading: histLoading } = useQuery<{
    referralPointsHistory: HistoryItem[];
  }>(REFERRAL_POINTS_HISTORY, {
    variables: { userId: userId ?? null, skip: 0, take: PAGE },
    skip: !targetId,
    fetchPolicy: "cache-and-network",
  });

  const balance = pointsData?.referralPoints ?? 0;
  const history = histData?.referralPointsHistory ?? [];
  const canLoadMore = history.length > 0 && history.length % PAGE === 0;
  const earnedTotal = useMemo(
    () => history.reduce((a, h) => a + h.amount, 0),
    [history],
  );
  const displayBalance = isSelf ? balance : earnedTotal;

  const header = (
    <View>
      <View style={st.hero}>
        <View style={st.heroIcon}>
          <Text style={st.heroIconGlyph}>✦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.heroLabel}>{isSelf ? "YOUR POINTS" : "REFERRAL POINTS"}</Text>
          <Text style={st.heroBalance}>{displayBalance}</Text>
          {displayBalance > 0 && (
            <Text style={st.heroBdt}>≈ {formatPointsBdt(displayBalance)} withdrawable</Text>
          )}
          {isSelf && (
            <Text style={st.heroNote}>
              10 points = 10 BDT when you withdraw. Invite friends or redeem a code from your profile.
            </Text>
          )}
        </View>
      </View>

      <View style={st.tabs}>
        {(["history", "earn"] as const).map((t) => (
          <Pressable
            key={t}
            style={[st.tab, tab === t && st.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>
              {t === "history" ? "History" : "How to earn"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  function renderHistory(h: HistoryItem) {
    const meta = COIN_META[h.type] ?? { label: h.type, icon: "✦" };
    const label = referralHistoryLabel(h.type, h.relatedUserName);
    return (
      <View style={st.row}>
        <View style={st.rowIcon}>
          <Text style={st.rowIconText}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.rowLabel}>{label}</Text>
          <Text style={st.rowTime}>{formatRelativeTime(h.createdAt)}</Text>
        </View>
        <View style={st.amountCol}>
          <Text style={st.rowAmount}>+{h.amount}</Text>
          <Text style={st.rowBdt}>{formatPointsBdt(h.amount)}</Text>
        </View>
      </View>
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

  const listData = tab === "history" ? history : REFERRAL_TYPES;
  const emptyMsg =
    tab === "history"
      ? histLoading
        ? ""
        : isSelf
          ? "No referral points yet. Invite friends or redeem a code!"
          : "No referral points yet."
      : "";

  return (
    <View style={[st.flex, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[st.topRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[st.back, { color: colors.muted }]}>← Back</Text>
        </Pressable>
        <Text style={st.screenTitle}>Points</Text>
        <View style={{ width: 56 }} />
      </View>

      <FlatList
        style={st.flex}
        data={listData}
        keyExtractor={(item) => (typeof item === "string" ? item : item.id)}
        renderItem={({ item }) =>
          tab === "history" ? renderHistory(item as HistoryItem) : renderEarn(item as CoinType)
        }
        ListHeaderComponent={header}
        ListFooterComponent={
          tab === "earn" ? (
            <View style={st.earnFooter}>
              <Text style={st.withdrawNote}>Withdraw at 10 points = 10 BDT.</Text>
              {isSelf && (
                <Pressable onPress={() => router.push("/tabs/profile" as `/${string}`)}>
                  <Text style={st.profileLink}>Go to profile to invite or redeem ›</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ height: 16 }} />
          )
        }
        onEndReached={() => {
          if (tab !== "history" || !canLoadMore || histLoading) return;
          void fetchMore({
            variables: { userId: userId ?? null, skip: history.length, take: PAGE },
            updateQuery: (prev, { fetchMoreResult }) =>
              fetchMoreResult
                ? {
                    referralPointsHistory: [
                      ...(prev.referralPointsHistory ?? []),
                      ...fetchMoreResult.referralPointsHistory,
                    ],
                  }
                : prev,
          });
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={emptyMsg ? <Text style={st.empty}>{emptyMsg}</Text> : null}
        contentContainerStyle={{ padding: 14, flexGrow: 1 }}
      />
      <BottomNav />
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
    back: { fontSize: 15, fontWeight: "700", width: 56 },
    screenTitle: { fontSize: 17, fontWeight: "800", color: c.text },
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      padding: 18,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: "rgba(129,140,248,0.4)",
      backgroundColor: "rgba(99,102,241,0.12)",
      marginBottom: 14,
    },
    heroIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#6366f1",
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconGlyph: { color: "#e0e7ff", fontWeight: "900", fontSize: 24 },
    heroLabel: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
      color: c.muted,
    },
    heroBalance: {
      fontSize: 32,
      fontWeight: "900",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    heroBdt: {
      fontSize: 14,
      fontWeight: "800",
      color: "#6366f1",
      marginTop: 2,
    },
    heroNote: {
      fontSize: 11,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 15,
      marginTop: 6,
    },
    tabs: { flexDirection: "row", gap: 6, marginBottom: 10 },
    tab: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: "center",
      backgroundColor: c.section,
    },
    tabActive: { backgroundColor: "rgba(99,102,241,0.18)" },
    tabText: { fontWeight: "800", fontSize: 12, color: c.muted },
    tabTextActive: { color: c.text },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
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
    rowLabel: { fontWeight: "700", fontSize: 14, color: c.text },
    rowTime: { fontSize: 11, color: c.muted, marginTop: 2 },
    amountCol: { alignItems: "flex-end" },
    rowAmount: { fontWeight: "900", fontSize: 15, color: "#6366f1" },
    rowBdt: { fontSize: 10, fontWeight: "700", color: c.muted, marginTop: 2 },
    empty: { textAlign: "center", color: c.muted, padding: 32, fontSize: 14 },
    earnFooter: { marginTop: 8, gap: 8 },
    withdrawNote: { fontSize: 12, fontWeight: "700", color: c.subtext, textAlign: "center" },
    profileLink: {
      fontSize: 13,
      fontWeight: "800",
      color: "#6366f1",
      textAlign: "center",
    },
  });
}
