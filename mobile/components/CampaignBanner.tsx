import { useQuery } from "@apollo/client/react";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ACTIVE_CAMPAIGNS } from "@ctrend/shared/graphql/campaigns";
import { useTheme } from "../context/ThemeContext";

type Campaign = {
  id: string;
  name: string;
  slug: string;
  bannerText: string;
  bannerImageUrl: string | null;
  ctaLabel: string;
  prizePerWinner: number;
};

function CampaignCard({ c }: { c: Campaign }) {
  const { colors } = useTheme();
  return (
    <Pressable
      style={{
        overflow: "hidden", minHeight: 136,
        backgroundColor: colors.card,
        justifyContent: "flex-end", marginBottom: 8,
      }}
      onPress={() => router.push(`/campaign/${c.slug}` as `/${string}`)}
    >
      <Image
        source={c.bannerImageUrl ? { uri: c.bannerImageUrl } : require("../assets/worldcup-players.png")}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <View style={{ ...{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backgroundColor: "rgba(20, 5, 40, 0.70)" }} />
      <View style={{ padding: 14, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <View style={{ backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.8 }}>CAMPAIGN</Text>
          </View>
          <Text style={{ color: "#fbbf24", fontSize: 12, fontWeight: "700" }}>🎁 Win {c.prizePerWinner} BDT</Text>
        </View>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{c.name}</Text>
        <Text style={{ color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{c.bannerText}</Text>
        <View style={{
          alignSelf: "flex-start", borderWidth: 1,
          borderColor: "rgba(255,255,255,0.55)", borderRadius: 20,
          paddingHorizontal: 14, paddingVertical: 5, marginTop: 8,
        }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{c.ctaLabel}</Text>
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
    <View style={{ paddingTop: 0, paddingBottom: 8 }}>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} c={c} />
      ))}
    </View>
  );
}
