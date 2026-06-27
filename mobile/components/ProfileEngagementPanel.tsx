import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { USER_CAMPAIGN_WIN_SUMMARY } from "@ctrend/shared/graphql/campaigns";
import { CLAIM_DAILY_COINS, REFERRAL_POINTS } from "@ctrend/shared/graphql/coins";
import { REDEEM_REFERRAL_CODE } from "@ctrend/shared/graphql/referrals";
import { PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useCoins } from "../context/CoinsContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";
import { InviteFriendModal } from "./InviteFriendModal";
import { LeaderboardRankBadge } from "./LeaderboardRankBadge";
import { useCoinLeaderboardRank } from "../hooks/useCoinLeaderboardRank";

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
  const { data: settingsData } = useQuery<{ platformSettings: { referralSystemEnabled: boolean } }>(
    PLATFORM_SETTINGS,
    { fetchPolicy: "cache-first" },
  );
  const referralEnabled = Boolean(settingsData?.platformSettings?.referralSystemEnabled);
  const coinRank = useCoinLeaderboardRank(userId, coins);
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
      <View style={st.grid}>
        <Pressable style={[st.card, st.cardCoins]} onPress={() => router.push(coinsRoute)}>
          <View style={st.iconCoin}>
            <Text style={st.iconCoinGlyph}>¢</Text>
          </View>
          <Text style={st.cardLabel}>Coins</Text>
          <Text style={st.cardValue}>{coins.toLocaleString()}</Text>
          <Text style={st.cardSub} numberOfLines={2}>
            {isSelf ? "Activity & voting" : `${displayName ?? "Member"}`}
          </Text>
          {coinRank ? (
            <View style={st.rankChip}>
              <LeaderboardRankBadge rank={coinRank} size="sm" />
              <Text style={st.rankChipLabel}>Leaderboard</Text>
            </View>
          ) : null}
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

        {referralEnabled ? (
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
        ) : (
          <View style={[st.card, st.cardPoints, st.cardPointsPaused]} accessibilityState={{ disabled: true }}>
            <View style={st.pausedBadge}>
              <Text style={st.pausedBadgeText}>Paused</Text>
            </View>
            <View style={[st.iconPoints, st.iconPointsPaused]}>
              <Text style={st.iconPointsGlyph}>✦</Text>
            </View>
            <Text style={st.cardLabel}>Points</Text>
            <Text style={[st.cardValue, st.cardValuePaused]}>—</Text>
            <Text style={[st.cardSub, st.cardSubPaused]} numberOfLines={3}>
              {isSelf ? "Rewards paused · invite below" : "Unavailable"}
            </Text>
          </View>
        )}
      </View>

      {isSelf ? (
        <View style={[st.actionsBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {referralEnabled ? (
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
          ) : null}

          {referralEnabled ? (
            <View style={[st.vDivider, { backgroundColor: colors.border }]} />
          ) : null}

          <Pressable
            style={[st.inviteBtn, { backgroundColor: colors.accent }, !referralEnabled && st.inviteBtnFull]}
            onPressIn={() => {
              Keyboard.dismiss();
              setShowInvite(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Invite a friend"
          >
            <Text style={st.inviteBtnLabel}>Invite</Text>
            {referralEnabled ? (
              <Text style={st.inviteBtnPts}>+{COIN_AMOUNTS.INVITE} pts</Text>
            ) : null}
          </Pressable>
        </View>
      ) : null}
      {isSelf && referralEnabled && redeemMsg ? (
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
    wrap: { marginBottom: 14, alignSelf: "stretch", width: "100%" },
    kicker: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: c.muted,
      marginBottom: 8,
      marginHorizontal: 16,
    },
    grid: {
      flexDirection: "row",
      alignSelf: "stretch",
      width: "100%",
      paddingHorizontal: 16,
      gap: 8,
      alignItems: "stretch",
    },
    card: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      borderWidth: 1,
      padding: 10,
      minHeight: 156,
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
    cardPointsPaused: {
      borderColor: "rgba(129,140,248,0.28)",
      backgroundColor: "rgba(99,102,241,0.08)",
    },
    pausedBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: "rgba(99,102,241,0.18)",
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.3)",
    },
    pausedBadgeText: {
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: "#818cf8",
    },
    iconCoin: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#f5c518",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    iconCoinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 17 },
    iconTrophy: { fontSize: 28, lineHeight: 32, marginBottom: 2 },
    iconPoints: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "#6366f1",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    iconPointsGlyph: { color: "#e0e7ff", fontWeight: "900", fontSize: 16 },
    iconPointsPaused: { backgroundColor: "rgba(99,102,241,0.45)", opacity: 0.75 },
    cardLabel: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.muted,
      alignSelf: "stretch",
    },
    cardValue: {
      fontSize: 20,
      fontWeight: "900",
      color: c.text,
      lineHeight: 24,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
      alignSelf: "stretch",
    },
    cardValuePaused: { color: c.muted, opacity: 0.85 },
    cardSub: {
      fontSize: 9,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 13,
      marginTop: 2,
    },
    cardSubPaused: { color: c.muted, lineHeight: 12 },
    rankChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      alignSelf: "flex-start",
      marginTop: 6,
      paddingVertical: 3,
      paddingRight: 7,
      paddingLeft: 3,
      borderRadius: 999,
      backgroundColor: "rgba(245,197,24,0.14)",
      borderWidth: 1,
      borderColor: "rgba(245,197,24,0.32)",
    },
    rankChipLabel: {
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: "#d99411",
    },
    claimBtn: {
      alignSelf: "flex-start",
      marginTop: 8,
      backgroundColor: "#f5c518",
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 999,
    },
    claimBtnText: { color: "#7a4a05", fontWeight: "800", fontSize: 9 },
    claimMsg: { color: c.text, fontWeight: "700", fontSize: 9, marginTop: 4 },
    winPreview: { fontSize: 10, fontWeight: "700", color: c.text, marginTop: 6 },
    cardCta: {
      fontSize: 8,
      fontWeight: "800",
      color: c.muted,
      marginTop: "auto" as const,
      paddingTop: 6,
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
    inviteBtnFull: { flex: 1, width: undefined },
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
