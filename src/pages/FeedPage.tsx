import { useQuery } from "@apollo/client";
import { FeedPostCard } from "../components/FeedPostCard";
import { FEED_POSTS } from "../graphql/feed";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import type { FeedPostView } from "../types/feed";

function mapGqlPost(p: {
  id: string;
  authorUsername: string;
  authorDisplayName?: string | null;
  imageUrl: string;
  caption?: string | null;
  createdAt?: string | null;
  upvoteCount: number;
  downvoteCount: number;
  viewerVote?: string | null;
}): FeedPostView {
  return {
    id: p.id,
    authorUsername: p.authorUsername,
    authorDisplayName: p.authorDisplayName ?? null,
    imageUrl: p.imageUrl,
    caption: p.caption ?? null,
    createdAt: p.createdAt ?? null,
    upvoteCount: p.upvoteCount,
    downvoteCount: p.downvoteCount,
    viewerVote:
      p.viewerVote === "UP" || p.viewerVote === "DOWN" ? p.viewerVote : null,
  };
}

export function FeedPage() {
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const { data, loading, error } = useQuery(FEED_POSTS, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
  });

  const apiPosts: FeedPostView[] | null = data?.feedPosts
    ? data.feedPosts.map(mapGqlPost)
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
            <code>feedPosts</code> / <code>voteOnPost</code> on the backend.
          </>
        ) : (
          <>
            Live feed from <code>feedPosts</code>. Vote row sends{" "}
            <code>voteOnPost</code> to your API.
          </>
        )}
      </p>
    </div>
  );
}
