import { useMutation, useQuery } from "@apollo/client/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import {
  PLATFORM_SETTINGS,
  SET_ALLOW_USER_GLOBAL_POSTS,
  SET_REFERRAL_SYSTEM_ENABLED,
} from "@ctrend/shared/graphql/admin";
import { useTheme } from "../../context/ThemeContext";
import { useToast } from "../useToast";

type PlatformCardProps = {
  icon: string;
  title: string;
  description: string;
  details: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  saving: boolean;
  onLabel: string;
  offLabel: string;
  activeTone: "warning" | "success";
};

function PlatformCard({
  icon,
  title,
  description,
  details,
  enabled,
  onToggle,
  saving,
  onLabel,
  offLabel,
  activeTone,
}: PlatformCardProps) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const statusLabel = enabled ? onLabel : offLabel;

  const activeBorder =
    activeTone === "warning"
      ? isDark ? "rgba(245,158,11,0.45)" : "rgba(245,158,11,0.55)"
      : isDark ? "rgba(34,197,94,0.4)" : "rgba(34,197,94,0.45)";
  const activeBg =
    activeTone === "warning"
      ? isDark ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.08)"
      : isDark ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.08)";
  const statusColor = enabled
    ? activeTone === "warning"
      ? isDark ? "#fcd34d" : "#b45309"
      : isDark ? "#86efac" : "#15803d"
    : colors.muted;
  const statusBg = enabled
    ? activeTone === "warning"
      ? "rgba(245,158,11,0.2)"
      : "rgba(34,197,94,0.18)"
    : isDark ? "rgba(255,255,255,0.08)" : "rgba(100,116,139,0.12)";

  return (
    <View
      style={[
        st.card,
        {
          backgroundColor: enabled ? activeBg : isDark ? "rgba(255,255,255,0.04)" : colors.section,
          borderColor: enabled ? activeBorder : colors.border,
        },
      ]}
    >
      <View style={st.head}>
        <View style={st.meta}>
          <View style={[st.iconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={st.icon}>{icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, { color: colors.text }]}>{title}</Text>
            <View style={[st.statusPill, { backgroundColor: statusBg }]}>
              <Text style={[st.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={saving}
          trackColor={{ false: colors.section, true: activeTone === "warning" ? "#f59e0b" : "#22c55e" }}
          thumbColor="#fff"
        />
      </View>
      <Text style={[st.desc, { color: colors.subtext }]}>{description}</Text>
      <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
        <Text style={[st.more, { color: colors.accent }]}>{open ? "Hide details" : "Learn more"}</Text>
      </Pressable>
      {open ? <Text style={[st.details, { color: colors.muted, borderTopColor: colors.border }]}>{details}</Text> : null}
    </View>
  );
}

export function AdminPlatformControls() {
  const { colors } = useTheme();
  const { showToast, ToastView } = useToast();
  const { data, refetch } = useQuery<{
    platformSettings: { allowUserGlobalPosts: boolean; referralSystemEnabled: boolean };
  }>(PLATFORM_SETTINGS, { fetchPolicy: "cache-and-network" });

  const [setAllowGlobal, { loading: savingGlobal }] = useMutation(SET_ALLOW_USER_GLOBAL_POSTS);
  const [setReferral, { loading: savingReferral }] = useMutation(SET_REFERRAL_SYSTEM_ENABLED);

  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [referralEnabled, setReferralEnabled] = useState(false);

  useEffect(() => {
    if (data?.platformSettings) {
      setGlobalEnabled(Boolean(data.platformSettings.allowUserGlobalPosts));
      setReferralEnabled(Boolean(data.platformSettings.referralSystemEnabled));
    }
  }, [data?.platformSettings?.allowUserGlobalPosts, data?.platformSettings?.referralSystemEnabled]);

  async function toggleGlobal(next: boolean) {
    const prev = globalEnabled;
    setGlobalEnabled(next);
    try {
      await setAllowGlobal({ variables: { enabled: next } });
      void refetch();
      showToast(next ? "Global user posts enabled" : "Global user posts restricted", "success");
    } catch {
      setGlobalEnabled(prev);
      showToast("Could not update setting", "error");
    }
  }

  async function toggleReferral(next: boolean) {
    const prev = referralEnabled;
    setReferralEnabled(next);
    try {
      await setReferral({ variables: { enabled: next } });
      void refetch();
      showToast(next ? "Referral program enabled" : "Referral program disabled", "success");
    } catch {
      setReferralEnabled(prev);
      showToast("Could not update setting", "error");
    }
  }

  return (
    <View style={[st.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ToastView />
      <Text style={[st.sectionTitle, { color: colors.text }]}>Platform settings</Text>
      <Text style={[st.sectionSub, { color: colors.muted }]}>High-impact toggles · apply immediately</Text>
      <PlatformCard
        icon="🌐"
        title="Global user posts"
        description={
          globalEnabled
            ? "Users can publish feed-wide posts under their own name."
            : "Only admin platform posts reach everyone (recommended)."
        }
        details="When off (default), only admin platform posts reach everyone with the Ke Jitbe brand. When on, users can choose a global post — their name and photo appear on the feed and in notifications for all members."
        enabled={globalEnabled}
        onToggle={(v) => void toggleGlobal(v)}
        saving={savingGlobal}
        onLabel="Public posting on"
        offLabel="Restricted"
        activeTone="warning"
      />
      <PlatformCard
        icon="🎁"
        title="Referral & points"
        description={
          referralEnabled
            ? "Invite codes earn redeemable referral points (BDT)."
            : "Invites still work — points earning and redemption are off."
        }
        details="When ON, users can invite friends, redeem referral codes, and earn referral points. When OFF, invites still work but no points are awarded or redeemed. Engagement coins from voting are unaffected."
        enabled={referralEnabled}
        onToggle={(v) => void toggleReferral(v)}
        saving={savingReferral}
        onLabel="Program active"
        offLabel="Program off"
        activeTone="success"
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  sectionSub: { fontSize: 12, fontWeight: "600", marginTop: -6 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  meta: { flex: 1, flexDirection: "row", gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  title: { fontSize: 14, fontWeight: "800" },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  desc: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
  more: { fontSize: 12, fontWeight: "700" },
  details: {
    fontSize: 12,
    lineHeight: 17,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
