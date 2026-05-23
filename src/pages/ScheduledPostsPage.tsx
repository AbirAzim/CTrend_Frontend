import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CANCEL_SCHEDULED_POST, MY_SCHEDULED_POSTS, NEW_POSTS } from "../graphql/feed";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type ScheduledPost = {
  id: string;
  contentText?: string | null;
  imageUrls?: string[] | null;
  options?: Array<{ label: string; imageUrl?: string | null }> | null;
  category?: { id: string; name?: string | null } | null;
  status: string;
  scheduledAt: string;
  createdAt?: string | null;
};

function formatCountdown(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Publishing soon…";
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Publishing in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Publishing in ${hours}h ${mins % 60}m`;
  return `Publishing in ${mins}m`;
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function ScheduledPostsPage() {
  const { data, loading, error, refetch } = useQuery<{ myScheduledPosts: ScheduledPost[] }>(
    MY_SCHEDULED_POSTS,
    { fetchPolicy: "network-only", pollInterval: 30_000 },
  );

  const [cancelPost, { loading: cancelling }] = useMutation(CANCEL_SCHEDULED_POST);
  const [goneLiveIds, setGoneLiveIds] = useState<ReadonlySet<string>>(new Set());
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allPosts = data?.myScheduledPosts ?? [];
  const posts = allPosts.filter((p) => !goneLiveIds.has(p.id));

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    onData: ({ data: subData }) => {
      const postId = subData.data?.newPosts?.postId;
      if (!postId) return;
      if (!allPosts.some((p) => p.id === postId)) return;
      setGoneLiveIds((prev) => new Set([...prev, postId]));
      setLiveToast("Your post is now live");
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setLiveToast(null), 4000);
    },
  });

  async function handleCancel(postId: string) {
    try {
      await cancelPost({ variables: { postId } });
      void refetch();
    } catch (err) {
      alert(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="ig-scheduled-page">
      <div className="ig-scheduled-header">
        <Link to="/profile" className="ig-scheduled-back">← Profile</Link>
        <h1 className="ig-scheduled-title">Scheduled</h1>
        <p className="ig-scheduled-lead">
          {posts.length === 0 && !loading
            ? "No posts in queue."
            : `${posts.length} post${posts.length === 1 ? "" : "s"} queued`}
        </p>
      </div>

      {loading && <p className="ig-scheduled-state muted small">Loading…</p>}
      {error && <p className="ig-scheduled-state" style={{ color: "#e53e3e" }}>{getApolloErrorMessage(error)}</p>}

      {liveToast && (
        <div className="ig-live-toast" role="status">
          ✓ {liveToast}
        </div>
      )}

      <ul className="ig-scheduled-list">
        {posts.map((post) => {
          const images = (post.imageUrls ?? []).filter(Boolean).slice(0, 2);
          return (
            <li key={post.id} className="ig-scheduled-card">
              {images.length > 0 && (
                <div className="ig-scheduled-card-images">
                  {images.map((url, i) => (
                    <div
                      key={i}
                      className="ig-scheduled-card-img"
                      style={{ backgroundImage: `url(${url})` }}
                    />
                  ))}
                </div>
              )}

              <div className="ig-scheduled-card-body">
                {post.contentText && (
                  <p className="ig-scheduled-card-caption">{post.contentText}</p>
                )}

                <div className="ig-scheduled-card-meta">
                  <span className="ig-scheduled-chip">⏰ Scheduled</span>
                  {post.category?.name && (
                    <span className="ig-scheduled-category">{post.category.name}</span>
                  )}
                </div>

                <p className="ig-scheduled-countdown">{formatCountdown(post.scheduledAt)}</p>
                <p className="ig-scheduled-date">{formatDate(post.scheduledAt)}</p>

                <button
                  type="button"
                  className="ig-scheduled-cancel-btn"
                  onClick={() => void handleCancel(post.id)}
                  disabled={cancelling}
                >
                  Cancel post
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
