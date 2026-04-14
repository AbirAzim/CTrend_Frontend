import { useQuery } from "@apollo/client";
import { FeedPostCard } from "../components/FeedPostCard";
import { FEED_POSTS } from "../graphql/feed";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import type { FeedPostView } from "../types/feed";

export function FeedPage() {
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const { data, loading, error } = useQuery(FEED_POSTS, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
  });

  const apiPosts: FeedPostView[] | null = data?.feedPosts
    ? data.feedPosts.map(mapGqlPostToFeedView)
    : null;

  const posts: FeedPostView[] = useMockFeed
    ? mockPostsAsFeed()
    : (apiPosts ?? []);

  const showApiError = !useMockFeed && Boolean(error);
  const showEmpty =
    !useMockFeed && !loading && !error && posts.length === 0;

  return (
    <div className="ig-feed">
      {loading && !useMockFeed && (
        <p className="ig-feed-status">Loading feed…</p>
      )}

      {showApiError && (
        <div className="ig-feed-banner ig-feed-banner--error" role="alert">
          <strong>Could not load feed.</strong>{" "}
          {error?.message ?? "Check that the backend implements the "}
          <code>feedPosts</code> query (see <code>backend_req.md</code>).
        </div>
      )}

      {showEmpty && (
        <p className="ig-feed-status">
          No posts yet. Add data from the API or set{" "}
          <code>VITE_USE_MOCK_FEED=true</code> in <code>.env</code> for demo
          posts.
        </p>
      )}

      {posts.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          voteMode={useMockFeed ? "local" : "api"}
        />
      ))}

      <p className="ig-feed-footnote">
        {useMockFeed ? (
          <>
            <strong>Demo mode:</strong> votes stay in this browser only. Set{" "}
            <code>VITE_USE_MOCK_FEED=false</code> and implement{" "}
            <code>feedPosts</code> / <code>votePost</code> on the backend.
          </>
        ) : (
          <>
            Live feed from <code>feedPosts</code> (uses <code>imageUrls</code>).
            Votes use <code>votePost(postId, selectedOptionIndex)</code>. Each
            post has a shareable link under <code>/post/:id</code>.
          </>
        )}
      </p>
    </div>
  );
}
