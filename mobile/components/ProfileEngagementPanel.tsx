import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { USER_CAMPAIGN_WIN_SUMMARY } from "@ctrend/shared/graphql/campaigns";
import { CLAIM_DAILY_COINS } from "@ctrend/shared/graphql/coins";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import { useCoins } from "../context/CoinsContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";

type CampaignWinRow = {
  campaignId?: string | null;
  campaignName: string;
  campaignSlug: string;
  wins: number;
  totalPrize: number;
};

export function ProfileEngagementPanel({
  userId,
  coins,
  isSelf,
  displayName,
}: {
  userId: string;
  coins: number;
  isSelf: boolean;
  displayName?: string;
}) {
  const { colors } = useTheme();
  const st = makeStyles(colors);
  const { refresh } = useCoins();
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const { data, loading } = useQuery<{ userCampaignWinSummary: CampaignWinRow[] }>(
    USER_CAMPAIGN_WIN_SUMMARY,
    { variables: { userId }, fetchPolicy: "cache-and-network" },
  );
  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);

  const wins = data?.userCampaignWinSummary ?? [];
  const totalWins = wins.reduce((n, w) => n + w.wins, 0);
  const coinsRoute = (isSelf ? "/coins" : `/coins/${userId}`) as `/${string}`;

  async function onClaim() {
    if (!isSelf) return;
    setClaimMsg(null);
    try {
      const { data: res } = await claim();
      const out = res?.claimDailyCoins;
      if (out?.awarded) {
        setClaimMsg(`+${COIN_AMOUNTS.DAILY_STREAK} · ${out.streakDays}-day streak`);
      } else {
        setClaimMsg("Already claimed today");
      }
      refresh();
    } catch {
      setClaimMsg("Couldn't claim bonus");
    }
  }

  return (
    <View style={st.wrap}>
      <Text style={st.kicker}>REWARDS & ACHIEVEMENTS</Text>
      <View style={st.grid}>
        <Pressable style={[st.card, st.cardCoins]} onPress={() => router.push(coinsRoute)}>
          <View style={st.iconCoin}>
            <Text style={st.iconCoinGlyph}>¢</Text>
          </View>
          <Text style={st.cardLabel}>Engagement coins</Text>
          <Text style={st.cardValue}>{coins.toLocaleString()}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {isSelf ? "Your earned balance" : `${displayName ?? "Member"}'s balance`}
          </Text>
          {isSelf ? (
            <Pressable style={st.claimBtn} onPress={(e) => { e.stopPropagation?.(); void onClaim(); }} disabled={claiming}>
              <Text style={st.claimBtnText}>{claiming ? "…" : "📅 Daily bonus"}</Text>
            </Pressable>
          ) : null}
          {claimMsg ? <Text style={st.claimMsg} numberOfLines={2}>{claimMsg}</Text> : null}
          <View style={st.cardSpacer} />
          <Text style={st.cardCta}>History ›</Text>
        </Pressable>

        <View style={[st.card, st.cardWins]}>
          <Text style={st.iconTrophy}>🏆</Text>
          <Text style={st.cardLabel}>Campaign wins</Text>
          <Text style={st.cardValue}>{totalWins > 0 ? String(totalWins) : "—"}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {totalWins > 0
              ? `${totalWins} ${totalWins === 1 ? "victory" : "victories"}`
              : isSelf
                ? "Vote in match posts"
                : "No victories yet"}
          </Text>
          <View style={st.winsBody}>
            {loading && wins.length === 0 ? (
              <ActivityIndicator color="#d97706" size="small" style={{ marginTop: 8 }} />
            ) : wins.length === 0 ? null : (
              wins.slice(0, 3).map((row, idx) => (
                <Pressable
                  key={row.campaignId ?? row.campaignName}
                  style={[st.winRow, idx === 0 && { marginTop: 6 }]}
                  disabled={!row.campaignSlug}
                  onPress={() => row.campaignSlug && router.push(`/campaign/${row.campaignSlug}` as `/${string}`)}
                >
                  <Text style={st.winName} numberOfLines={1}>{row.campaignName}</Text>
                  <View style={st.winBadge}>
                    <Text style={st.winBadgeText}>{row.wins}w</Text>
                  </View>
                </Pressable>
              ))
            )}
            {wins.length > 3 ? (
              <Text style={st.moreWins}>+{wins.length - 3} more</Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginHorizontal: 16, marginBottom: 14 },
    kicker: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: c.muted,
      marginBottom: 8,
      marginLeft: 2,
    },
    grid: { flexDirection: "row", gap: 10, alignItems: "stretch" },
    card: {
      flex: 1,
      minWidth: 0,
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      minHeight: 200,
      justifyContent: "flex-start",
    },
    cardCoins: {
      borderColor: "rgba(245,197,24,0.38)",
      backgroundColor: "rgba(245,197,24,0.14)",
    },
    cardWins: {
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.1)",
    },
    iconCoin: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: "#f5c518",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
      shadowColor: "#d99411",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 4,
    },
    iconCoinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 24 },
    iconTrophy: { fontSize: 36, lineHeight: 40, marginBottom: 4 },
    cardLabel: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.muted,
    },
    cardValue: {
      fontSize: 28,
      fontWeight: "900",
      color: c.text,
      lineHeight: 32,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    cardSub: {
      fontSize: 11,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 15,
      marginTop: 4,
    },
    claimBtn: {
      alignSelf: "flex-start",
      marginTop: 10,
      backgroundColor: "#f5c518",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    claimBtnText: { color: "#7a4a05", fontWeight: "800", fontSize: 11 },
    claimMsg: { color: c.text, fontWeight: "700", fontSize: 10, marginTop: 4 },
    cardSpacer: { flex: 1, minHeight: 8 },
    cardCta: { color: c.accent, fontWeight: "800", fontSize: 11 },
    winsBody: { flex: 1, marginTop: 4 },
    winRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    winName: { flex: 1, fontSize: 11, fontWeight: "700", color: c.text },
    winBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(245,197,24,0.5)",
      backgroundColor: "rgba(245,197,24,0.16)",
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    winBadgeText: { color: "#d97706", fontSize: 10, fontWeight: "900" },
    moreWins: { fontSize: 10, fontWeight: "700", color: c.muted, marginTop: 6 },
  });
}
