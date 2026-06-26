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
  const pointsRoute = (isSelf ? "/points" : `/points/${userId}`) as `/${string}`;
  const campaignRoute = (
    wins.find((w) => w.campaignSlug)?.campaignSlug
      ? `/campaign/${wins.find((w) => w.campaignSlug)!.campaignSlug}`
      : "/tabs/world-cup"
  ) as `/${string}`;

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

        <Pressable style={[st.card, st.cardWins]} onPress={() => router.push(campaignRoute)}>
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
          <Text style={st.cardCta}>View ›</Text>
        </Pressable>

        <Pressable style={[st.card, st.cardPoints]} onPress={() => router.push(pointsRoute)}>
          <View style={st.iconPoints}>
            <Text style={st.iconPointsGlyph}>✦</Text>
          </View>
          <Text style={st.cardLabel}>Points</Text>
          <Text style={st.cardValue}>{referralPoints > 0 ? String(referralPoints) : "—"}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {referralPoints > 0
              ? isSelf
                ? "10 pts = 10 BDT"
                : "Invite rewards"
              : isSelf
                ? "Invite friends"
                : "No points"}
          </Text>
          <Text style={st.cardCta}>History ›</Text>
        </Pressable>
      </ScrollView>

      {isSelf ? (
        <View style={[st.actionsBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={st.redeemZone}>
            <TextInput
              style={[st.codeInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="Code"
              placeholderTextColor={colors.muted}
              value={redeemCode}
              onChangeText={(t) => setRedeemCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              returnKeyType="done"
              onSubmitEditing={() => void onRedeem()}
            />
            <Pressable
              style={[st.redeemBtn, { borderColor: colors.border }, (redeeming || !redeemCode.trim()) && st.btnDisabled]}
              onPress={() => void onRedeem()}
              disabled={redeeming || !redeemCode.trim()}
            >
              <Text style={[st.redeemBtnText, { color: colors.text }]}>{redeeming ? "…" : "Redeem"}</Text>
            </Pressable>
          </View>

          <View style={[st.vDivider, { backgroundColor: colors.border }]} />

          <Pressable
            style={[st.inviteBtn, { backgroundColor: colors.accent }]}
            onPressIn={() => {
              Keyboard.dismiss();
              setShowInvite(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend"
          >
            <Text style={st.inviteBtnLabel}>Invite</Text>
            <Text style={st.inviteBtnPts}>+{COIN_AMOUNTS.INVITE} pts</Text>
          </Pressable>
        </View>
      ) : null}
      {isSelf && redeemMsg ? (
        <Text style={[st.feedbackMsg, { color: colors.subtext }]} numberOfLines={2}>
          {redeemMsg}
        </Text>
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
    cardCta: {
      fontSize: 9,
      fontWeight: "800",
      color: c.muted,
      marginTop: 8,
      letterSpacing: 0.3,
    },
    actionsBar: {
      marginHorizontal: 16,
      marginTop: 10,
      flexDirection: "row",
      alignItems: "stretch",
      borderRadius: 14,
      borderWidth: 1,
      padding: 8,
      gap: 8,
    },
    redeemZone: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    },
    codeInput: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 9,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.8,
    },
    redeemBtn: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    redeemBtnText: { fontWeight: "800", fontSize: 12 },
    vDivider: { width: 1, alignSelf: "stretch", marginVertical: 2 },
    inviteBtn: {
      width: 76,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      paddingHorizontal: 6,
      gap: 1,
    },
    inviteBtnLabel: { color: "#fff", fontWeight: "800", fontSize: 14 },
    inviteBtnPts: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 10 },
    feedbackMsg: {
      marginHorizontal: 16,
      marginTop: 6,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },
    btnDisabled: { opacity: 0.45 },
  });
}
