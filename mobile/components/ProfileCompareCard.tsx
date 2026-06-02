import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfileCompareCardPost = {
  id: string;
  imageUrls?: string[] | null;
  caption?: string | null;
  totalVotes?: number | null;
  upvoteCount: number;
  downvoteCount: number;
  commentCount?: number | null;
  hypeCount?: number | null;
  saveCount?: number | null;
  isVotingOpen?: boolean | null;
  votingEndsAt?: string | null;
  isPrizeClaimed?: boolean | null;
  votePrizeClaimedAt?: string | null;
  canClaimPrize?: boolean | null;
  voteWinner?: {
    user?: {
      id: string;
      username: string;
      displayName?: string | null;
    } | null;
  } | null;
  options?: Array<{ label: string }> | null;
  category?: { name: string } | null;
};

type Props = {
  post: ProfileCompareCardPost;
  variant: "drops" | "voted" | "kept";
  onEdit?: () => void;
};

function votingEnded(post: ProfileCompareCardPost): boolean {
  if (post.isVotingOpen === false) return true;
  if (!post.votingEndsAt) return false;
  return new Date(post.votingEndsAt).getTime() <= Date.now();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfileCompareCard({ post, variant, onEdit }: Props) {
  const { colors, isDark } = useTheme();
  const showRichMeta = variant !== "kept";
  const ended = votingEnded(post);
  const totalVotes = post.totalVotes ?? (post.upvoteCount + post.downvoteCount);
  const images = (post.imageUrls ?? []).slice(0, 4);
  const extraCount = Math.max(0, (post.imageUrls?.length ?? 0) - 4);

  const pulseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (ended) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [ended, pulseOpacity]);

  const statusLabel = ended
    ? (showRichMeta ? "ENDED" : "CLOSED")
    : (showRichMeta ? "LIVE" : "OPEN");

  const liveTextColor = isDark ? "#86efac" : "#15803d";
  const liveBgColor = isDark ? "rgba(34,197,94,0.14)" : "rgba(34,197,94,0.12)";
  const liveBorderColor = isDark ? "rgba(34,197,94,0.38)" : "rgba(34,197,94,0.28)";

  // Winner / claim pill palette (gold + claimed-green)
  const winner = post.voteWinner?.user ?? null;
  const winnerName = winner ? (winner.displayName?.trim() || `@${winner.username}`) : null;
  const goldText = isDark ? "#fcd34d" : "#b45309";
  const goldBg = isDark ? "rgba(245,158,11,0.14)" : "rgba(245,158,11,0.13)";
  const goldBorder = isDark ? "rgba(245,158,11,0.4)" : "rgba(217,160,23,0.4)";
  const claimedText = isDark ? "#86efac" : "#15803d";
  const claimedBg = isDark ? "rgba(34,197,94,0.14)" : "rgba(34,197,94,0.12)";
  const claimedBorder = isDark ? "rgba(34,197,94,0.38)" : "rgba(34,197,94,0.28)";

  return (
    <View style={[st.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Full-card navigation Pressable */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => router.push(`/post/${post.id}` as `/${string}`)}
      />

      {/* Media strip */}
      <View style={st.media}>
        {images.length === 0 ? (
          <View style={[st.emptyMedia, { backgroundColor: colors.section }]}>
            <Text style={st.emptyIcon}>📷</Text>
          </View>
        ) : (
          images.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={st.thumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ))
        )}
        {extraCount > 0 && (
          <View style={st.moreBadge}>
            <Text style={st.moreText}>+{extraCount}</Text>
          </View>
        )}
      </View>

      {/* Card body */}
      <View style={st.body}>
        <Text style={[st.title, { color: colors.text }]} numberOfLines={1}>
          {post.caption || "Untitled compare"}
        </Text>

        {showRichMeta && (
          <>
            {post.category?.name ? (
              <Text style={[st.category, { color: colors.muted }]} numberOfLines={1}>
                {post.category.name}
              </Text>
            ) : null}
            {post.options && post.options.length > 0 ? (
              <View style={st.chipsRow}>
                {post.options.slice(0, 3).map((o, i) => (
                  <View key={i} style={[st.chip, { backgroundColor: colors.accent + "18" }]}>
                    <Text style={[st.chipText, { color: colors.accent }]} numberOfLines={1}>
                      {o.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}

        {/* Stats bar — pinned to bottom */}
        <View style={[st.statsBar, { borderTopColor: colors.border }]}>
          {showRichMeta ? (
            <View style={st.statsRow}>
              <Text style={[st.stat, { color: colors.text }]}>🗳️ {totalVotes}</Text>
              <Text style={[st.stat, { color: colors.text }]}>💬 {post.commentCount ?? 0}</Text>
              <Text style={[st.stat, { color: colors.text }]}>❤️ {post.hypeCount ?? 0}</Text>
              <Text style={[st.stat, { color: colors.text }]}>🔖 {post.saveCount ?? 0}</Text>
            </View>
          ) : (
            <Text style={[st.votesOnly, { color: colors.muted }]}>{totalVotes} votes</Text>
          )}

          {/* Status pill — bottom-left, under stats */}
          <View style={st.statusRow}>
            <View
              style={[
                st.statusPill,
                ended
                  ? { backgroundColor: colors.section, borderColor: colors.border }
                  : { backgroundColor: liveBgColor, borderColor: liveBorderColor },
              ]}
            >
              {!ended && (
                <Animated.View style={[st.liveDot, { opacity: pulseOpacity }]} />
              )}
              <Text style={[st.statusText, { color: ended ? colors.muted : liveTextColor }]}>
                {statusLabel}
              </Text>
              {ended ? <Text style={st.lockIcon}>🔒</Text> : null}
            </View>

            {/* Winner / claim pills (drops + voted, after voting closes) */}
            {showRichMeta && ended && winnerName ? (
              <View style={[st.metaPill, { backgroundColor: goldBg, borderColor: goldBorder }]}>
                <Text style={[st.metaPillText, { color: goldText }]} numberOfLines={1}>
                  🏆 {winnerName}
                </Text>
              </View>
            ) : null}
            {showRichMeta && ended && post.isPrizeClaimed ? (
              <View style={[st.metaPill, { backgroundColor: claimedBg, borderColor: claimedBorder }]}>
                <Text style={[st.metaPillText, { color: claimedText }]}>✅ Prize claimed</Text>
              </View>
            ) : null}
            {showRichMeta && ended && post.voteWinner?.user && post.canClaimPrize && !post.isPrizeClaimed ? (
              <View style={[st.metaPill, { backgroundColor: goldBg, borderColor: goldBorder }]}>
                <Text style={[st.metaPillText, { color: goldText }]} numberOfLines={1}>
                  🎁 Claim from notifications
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Edit button — absolute top-right, drops only */}
      {variant === "drops" && onEdit ? (
        <Pressable style={st.editBtn} onPress={onEdit} hitSlop={4}>
          <Text style={st.editIcon}>✏️</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  media: {
    height: 120,
    flexDirection: "row",
    overflow: "hidden",
  },
  emptyMedia: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: { fontSize: 22, opacity: 0.35 },
  thumb: { flex: 1, height: 120 },
  moreBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  moreText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  body: {
    padding: 8,
    paddingBottom: 6,
    gap: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  category: {
    fontSize: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 90,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statsBar: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    gap: 5,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  stat: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  votesOnly: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  metaPillText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  lockIcon: {
    fontSize: 10,
  },
  editBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 3,
  },
  editIcon: { fontSize: 14 },
});
