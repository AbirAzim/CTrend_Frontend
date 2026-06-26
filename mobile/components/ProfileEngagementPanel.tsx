import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { USER_CAMPAIGN_WIN_SUMMARY } from "@ctrend/shared/graphql/campaigns";
import { CLAIM_DAILY_COINS, REFERRAL_POINTS } from "@ctrend/shared/graphql/coins";
import { REDEEM_REFERRAL_CODE } from "@ctrend/shared/graphql/referrals";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useCoins } from "../context/CoinsContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";
import { InviteFriendModal } from "./InviteFriendModal";

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
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const { data, loading } = useQuery<{ userCampaignWinSummary: CampaignWinRow[] }>(
    USER_CAMPAIGN_WIN_SUMMARY,
    { variables: { userId }, fetchPolicy: "cache-and-network" },
  );
  const { data: pointsData, refetch: refetchPoints } = useQuery<{ referralPoints: number }>(
    REFERRAL_POINTS,
    { variables: { userId }, fetchPolicy: "cache-and-network" },
  );
  const [claim, { loading: claiming }] = useMutation(CLAIM_DAILY_COINS);
  const [redeem, { loading: redeeming }] = useMutation(REDEEM_REFERRAL_CODE);

  const wins = data?.userCampaignWinSummary ?? [];
  const totalWins = wins.reduce((n, w) => n + w.wins, 0);
  const referralPoints = pointsData?.referralPoints ?? 0;
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

  async function onRedeem() {
    if (!isSelf) return;
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setRedeemMsg(null);
    try {
      const { data: res } = await redeem({ variables: { code } });
      const out = res?.redeemReferralCode;
      if (out?.inviteeCoins) {
        setRedeemMsg(`+${out.inviteeCoins} referral points!`);
        setRedeemCode("");
      } else {
        setRedeemMsg("Already redeemed or no reward.");
      }
      refresh();
      void refetchPoints();
    } catch (err) {
      setRedeemMsg(getApolloErrorMessage(err));
    }
  }

  return (
    <View style={st.wrap}>
      <Text style={st.kicker}>REWARDS & ACHIEVEMENTS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.grid}>
        <Pressable style={[st.card, st.cardCoins]} onPress={() => router.push(coinsRoute)}>
          <View style={st.iconCoin}>
            <Text style={st.iconCoinGlyph}>¢</Text>
          </View>
          <Text style={st.cardLabel}>Coins</Text>
          <Text style={st.cardValue}>{coins.toLocaleString()}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {isSelf ? "Activity & voting" : `${displayName ?? "Member"}`}
          </Text>
          {isSelf ? (
            <Pressable style={st.claimBtn} onPress={(e) => { e.stopPropagation?.(); void onClaim(); }} disabled={claiming}>
              <Text style={st.claimBtnText}>{claiming ? "…" : "📅 Daily"}</Text>
            </Pressable>
          ) : null}
          {claimMsg ? <Text style={st.claimMsg} numberOfLines={2}>{claimMsg}</Text> : null}
        </Pressable>

        <View style={[st.card, st.cardWins]}>
          <Text style={st.iconTrophy}>🏆</Text>
          <Text style={st.cardLabel}>Wins</Text>
          <Text style={st.cardValue}>{totalWins > 0 ? String(totalWins) : "—"}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {totalWins > 0 ? `${totalWins} victories` : isSelf ? "Match campaigns" : "No wins"}
          </Text>
          {loading && wins.length === 0 ? (
            <ActivityIndicator color="#d97706" size="small" style={{ marginTop: 6 }} />
          ) : wins.length > 0 ? (
            <Text style={st.winPreview} numberOfLines={1}>{wins[0]?.campaignName}</Text>
          ) : null}
        </View>

        <View style={[st.card, st.cardPoints]}>
          <View style={st.iconPoints}>
            <Text style={st.iconPointsGlyph}>✦</Text>
          </View>
          <Text style={st.cardLabel}>Points</Text>
          <Text style={st.cardValue}>{referralPoints > 0 ? String(referralPoints) : "—"}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {referralPoints > 0 ? "Invite rewards" : isSelf ? "Invite friends" : "No points"}
          </Text>
        </View>
      </ScrollView>

      {isSelf ? (
        <View style={[st.actions, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[st.actionsInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
            placeholder="Referral code"
            placeholderTextColor={colors.muted}
            value={redeemCode}
            onChangeText={(t) => setRedeemCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Pressable
            style={[st.actionsRedeem, { backgroundColor: colors.accent }, (redeeming || !redeemCode.trim()) && st.btnDisabled]}
            onPress={() => void onRedeem()}
            disabled={redeeming || !redeemCode.trim()}
          >
            <Text style={st.actionsRedeemText}>{redeeming ? "…" : "Redeem"}</Text>
          </Pressable>
          <Pressable
            style={[st.actionsInvite, { borderColor: colors.border }]}
            onPress={() => {
              Keyboard.dismiss();
              setShowInvite(true);
            }}
          >
            <Text style={[st.actionsInviteText, { color: colors.text }]}>+ Invite</Text>
          </Pressable>
          {redeemMsg ? <Text style={[st.actionsMsg, { color: colors.subtext }]} numberOfLines={2}>{redeemMsg}</Text> : null}
        </View>
      ) : null}

      <InviteFriendModal visible={showInvite} onClose={() => setShowInvite(false)} />
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginBottom: 14 },
    kicker: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: c.muted,
      marginBottom: 8,
      marginLeft: 18,
    },
    grid: { paddingHorizontal: 16, gap: 10 },
    card: {
      width: 132,
      borderRadius: 18,
      borderWidth: 1,
      padding: 12,
      minHeight: 168,
    },
    cardCoins: {
      borderColor: "rgba(245,197,24,0.38)",
      backgroundColor: "rgba(245,197,24,0.14)",
    },
    cardWins: {
      borderColor: "rgba(245,158,11,0.35)",
      backgroundColor: "rgba(245,158,11,0.1)",
    },
    cardPoints: {
      borderColor: "rgba(129,140,248,0.4)",
      backgroundColor: "rgba(99,102,241,0.14)",
    },
    iconCoin: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#f5c518",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    iconCoinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 20 },
    iconTrophy: { fontSize: 32, lineHeight: 36, marginBottom: 2 },
    iconPoints: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "#6366f1",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    iconPointsGlyph: { color: "#e0e7ff", fontWeight: "900", fontSize: 18 },
    cardLabel: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.muted,
    },
    cardValue: {
      fontSize: 24,
      fontWeight: "900",
      color: c.text,
      lineHeight: 28,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    cardSub: {
      fontSize: 10,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 14,
      marginTop: 2,
    },
    claimBtn: {
      alignSelf: "flex-start",
      marginTop: 8,
      backgroundColor: "#f5c518",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
    },
    claimBtnText: { color: "#7a4a05", fontWeight: "800", fontSize: 10 },
    claimMsg: { color: c.text, fontWeight: "700", fontSize: 9, marginTop: 4 },
    winPreview: { fontSize: 10, fontWeight: "700", color: c.text, marginTop: 6 },
    actions: {
      marginHorizontal: 16,
      marginTop: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      borderRadius: 14,
      borderWidth: 1,
      padding: 10,
    },
    actionsInput: {
      flexGrow: 1,
      flexBasis: 100,
      minWidth: 90,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.5,
    },
    actionsRedeem: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    actionsRedeemText: { color: "#fff", fontWeight: "800", fontSize: 12 },
    actionsInvite: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    actionsInviteText: { fontWeight: "800", fontSize: 12 },
    actionsMsg: { width: "100%", fontSize: 11, fontWeight: "600" },
    btnDisabled: { opacity: 0.45 },
  });
}
