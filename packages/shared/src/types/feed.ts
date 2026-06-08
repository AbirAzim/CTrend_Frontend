export type ViewerVote = "UP" | "DOWN" | null;

export type PostStatus = "published" | "scheduled";

export type FeedPostType = "user" | "system" | "org";

/** Post layout: `compare` = side-by-side images, `poll` = stacked option rows. */
export type PostFormat = "compare" | "poll";

export type FeedPostView = {
  id: string;
  /** API post type — `system` = platform-wide Ke Jitbe polls. */
  postType?: FeedPostType | null;
  /** Post layout format (defaults to `compare` when absent). */
  format?: PostFormat | null;
  authorId?: string | null;
  authorUsername: string;
  authorDisplayName: string | null;
  authorEmail?: string | null;
  authorProfileImageUrl?: string | null;
  /** True when a normal user opted to broadcast this post platform-wide (Phase 36). Distinct from `postType: "system"` (admin Ke Jitbe). */
  isUserGlobalBroadcast?: boolean | null;
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
  /** Lead time (minutes) before deadline to show the "ending soon" banner. Default 5 (Phase 25). */
  endingSoonLeadMinutes?: number | null;
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
  }>;
  status?: PostStatus | null;
  scheduledAt?: string | null;
  viewerVote: ViewerVote;
  /** Server vote choice (0-based option index); use for 3+ options — `viewerVote` is only A/B legacy. */
  mySelectedOptionIndex?: number | null;
  /** Per-option counts/percentages from API when present. */
  optionStats?: VoteOptionStatView[] | null;
  /** Option titles + per-option image focal from API `options` (same order as voting indices / compare columns). */
  postOptions?: {
    label: string;
    imageUrl?: string | null;
    imageFocalX?: number | null;
    imageFocalY?: number | null;
  }[] | null;
  /** Demo-only labels when API `options` / `optionStats` are absent. */
  compareOptionLabels?: string[] | null;
  /** Campaign this compare is linked to (Phase 22). */
  campaign?: FeedPostCampaignView | null;
  /** Random prize-draw winner after voting closes (Phase 24). */
  voteWinner?: FeedPostVoteWinnerView | null;
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

export type VoteOptionStatView = {
  index: number;
  label: string;
  count: number;
  percentage: number;
};

export type VoteDirectionGql = "UP" | "DOWN" | "NONE";
