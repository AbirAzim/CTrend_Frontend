import { useQuery } from "@apollo/client";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FeedPostCard } from "../components/FeedPostCard";
import { GET_POST_BY_ID } from "../graphql/feed";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { postPermalink } from "../lib/postPermalink";
import type { FeedPostView } from "../types/feed";

export function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const highlightCommentId = useMemo(() => {
    const match = location.hash.match(/^#comment-(.+)$/);
    return match?.[1] ?? null;
  }, [location.hash]);
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const mockPost = useMemo((): FeedPostView | null => {
    if (!useMockFeed || !postId) {
      return null;
    }
    return mockPostsAsFeed().find((p) => p.id === postId) ?? null;
  }, [useMockFeed, postId]);

  const { data, loading, error } = useQuery(GET_POST_BY_ID, {
    variables: { id: postId ?? "" },
    skip: !postId || useMockFeed,
    fetchPolicy: "network-only",
  });

  const post: FeedPostView | null = useMockFeed
    ? mockPost
    : data?.getPostById
      ? mapGqlPostToFeedView(data.getPostById)
      : null;

  const showError = !useMockFeed && Boolean(error);
  const showNotFound =
    !loading &&
    !showError &&
    ((!useMockFeed && postId && !post) || (useMockFeed && postId && !mockPost));

  const permalink = postId ? postPermalink(postId) : "";
  const [linkCopied, setLinkCopied] = useState(false);

  const copyPermalink = useCallback(async () => {
    if (!permalink) return;
    try {
      await navigator.clipboard.writeText(permalink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [permalink]);

  return (
    <div className="ig-post-detail">
      <div className="ig-post-detail-bar">
        <button
          type="button"
          className="ig-post-detail-back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>
        {postId ? (
          <div className="ig-post-detail-link-wrap">
            <span className="ig-post-detail-url" title={permalink}>
              Post link
            </span>
            <button
              type="button"
              className="ig-post-detail-copy"
              onClick={() => void copyPermalink()}
            >
              {linkCopied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
        ) : null}
      </div>

      {loading && !useMockFeed && (
        <p className="ig-feed-status">Loading post…</p>
      )}

      {showError && (
        <div className="ig-feed-banner ig-feed-banner--error" role="alert">
          <strong>Could not load this post.</strong>{" "}
          {error?.message ?? "Check `getPostById` on the API."}
        </div>
      )}

      {showNotFound && (
        <p className="ig-feed-status">
          No post found for this link. It may have been removed, or the id is
          invalid.
        </p>
      )}

      {post ? (
        <FeedPostCard
          post={post}
          voteMode={useMockFeed ? "local" : "api"}
          showPermalinkToolbar={false}
          highlightCommentId={highlightCommentId}
        />
      ) : null}
    </div>
  );
}
