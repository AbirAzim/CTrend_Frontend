import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ACTIVE_CAMPAIGNS,
  CAMPAIGN_WIN_LEADERBOARD,
} from "@ctrend/shared/graphql/campaigns";
import { normalizeProfileImageUrl } from "@ctrend/shared/lib/profileImageUrl";
import worldcupPlayersAsset from "../assets/worldcup-players.png";

const BG = "#5a0a0a";
const MEDAL = ["#f5c518", "#cbd2d9", "#cd7f32"]; // gold, silver, bronze

type Campaign = {
  id: string;
  name: string;
  slug: string;
  bannerText: string;
  bannerImageUrl: string | null;
  ctaLabel: string;
  prizePerWinner: number;
};

type LeaderRow = {
  rank: number;
  wins: number;
  user: {
    id: string;
    username?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

/** Top-3 winners shown as a circular avatar cluster on the campaign banner. */
function BannerLeaders({ campaignId }: { campaignId: string }) {
  const { data } = useQuery<{ campaignWinLeaderboard: LeaderRow[] }>(
    CAMPAIGN_WIN_LEADERBOARD,
    { variables: { campaignId, take: 3 }, fetchPolicy: "cache-and-network" },
  );
  const rows = (data?.campaignWinLeaderboard ?? []).slice(0, 3);
  if (rows.length === 0) return null;

  return (
    <View style={styles.leaders}>
      <Text style={styles.leadersLabel}>🏆 Top</Text>
      <View style={styles.leadersRow}>
        {rows.map((row, i) => {
          const u = row.user;
          const name = u?.displayName?.trim() || u?.username || "User";
          const img = normalizeProfileImageUrl(u?.profileImageUrl ?? null);
          const ring = MEDAL[row.rank - 1] ?? "#fff";
          const big = row.rank === 1;
          return (
            <View
              key={u?.id ?? row.rank}
              style={[
                styles.leader,
                i > 0 && { marginLeft: 5 },
                {
                  borderColor: ring,
                  width: big ? 32 : 28,
                  height: big ? 32 : 28,
                  borderRadius: big ? 16 : 14,
                },
              ]}
            >
              {img ? (
                <Image source={{ uri: img }} style={styles.leaderImg} cachePolicy="memory-disk" />
              ) : (
                <Text style={styles.leaderFallback}>{name.charAt(0).toUpperCase()}</Text>
              )}
              <View style={[styles.leaderRank, { backgroundColor: ring }]}>
                <Text style={styles.leaderRankText}>{row.rank}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/campaign/${c.slug}` as `/${string}`)}
    >
      {/* Right-side image — contain so full figure visible, no head cut */}
      <Image
        source={c.bannerImageUrl ? { uri: c.bannerImageUrl } : worldcupPlayersAsset}
        style={styles.rightImage}
        contentFit="contain"
        contentPosition="right center"
        cachePolicy="memory-disk"
      />

      {/* Dark fade over the image so left content is readable */}
      <View style={styles.leftFade} />

      {/* Content */}
      <View style={styles.content}>
        {/* Top row: badge + prize */}
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>CAMPAIGN</Text>
          </View>
          <Text style={styles.prize}>🏆 Win {c.prizePerWinner} BDT</Text>
        </View>

        <Text style={styles.title} numberOfLines={1}>{c.name}</Text>
        <Text style={styles.desc} numberOfLines={2}>{c.bannerText}</Text>

        <View style={styles.actionsRow}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{c.ctaLabel}</Text>
          </View>
          <BannerLeaders campaignId={c.id} />
        </View>
      </View>
    </Pressable>
  );
}

export function CampaignBanner() {
  const { data } = useQuery<{ activeCampaigns: Campaign[] }>(ACTIVE_CAMPAIGNS, {
    fetchPolicy: "cache-and-network",
  });
  const campaigns = data?.activeCampaigns ?? [];
  if (!campaigns.length) return null;

  return (
    <View style={styles.wrap}>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} c={c} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },

  card: {
    height: 130,
    backgroundColor: BG,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },

  /* Image anchored to the right half, full height, contained */
  rightImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "55%",
  },

  /* Gradient-like solid fade from BG on left to transparent on right */
  leftFade: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "65%",
    backgroundColor: BG,
    /* simulate gradient fade into transparent on the right edge */
    borderRightWidth: 0,
  },

  content: {
    flex: 1,
    padding: 14,
    paddingRight: 8,
    gap: 3,
    width: "62%",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },

  badge: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 0.8 },

  prize: { color: "#fbbf24", fontSize: 12, fontWeight: "700" },

  title: { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 20 },

  desc: { color: "rgba(255,255,255,0.78)", fontSize: 11, lineHeight: 16 },

  cta: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  ctaText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  leaders: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 20,
    paddingVertical: 3,
    paddingLeft: 8,
    paddingRight: 8,
  },
  leadersLabel: { color: "#fff", fontSize: 10, fontWeight: "800" },
  leadersRow: { flexDirection: "row", alignItems: "center" },
  leader: {
    position: "relative",
    borderWidth: 2,
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  leaderImg: { width: "100%", height: "100%", borderRadius: 16 },
  leaderFallback: { color: "#fff", fontSize: 11, fontWeight: "800" },
  leaderRank: {
    position: "absolute",
    bottom: -4,
    right: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  leaderRankText: { color: "#3a2a00", fontSize: 8, fontWeight: "900" },
});
