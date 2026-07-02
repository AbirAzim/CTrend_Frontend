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
import { CLAIM_DAILY_COINS, REFERRAL_POINTS, MONTHLY_PODIUM_STATS } from "@ctrend/shared/graphql/coins";
import { REDEEM_REFERRAL_CODE } from "@ctrend/shared/graphql/referrals";
import { PLATFORM_SETTINGS } from "@ctrend/shared/graphql/admin";
import { COIN_AMOUNTS } from "@ctrend/shared/lib/coins";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { useCoins } from "../context/CoinsContext";
import { useTheme } from "../context/ThemeContext";
import type { ColorPalette } from "../context/ThemeContext";
import { InviteFriendModal } from "./InviteFriendModal";
import { LeaderboardRankBadge } from "./LeaderboardRankBadge";
import { MonthlyPodiumBadge } from "./MonthlyPodiumBadge";
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
}: {
  userId: string;
  coins: number;
  isSelf: boolean;
}) {
  const { colors, isDark } = useTheme();
  const st = makeStyles(colors, isDark);
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
  const { data: podiumData } = useQuery<{
    monthlyPodiumStats: {
      firstPlaceCount: number;
      secondPlaceCount: number;
      thirdPlaceCount: number;
    };
  }>(MONTHLY_PODIUM_STATS, {
    variables: { userId },
    fetchPolicy: "cache-and-network",
  });
  const referralEnabled = Boolean(settingsData?.platformSettings?.referralSystemEnabled);
  const podiumStats = podiumData?.monthlyPodiumStats ?? {
    firstPlaceCount: 0,
    secondPlaceCount: 0,
    thirdPlaceCount: 0,
  };
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
          <View style={st.cardTop}>
            <View style={st.cardTopText}>
              <Text style={st.cardLabel}>Engagement coins</Text>
              <Text style={st.cardValue}>{coins.toLocaleString()}</Text>
            </View>
            <View style={st.iconCoin}>
              <Text style={st.iconCoinGlyph}>¢</Text>
            </View>
          </View>

          <View style={st.cardMiddle}>
            <View style={st.coinStats}>
            <View style={[st.statBox, st.statBoxRank]}>
              <Text style={st.statKicker}>This month</Text>
              {coinRank ? (
                <LeaderboardRankBadge rank={coinRank} size="sm" />
              ) : (
                <Text style={st.statEmpty}>—</Text>
              )}
            </View>
            <View style={[st.statBox, st.statBoxPodium]}>
              <Text style={st.statKicker}>Podiums</Text>
              <MonthlyPodiumBadge stats={podiumStats} layout="grid" />
            </View>
            </View>
          </View>

          <View style={st.cardFoot}>
            {isSelf ? (
              <Pressable
                style={st.claimBtn}
                onPress={(e) => {
                  e.stopPropagation?.();
                  void onClaim();
                }}
                disabled={claiming}
              >
                <Text style={st.claimBtnText}>{claiming ? "…" : "📅 Daily"}</Text>
              </Pressable>
            ) : null}
            <View style={st.footAction}>
              <Text style={st.footActionText}>History →</Text>
            </View>
          </View>
        </Pressable>

        <Pressable style={[st.card, st.cardWins]} onPress={() => router.push(campaignRoute)}>
          <View style={st.cardTop}>
            <View style={st.cardTopText}>
              <Text style={st.cardLabel}>Campaign wins</Text>
              <Text style={st.cardValue}>{totalWins > 0 ? String(totalWins) : "—"}</Text>
              <Text style={st.cardSub} numberOfLines={1}>
                {totalWins > 0 ? `${totalWins} wins` : isSelf ? "Match posts" : "None yet"}
              </Text>
            </View>
            <Text style={st.iconTrophy}>🏆</Text>
          </View>

          <View style={st.cardBody}>
            {loading && wins.length === 0 ? (
              <ActivityIndicator color="#d97706" size="small" />
            ) : wins.length > 0 ? (
              <View style={st.winRow}>
                <Text style={st.winName} numberOfLines={1}>
                  {wins[0]?.campaignName}
                </Text>
                <View style={st.winBadge}>
                  <Text style={st.winBadgeText}>{wins[0]?.wins}w</Text>
                </View>
              </View>
            ) : (
              <Text style={st.bodyHint}>Vote in campaigns to win</Text>
            )}
          </View>

          <View style={st.cardFoot}>
            <View style={[st.footAction, st.footActionWins]}>
              <Text style={st.footActionTextWins}>Campaigns →</Text>
            </View>
          </View>
        </Pressable>

        {referralEnabled ? (
          <Pressable style={[st.card, st.cardPoints]} onPress={() => router.push(pointsRoute)}>
            <View style={st.cardTop}>
              <View style={st.cardTopText}>
                <Text style={st.cardLabel}>Referral points</Text>
                <Text style={st.cardValue}>{referralPoints > 0 ? String(referralPoints) : "—"}</Text>
                <Text style={st.cardSub} numberOfLines={1}>
                  {referralPoints > 0
                    ? isSelf
                      ? "10 pts = 10 BDT"
                      : "Invite rewards"
                    : isSelf
                      ? "Invite friends"
                      : "None yet"}
                </Text>
              </View>
              <View style={st.iconPoints}>
                <Text style={st.iconPointsGlyph}>✦</Text>
              </View>
            </View>

            <View style={st.cardBody}>
              <Text style={st.bodyHint}>
                {isSelf ? "Earn from invites & codes" : "Referral balance"}
              </Text>
            </View>

            <View style={st.cardFoot}>
              <View style={[st.footAction, st.footActionPoints]}>
                <Text style={st.footActionTextPoints}>History →</Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={[st.card, st.cardPoints, st.cardPointsPaused]} accessibilityState={{ disabled: true }}>
            <View style={st.cardTop}>
              <View style={st.cardTopText}>
                <Text style={st.cardLabel}>Referral points</Text>
                <Text style={[st.cardValue, st.cardValuePaused]}>—</Text>
                <Text style={[st.cardSub, st.cardSubPaused]} numberOfLines={1}>
                  Referral rewards are paused
                </Text>
              </View>
              <View style={[st.iconPoints, st.iconPointsPaused]}>
                <Text style={st.iconPointsGlyph}>✦</Text>
              </View>
            </View>

            <View style={st.cardBody}>
              <View style={st.pausedChip}>
                <Text style={st.pausedChipText}>Paused</Text>
              </View>
            </View>

            <View style={st.cardFoot}>
              <View style={[st.footAction, st.footActionPoints, st.footActionDisabled]}>
                <Text style={st.footActionTextDisabled}>Unavailable →</Text>
              </View>
            </View>
          </View>
        )}
      </View>
      {isSelf && claimMsg ? (
        <Text style={st.feedbackMsg} numberOfLines={1}>
          {claimMsg}
        </Text>
      ) : null}

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

          {referralEnabled ? <View style={[st.vDivider, { backgroundColor: colors.border }]} /> : null}

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
            {referralEnabled ? <Text style={st.inviteBtnPts}>+{COIN_AMOUNTS.INVITE} pts</Text> : null}
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

function makeStyles(c: ColorPalette, isDark: boolean) {
  const footBg = isDark ? "rgba(0,0,0,0.48)" : "rgba(255,255,255,0.72)";
  const statBg = isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.55)";
  const innerBg = isDark ? "rgba(0,0,0,0.38)" : "rgba(255,255,255,0.55)";

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
      paddingHorizontal: 12,
      gap: 6,
      alignItems: "stretch",
    },
    card: {
      flex: 1,
      minWidth: 0,
      borderRadius: 14,
      borderWidth: 1,
      padding: 8,
      aspectRatio: 1,
      overflow: "hidden",
      flexDirection: "column",
    },
    cardCoins: {
      borderColor: "rgba(245,197,24,0.42)",
      backgroundColor: "rgba(245,197,24,0.14)",
    },
    cardWins: {
      borderColor: "rgba(245,158,11,0.38)",
      backgroundColor: "rgba(245,158,11,0.1)",
    },
    cardPoints: {
      borderColor: "rgba(129,140,248,0.44)",
      backgroundColor: "rgba(99,102,241,0.14)",
    },
    cardPointsPaused: {
      borderColor: "rgba(129,140,248,0.44)",
      backgroundColor: "rgba(99,102,241,0.1)",
      opacity: 0.95,
    },
    cardTop: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 8,
      minWidth: 0,
    },
    cardTopText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    cardLabel: {
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.subtext,
    },
    cardValue: {
      fontSize: 17,
      fontWeight: "900",
      color: c.text,
      lineHeight: 20,
      marginTop: 0,
      fontVariant: ["tabular-nums"],
    },
    cardValuePaused: { color: c.muted, opacity: 0.85 },
    cardSub: {
      fontSize: 8,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 11,
      marginTop: 0,
    },
    cardSubPaused: { color: c.muted },
    iconCoin: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#f5c518",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    iconCoinGlyph: { color: "#7a4a05", fontWeight: "900", fontSize: 13 },
    iconTrophy: { fontSize: 20, lineHeight: 22, flexShrink: 0 },
    iconPoints: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#6366f1",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    iconPointsGlyph: { color: "#e0e7ff", fontWeight: "900", fontSize: 12 },
    iconPointsPaused: { backgroundColor: "rgba(99,102,241,0.45)", opacity: 0.8 },
    cardMiddle: {
      flex: 1,
      justifyContent: "center",
      minHeight: 0,
      minWidth: 0,
      marginTop: 4,
    },
    coinStats: {
      flexDirection: "row",
      gap: 4,
      minWidth: 0,
      alignSelf: "stretch",
      width: "100%",
    },
    statBox: {
      minWidth: 0,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 3,
      paddingVertical: 3,
      gap: 2,
      overflow: "visible",
    },
    statBoxRank: {
      width: 34,
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: statBg,
      borderColor: isDark ? "rgba(251,191,36,0.42)" : "rgba(245,197,24,0.28)",
      alignItems: "center",
    },
    statBoxPodium: {
      flex: 1,
      minWidth: 52,
      backgroundColor: statBg,
      borderColor: isDark ? "rgba(251,191,36,0.36)" : "rgba(245,197,24,0.22)",
      overflow: "visible",
    },
    statKicker: {
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.35,
      textTransform: "uppercase",
      color: c.subtext,
    },
    statEmpty: {
      fontSize: 12,
      fontWeight: "800",
      color: c.text,
      lineHeight: 14,
    },
    cardBody: {
      flex: 1,
      justifyContent: "flex-start",
      minHeight: 0,
      minWidth: 0,
      marginTop: 4,
    },
    bodyHint: {
      fontSize: 8,
      fontWeight: "600",
      color: c.subtext,
      lineHeight: 11,
    },
    winRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? "rgba(251,146,60,0.38)" : "rgba(245,158,11,0.22)",
      backgroundColor: innerBg,
      paddingHorizontal: 5,
      paddingVertical: 4,
      minWidth: 0,
    },
    winName: {
      flex: 1,
      minWidth: 0,
      fontSize: 8,
      fontWeight: "700",
      color: c.text,
    },
    winBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "rgba(251,191,36,0.55)" : "rgba(245,197,24,0.5)",
      backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.12)",
      paddingHorizontal: 4,
      paddingVertical: 1,
      flexShrink: 0,
    },
    winBadgeText: { fontSize: 7, fontWeight: "900", color: isDark ? "#fcd34d" : "#b45309" },
    pausedChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(129,140,248,0.38)",
      backgroundColor: "rgba(99,102,241,0.16)",
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    pausedChipText: {
      fontSize: 7,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
      color: isDark ? "#e0e7ff" : "#4338ca",
    },
    cardFoot: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: "auto" as const,
      minWidth: 0,
      flexShrink: 0,
      paddingTop: 4,
    },
    claimBtn: {
      flexShrink: 0,
      backgroundColor: "#f5c518",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderRadius: 8,
      minHeight: 30,
      justifyContent: "center",
    },
    claimBtnText: { color: "#7a4a05", fontWeight: "800", fontSize: 8 },
    footAction: {
      flex: 1,
      minWidth: 0,
      minHeight: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? "rgba(251,191,36,0.5)" : "rgba(245,197,24,0.45)",
      backgroundColor: footBg,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    footActionWins: {
      borderColor: isDark ? "rgba(251,146,60,0.48)" : "rgba(245,158,11,0.38)",
      backgroundColor: footBg,
    },
    footActionPoints: {
      borderColor: isDark ? "rgba(165,180,252,0.5)" : "rgba(129,140,248,0.38)",
      backgroundColor: footBg,
    },
    footActionDisabled: {
      borderColor: isDark ? "rgba(165,180,252,0.38)" : "rgba(129,140,248,0.38)",
      backgroundColor: footBg,
      opacity: 0.85,
    },
    footActionText: {
      fontSize: 9,
      fontWeight: "800",
      color: isDark ? "#fcd34d" : "#92400e",
    },
    footActionTextWins: {
      fontSize: 9,
      fontWeight: "800",
      color: isDark ? "#fdba74" : "#b45309",
    },
    footActionTextPoints: {
      fontSize: 9,
      fontWeight: "800",
      color: isDark ? "#e0e7ff" : "#4338ca",
    },
    footActionTextDisabled: {
      fontSize: 9,
      fontWeight: "800",
      color: isDark ? "#c7d2fe" : "#6366f1",
    },
    feedbackMsg: {
      marginHorizontal: 16,
      marginTop: 6,
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
      color: c.subtext,
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
    btnDisabled: { opacity: 0.45 },
  });
}
