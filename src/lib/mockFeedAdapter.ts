import { MOCK_POSTS } from "../data/mockFeed";
import type { FeedPostView } from "../types/feed";

/** Maps demo posts to the same shape as `feedPosts` for local-only UI. */
export function mockPostsAsFeed(): FeedPostView[] {
  return MOCK_POSTS.map((p) => {
    const imageUrls =
      p.compareSeeds && p.compareSeeds.length >= 2
        ? p.compareSeeds.map(
            (seed) => `https://picsum.photos/seed/${seed}/1080/1080`,
          )
        : [`https://picsum.photos/seed/${p.imageSeed}/1080/1080`];

    const upvoteCount =
      imageUrls.length === 2
        ? Math.max(0, Math.floor(p.likes * 0.55))
        : Math.max(0, Math.floor(p.likes * 0.62));
    const downvoteCount =
      imageUrls.length === 2
        ? Math.max(0, Math.floor(p.likes * 0.12))
        : Math.max(0, Math.floor(p.likes * 0.08));

    const compareOptionCounts =
      imageUrls.length > 2 && p.compareOptionCounts
        ? [...p.compareOptionCounts]
        : imageUrls.length > 2
          ? imageUrls.map(() => 0)
          : null;

    const compareOptionLabels =
      p.compareLabels &&
      p.compareLabels.length === imageUrls.length &&
      imageUrls.length >= 2
        ? [...p.compareLabels]
        : null;

    return {
      id: p.id,
      authorUsername: p.username,
      authorDisplayName: p.displayName,
      imageUrls,
      compareOptionCounts,
      viewerCompareChoice: null,
      caption: p.caption,
      createdAt: null,
      upvoteCount,
      downvoteCount,
      viewerVote: null,
      mySelectedOptionIndex: null,
      optionStats: null,
      postOptions: null,
      compareOptionLabels,
    };
  });
}
