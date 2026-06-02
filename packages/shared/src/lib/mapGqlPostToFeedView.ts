import type { FeedPostView, PostStatus, ViewerVote, VoteOptionStatView } from "../types/feed";

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
  authorId?: string | null;
  authorUsername: string;
  authorDisplayName?: string | null;
  authorEmail?: string | null;
  imageUrls?: string[] | null;
  caption?: string | null;
  createdAt?: string | null;
  votingEndsAt?: string | null;
  isVotingOpen?: boolean | null;
  upvoteCount: number;
  downvoteCount: number;
  hypeCount?: number;
  saveCount?: number;
  viewerHasSaved?: boolean;
  viewerHasHyped?: boolean | null;
  myVoteAnonymous?: boolean | null;
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
  optionStats?: Array<{
    index: number;
    label: string;
    count: number;
    percentage: number;
  }> | null;
  options?: Array<{ label: string }> | null;
  status?: string | null;
  scheduledAt?: string | null;
  campaign?: {
    id: string;
    name: string;
    slug: string;
    bannerText?: string | null;
    bannerImageUrl?: string | null;
    prizePerWinner: number;
  } | null;
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
    p.options?.map((o) => ({ label: o.label })) ?? null;
  const rawType = p.type?.toLowerCase();
  const postType =
    rawType === "system" || rawType === "org" || rawType === "user"
      ? rawType
      : null;
  return {
    id: p.id,
    postType,
    authorId: p.authorId ?? null,
    authorUsername: p.authorUsername,
    authorDisplayName: p.authorDisplayName ?? null,
    authorEmail: p.authorEmail ?? null,
    imageUrls,
    caption: p.caption ?? null,
    createdAt: p.createdAt ?? null,
    votingEndsAt: p.votingEndsAt ?? null,
    isVotingOpen:
      p.isVotingOpen === undefined || p.isVotingOpen === null
        ? null
        : p.isVotingOpen,
    upvoteCount: p.upvoteCount,
    downvoteCount: p.downvoteCount,
    hypeCount: p.hypeCount ?? 0,
    saveCount: p.saveCount ?? 0,
    viewerHasSaved: p.viewerHasSaved ?? false,
    viewerHasHyped: p.viewerHasHyped ?? false,
    myVoteAnonymous: p.myVoteAnonymous ?? false,
    commentCount: p.commentCount ?? 0,
    recentComments: p.recentComments ?? [],
    status: (p.status as PostStatus | null) ?? null,
    scheduledAt: p.scheduledAt ?? null,
    viewerVote: mapViewerVote(p.viewerVote, p.mySelectedOptionIndex),
    mySelectedOptionIndex:
      p.mySelectedOptionIndex === undefined || p.mySelectedOptionIndex === null
        ? null
        : p.mySelectedOptionIndex,
    optionStats,
    postOptions,
    compareOptionLabels: null,
    campaign: p.campaign
      ? {
          id: p.campaign.id,
          name: p.campaign.name,
          slug: p.campaign.slug,
          bannerText: p.campaign.bannerText ?? null,
          bannerImageUrl: p.campaign.bannerImageUrl ?? null,
          prizePerWinner: p.campaign.prizePerWinner,
        }
      : null,
  };
}
