export type ViewerVote = "UP" | "DOWN" | null;

export type PostStatus = "published" | "scheduled";

export type FeedPostType = "user" | "system" | "org";

export type FeedPostView = {
  id: string;
  /** API post type — `system` = platform-wide Ke Jitbe polls. */
  postType?: FeedPostType | null;
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
  isVotingOpen?: boolean | null;
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
  postOptions?: { label: string }[] | null;
  /** Demo-only labels when API `options` / `optionStats` are absent. */
  compareOptionLabels?: string[] | null;
  campaign?: FeedPostCampaignView | null;
  voteWinner?: FeedPostVoteWinnerView | null;
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
