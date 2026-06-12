export type ViewerVote = "UP" | "DOWN" | null;

export type PostStatus = "published" | "scheduled";

export type FeedPostType = "user" | "system" | "org";

/** Voting layout: `compare` = side-by-side image grid; `poll` = stacked option rows. */
export type PostFormat = "compare" | "poll";

export type FeedPostView = {
  id: string;
  /** API post type — `system` = platform-wide Ke Jitbe polls. */
  postType?: FeedPostType | null;
  /** Voting layout. Defaults to `compare` for legacy posts. */
  format?: PostFormat | null;
  /** Normal user posted to everyone (admin toggle); shows user name/avatar, not platform brand. */
  isUserGlobalBroadcast?: boolean | null;
  authorId?: string | null;
  authorUsername: string;
  authorDisplayName: string | null;
  authorEmail?: string | null;
  authorProfileImageUrl?: string | null;
  /** All post images from API (`imageUrls: [String!]!`). Order matters for compare / gallery. */
  imageUrls: string[];
  /**
   * Vote totals per column when there are 3+ images (demo / local only).
   * Length must match `imageUrls`.
   */
  compareOptionCounts?: number[] | null;
  /** Selected compare column index for 3+ options (demo / local only). */
  viewerCompareChoice?: number | null;
  caption: string | null;
  createdAt: string | null;
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
  }>;
  status?: PostStatus | null;
  scheduledAt?: string | null;
  viewerVote: ViewerVote;
  /** Server vote choice (0-based option index); use for 3+ options — `viewerVote` is only A/B legacy. */
  mySelectedOptionIndex?: number | null;
  /** Persisted anonymous flag for the viewer's vote on this post. */
  myVoteAnonymous?: boolean | null;
  /** Per-option counts/percentages from API when present. */
  optionStats?: VoteOptionStatView[] | null;
  /** Option titles from API `options` (same order as voting indices / compare columns). */
  postOptions?: {
    label: string;
    /** Optional per-option thumbnail (poll rows; mixed text/image allowed). */
    imageUrl?: string | null;
    imageFocalX?: number | null;
    imageFocalY?: number | null;
  }[] | null;
  /** Demo-only labels when API `options` / `optionStats` are absent. */
  compareOptionLabels?: string[] | null;
  /** Post category (e.g. Sports, Tech) shown as a chip on the card. */
  category?: {
    id: string;
    name: string;
    slug?: string | null;
    /** Admin-assigned accent color (hex); falls back to a derived color. */
    color?: string | null;
  } | null;
  campaign?: FeedPostCampaignView | null;
  voteWinner?: FeedPostVoteWinnerView | null;
  campaignWinner?: FeedPostCampaignWinnerView | null;
};

export type VoteOptionStatView = {
  index: number;
  label: string;
  count: number;
  percentage: number;
};

export type FeedPostCampaignView = {
  id: string;
  name: string;
  slug: string;
  bannerText?: string | null;
  bannerImageUrl?: string | null;
  prizePerWinner: number;
  hasWinner?: boolean | null;
  hasRewards?: boolean | null;
};

export type FeedPostCampaignWinnerView = {
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
};

export type FeedPostVoteWinnerView = {
  selectedOptionIndex?: number | null;
  pickedAt?: string | null;
  user?: {
    id: string;
    username: string;
    displayName?: string | null;
    profileImageUrl?: string | null;
  } | null;
};

export type VoteDirectionGql = "UP" | "DOWN" | "NONE";
