import { MOCK_POSTS } from "../data/mockFeed";
import type { FeedPostView } from "../types/feed";

/** Maps demo posts to the same shape as `feedPosts` for local-only UI. */
export function mockPostsAsFeed(): FeedPostView[] {
  return MOCK_POSTS.map((p) => ({
    id: p.id,
    authorUsername: p.username,
    authorDisplayName: p.displayName,
    imageUrl: `https://picsum.photos/seed/${p.imageSeed}/1080/1080`,
    caption: p.caption,
    createdAt: null,
    upvoteCount: Math.max(0, Math.floor(p.likes * 0.62)),
    downvoteCount: Math.max(0, Math.floor(p.likes * 0.08)),
    viewerVote: null,
  }));
}
