import type { FeedPostCampaignWinnerView, FeedPostView, PostFormat, PostStatus, ViewerVote, VoteOptionStatView } from "../types/feed";
import { normalizeCompareLayout } from "@ctrend/shared/lib/compareLayout";
import { normalizeMatchScoreDisplay } from "@ctrend/shared/lib/matchScoreCopy";

function mapViewerVote(
  viewerVote: string | null | undefined,
  mySelected: number | null | undefined,
): ViewerVote {
  if (mySelected === 0) {
    return "UP";
  }
  if (mySelected === 1) {
    return "DOWN";
  }
  if (mySelected != null) {
    return null;
  }
  const v = viewerVote?.toUpperCase();
  if (v === "UP" || v === "DOWN") {
    return v;
  }
  return null;
}

/** Maps a `PostGql`-shaped object from `feedPosts` or `getPostById` into `FeedPostView`. */
export function mapGqlPostToFeedView(p: {
  id: string;
  type?: string | null;
  format?: string | null;
  compareLayout?: string | null;
  isUserGlobalBroadcast?: boolean | null;
  authorId?: string | null;
  authorUsername: string;
  authorDisplayName?: string | null;
  authorEmail?: string | null;
  authorProfileImageUrl?: string | null;
  imageUrls?: string[] | null;
  caption?: string | null;
  createdAt?: string | null;
  votingEndsAt?: string | null;
  endingSoonLeadMinutes?: number | null;
  isVotingOpen?: boolean | null;
  isPrizeClaimed?: boolean | null;
  votePrizeClaimedAt?: string | null;
  canClaimPrize?: boolean | null;
  upvoteCount: number;
  downvoteCount: number;
  hypeCount?: number;
  saveCount?: number;
  viewerHasSaved?: boolean;
  viewerHasHyped?: boolean;
  commentCount?: number;
  recentComments?: Array<{
    id: string;
    content: string;
    createdAt: string;
    likeCount?: number;
    viewerHasLiked?: boolean;
    author: {
      id: string;
      username: string;
      displayName?: string | null;
    };
  }> | null;
  viewerVote?: string | null;
  mySelectedOptionIndex?: number | null;
  myVoteAnonymous?: boolean | null;
  optionStats?: Array<{
    index: number;
    label: string;
    count: number;
    percentage: number;
  }> | null;
  options?: Array<{
    label: string;
    imageUrl?: string | null;
    imageFocalX?: number | null;
    imageFocalY?: number | null;
  }> | null;
  status?: string | null;
  scheduledAt?: string | null;
  category?: {
    id: string;
    name: string;
    slug?: string | null;
    color?: string | null;
  } | null;
  campaign?: {
    id: string;
    name: string;
    slug: string;
    isDefault?: boolean | null;
    bannerText?: string | null;
    bannerImageUrl?: string | null;
    prizePerWinner: number;
    hasWinner?: boolean | null;
    hasRewards?: boolean | null;
  } | null;
  voteWinner?: {
    selectedOptionIndex?: number | null;
    pickedAt?: string | null;
    user?: {
      id: string;
      username: string;
      displayName?: string | null;
      profileImageUrl?: string | null;
    } | null;
  } | null;
  campaignWinner?: {
    id: string;
    winningOption?: number | null;
    note?: string | null;
    prize?: number | null;
    createdAt?: string | null;
    user?: {
      id: string;
      username: string;
      displayName?: string | null;
      profileImageUrl?: string | null;
    } | null;
  } | null;
  matchType?: boolean | null;
  matchScore?: {
    home?: number | null;
    away?: number | null;
    status?: string | null;
    minute?: number | null;
    phase?: string | null;
    fullTime?: { home?: number | null; away?: number | null } | null;
    extraTime?: { home?: number | null; away?: number | null } | null;
    penalty?: { home?: number | null; away?: number | null } | null;
    wentToExtraTime?: boolean | null;
    wentToPenalties?: boolean | null;
  } | null;
  fixtureWinnerAt?: string | null;
  fixtureId?: string | null;
  lineupAvailable?: boolean | null;
  fixtureStage?: string | null;
  hasDrawOption?: boolean | null;
  pinned?: boolean | null;
}): FeedPostView {
  const imageUrls = (p.imageUrls ?? []).filter(
    (u) => typeof u === "string" && u.trim().length > 0,
  );
  const optionStats: VoteOptionStatView[] | null = p.optionStats?.length
    ? p.optionStats.map((s) => ({
        index: s.index,
        label: s.label,
        count: Math.round(s.count),
        percentage: s.percentage,
      }))
    : null;
  const postOptions =
    p.options?.map((o) => ({
      label: o.label,
      imageUrl: o.imageUrl ?? null,
      imageFocalX: o.imageFocalX ?? null,
      imageFocalY: o.imageFocalY ?? null,
    })) ?? null;
  const rawType = p.type?.toLowerCase();
  const postType =
    rawType === "system" || rawType === "org" || rawType === "user"
      ? rawType
      : null;
  const rawFormat = p.format?.toLowerCase();
  const format: PostFormat =
    rawFormat === "poll" ? "poll" : rawFormat === "announcement" ? "announcement" : "compare";
  return {
    id: p.id,
    postType,
    format,
    compareLayout: normalizeCompareLayout(p.compareLayout),
    isUserGlobalBroadcast: Boolean(p.isUserGlobalBroadcast),
    authorId: p.authorId ?? null,
    authorUsername: p.authorUsername,
    authorDisplayName: p.authorDisplayName ?? null,
    authorEmail: p.authorEmail ?? null,
    authorProfileImageUrl: p.authorProfileImageUrl ?? null,
    imageUrls,
    caption: p.caption ?? null,
    createdAt: p.createdAt ?? null,
    votingEndsAt: p.votingEndsAt ?? null,
    endingSoonLeadMinutes: p.endingSoonLeadMinutes ?? 5,
    isVotingOpen:
      p.isVotingOpen === undefined || p.isVotingOpen === null
        ? null
        : p.isVotingOpen,
    isPrizeClaimed:
      p.isPrizeClaimed === undefined || p.isPrizeClaimed === null
        ? null
        : p.isPrizeClaimed,
    votePrizeClaimedAt: p.votePrizeClaimedAt ?? null,
    canClaimPrize:
      p.canClaimPrize === undefined || p.canClaimPrize === null
        ? null
        : p.canClaimPrize,
    upvoteCount: p.upvoteCount,
    downvoteCount: p.downvoteCount,
    hypeCount: p.hypeCount ?? 0,
    saveCount: p.saveCount ?? 0,
    viewerHasSaved: p.viewerHasSaved ?? false,
    viewerHasHyped: p.viewerHasHyped ?? false,
    commentCount: p.commentCount ?? 0,
    recentComments: [],
    status: (p.status as PostStatus | null) ?? null,
    scheduledAt: p.scheduledAt ?? null,
    viewerVote: mapViewerVote(p.viewerVote, p.mySelectedOptionIndex),
    mySelectedOptionIndex:
      p.mySelectedOptionIndex === undefined || p.mySelectedOptionIndex === null
        ? null
        : p.mySelectedOptionIndex,
    myVoteAnonymous: p.myVoteAnonymous ?? null,
    optionStats,
    postOptions,
    compareOptionLabels: null,
    category: p.category
      ? {
          id: p.category.id,
          name: p.category.name,
          slug: p.category.slug ?? null,
          color: p.category.color ?? null,
        }
      : null,
    campaign: p.campaign
      ? {
          id: p.campaign.id,
          name: p.campaign.name,
          slug: p.campaign.slug,
          isDefault: p.campaign.isDefault ?? null,
          bannerText: p.campaign.bannerText ?? null,
          bannerImageUrl: p.campaign.bannerImageUrl ?? null,
          prizePerWinner: p.campaign.prizePerWinner,
          hasWinner: p.campaign.hasWinner ?? null,
          hasRewards: p.campaign.hasRewards ?? null,
        }
      : null,
    voteWinner: p.voteWinner?.user
      ? {
          selectedOptionIndex: p.voteWinner.selectedOptionIndex ?? null,
          pickedAt: p.voteWinner.pickedAt ?? null,
          user: p.voteWinner.user,
        }
      : null,
    campaignWinner: p.campaignWinner
      ? ({
          id: p.campaignWinner.id,
          winningOption: p.campaignWinner.winningOption ?? null,
          note: p.campaignWinner.note ?? null,
          prize: p.campaignWinner.prize ?? null,
          createdAt: p.campaignWinner.createdAt ?? null,
          user: p.campaignWinner.user ?? null,
        } satisfies FeedPostCampaignWinnerView)
      : null,
    matchType: p.matchType ?? false,
    matchScore: p.matchScore
      ? (() => {
          const base = {
            home: p.matchScore.home ?? null,
            away: p.matchScore.away ?? null,
            status: p.matchScore.status ?? null,
            minute: p.matchScore.minute ?? null,
            phase: p.matchScore.phase ?? null,
            fullTime: p.matchScore.fullTime
              ? {
                  home: p.matchScore.fullTime.home ?? null,
                  away: p.matchScore.fullTime.away ?? null,
                }
              : null,
            extraTime: p.matchScore.extraTime
              ? {
                  home: p.matchScore.extraTime.home ?? null,
                  away: p.matchScore.extraTime.away ?? null,
                }
              : null,
            penalty: p.matchScore.penalty
              ? {
                  home: p.matchScore.penalty.home ?? null,
                  away: p.matchScore.penalty.away ?? null,
                }
              : null,
            wentToExtraTime: p.matchScore.wentToExtraTime ?? null,
            wentToPenalties: p.matchScore.wentToPenalties ?? null,
          };
          const normalized = normalizeMatchScoreDisplay(base);
          if (normalized) {
            return { ...base, home: normalized.home, away: normalized.away };
          }
          return base;
        })()
      : null,
    fixtureWinnerAt: p.fixtureWinnerAt ?? null,
    fixtureId: p.fixtureId ?? null,
    lineupAvailable: p.lineupAvailable ?? false,
    fixtureStage: p.fixtureStage ?? null,
    hasDrawOption: p.hasDrawOption ?? null,
    pinned: Boolean(p.pinned),
  };
}
