export type ViewerVote = "UP" | "DOWN" | null;

export type FeedPostView = {
  id: string;
  authorUsername: string;
  authorDisplayName: string | null;
  imageUrl: string;
  caption: string | null;
  createdAt: string | null;
  upvoteCount: number;
  downvoteCount: number;
  viewerVote: ViewerVote;
};

export type VoteDirectionGql = "UP" | "DOWN" | "NONE";
