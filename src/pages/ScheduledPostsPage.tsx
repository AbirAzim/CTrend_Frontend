import { useMutation, useQuery, useSubscription } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
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

function scheduledImages(post: ScheduledPost): string[] {
  const fromUrls = (post.imageUrls ?? []).filter((u) => typeof u === "string" && u.trim());
  if (fromUrls.length > 0) return fromUrls.slice(0, 2);
  return (post.options ?? [])
    .map((o) => o.imageUrl?.trim())
    .filter((u): u is string => Boolean(u))
    .slice(0, 2);
}

function formatCountdown(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Publishing soon…";
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Goes live in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Goes live in ${hours}h ${mins % 60}m`;
  return `Goes live in ${mins}m`;
}

function formatGoLiveDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ScheduledPostsPage() {
  const { data, loading, error, refetch } = useQuery<{ myScheduledPosts: ScheduledPost[] }>(
    MY_SCHEDULED_POSTS,
    { fetchPolicy: "network-only", pollInterval: 10_000 },
  );

  const [cancelPost, { loading: cancelling }] = useMutation(CANCEL_SCHEDULED_POST);
  const [goneLiveIds, setGoneLiveIds] = useState<ReadonlySet<string>>(new Set());
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

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
      {error && (
        <p className="ig-scheduled-state" style={{ color: "#e53e3e" }}>
          {getApolloErrorMessage(error)}
        </p>
      )}

      {liveToast && (
        <div className="ig-live-toast" role="status">
          ✓ {liveToast}
        </div>
      )}

      <ul className="ig-scheduled-list">
        {posts.map((post) => {
          const images = scheduledImages(post);
          const optionLabels = (post.options ?? [])
            .map((o) => o.label?.trim())
            .filter((label): label is string => Boolean(label))
            .slice(0, 4);

          return (
            <li key={post.id} className="ig-scheduled-card">
              <div className="ig-scheduled-card-media">
                {images.length > 0 ? (
                  <div className={`ig-scheduled-card-images ig-scheduled-card-images--${images.length}`}>
                    {images.map((url, i) => (
                      <div
                        key={i}
                        className="ig-scheduled-card-img"
                        style={{ backgroundImage: `url(${url})` }}
                        role="img"
                        aria-label={`Option ${i + 1}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="ig-scheduled-card-placeholder" aria-hidden>
                    <span>🖼</span>
                    <span>No preview</span>
                  </div>
                )}
              </div>

              <div className="ig-scheduled-card-body">
                {post.contentText && (
                  <p className="ig-scheduled-card-caption">{post.contentText}</p>
                )}

                {optionLabels.length > 0 && (
                  <div className="ig-scheduled-option-chips">
                    {optionLabels.map((label) => (
                      <span key={label} className="ig-scheduled-option-chip">
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="ig-scheduled-card-meta">
                  <span className="ig-scheduled-chip">⏰ Scheduled</span>
                  {post.category?.name && (
                    <span className="ig-scheduled-category">{post.category.name}</span>
                  )}
                </div>

                <p className="ig-scheduled-countdown">{formatCountdown(post.scheduledAt)}</p>
                <p className="ig-scheduled-date">
                  Goes live at {formatGoLiveDate(post.scheduledAt)}
                </p>

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
