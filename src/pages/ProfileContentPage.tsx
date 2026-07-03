import { useApolloClient, useMutation, useQuery } from "@apollo/client";
import type { DocumentNode } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { ME, USER_POSTS, MY_VOTED_POSTS, MY_CONTENT_SUMMARY } from "../graphql/profile";
import { MY_SAVED_POSTS, MY_SCHEDULED_POSTS, CANCEL_SCHEDULED_POST } from "../graphql/feed";
import { EditPostModal } from "../components/EditPostModal";
import { FeedPostCard } from "../components/FeedPostCard";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import type { FeedPostView } from "../types/feed";
import { IconVote } from "../components/IgIcons";

type ProfileContentTab = "drops" | "scheduled" | "kept" | "voted";
type GqlPostRow = Parameters<typeof mapGqlPostToFeedView>[0];

const PAGE_SIZE = 20;

function formatScheduledCountdown(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "Publishing soon…";
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Goes live in ${days}d ${hours % 24}h`;
  if (hours > 0) return `Goes live in ${hours}h ${mins % 60}m`;
  return `Goes live in ${Math.max(mins, 1)}m`;
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

function tabSearch(tab: ProfileContentTab): string {
  if (tab === "scheduled") return "?tab=scheduled";
  if (tab === "kept") return "?tab=kept";
  if (tab === "voted") return "?tab=voted";
  return "";
}

/**
 * Lazy + infinite-scroll list for one "My Activity" tab. Only fetches once
 * `active` (the tab has been opened at least once) — mirrors the offset-paging
 * pattern in `FeedPage.tsx`'s `loadMoreFromServer`, backed by the same kind of
 * `merge` type policy registered in `src/lib/apolloClient.ts`.
 */
function usePaginatedProfileList(
  query: DocumentNode,
  dataKey: string,
  active: boolean,
  extraVariables: Record<string, unknown>,
) {
  const client = useApolloClient();
  const loadingMoreRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const baseVariables = { ...extraVariables, skip: 0, take: PAGE_SIZE };

  const { data, loading, fetchMore } = useQuery<Record<string, GqlPostRow[]>>(query, {
    variables: baseVariables,
    skip: !active,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: true,
  });

  const rawItems = data?.[dataKey] ?? [];
  const serverCount = rawItems.length;

  useEffect(() => {
    setHasMore(true);
  }, [JSON.stringify(extraVariables)]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (!active || loadingMoreRef.current || !hasMore || serverCount === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchMore({ variables: { ...extraVariables, skip: serverCount, take: PAGE_SIZE } });
      let mergedLen: number | undefined;
      try {
        const cached = client.readQuery<Record<string, GqlPostRow[]>>({
          query,
          variables: baseVariables,
        });
        mergedLen = cached?.[dataKey]?.length;
      } catch {
        mergedLen = undefined;
      }
      if (typeof mergedLen === "number" && mergedLen <= serverCount) {
        setHasMore(false);
      }
    } catch {
      // transient failure — allow a later retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasMore, serverCount, fetchMore, client, query, dataKey]);

  const items: FeedPostView[] = rawItems.map(mapGqlPostToFeedView);

  return {
    items,
    loading: active && loading && rawItems.length === 0,
    loadingMore,
    hasMore,
    loadMore,
  };
}

/** Sentinel div that triggers `onVisible` (via `loadMore`) when scrolled near. */
function LoadMoreSentinel({ onVisible, active }: { onVisible: () => void; active: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, onVisible]);
  return <div ref={ref} aria-hidden style={{ height: 1 }} />;
}

function SkeletonList() {
  return (
    <div className="cx-kept-grid" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="cx-kept-card cx-profile-card cx-profile-card--skeleton">
          <div className="cx-kept-card-media">
            <span className="cx-kept-card-thumb cx-skeleton" />
            <span className="cx-kept-card-thumb cx-skeleton" />
          </div>
          <div className="cx-kept-card-info">
            <span className="cx-skeleton cx-skeleton-line" style={{ width: "80%", height: "12px" }} />
            <span className="cx-skeleton cx-skeleton-line" style={{ width: "50%", height: "10px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileContentPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";
  const initialTab = new URLSearchParams(location.search).get("tab");

  const { data: meData } = useQuery(ME, { skip: !user, fetchPolicy: "cache-first" });
  const userId = meData?.me?.id ?? user?.id ?? "";

  const { data: summaryData } = useQuery(MY_CONTENT_SUMMARY, {
    skip: useMockFeed || !user,
    fetchPolicy: "cache-and-network",
  });
  const summary = summaryData?.myContentSummary;

  const [tab, setTab] = useState<ProfileContentTab>(() => {
    if (initialTab === "scheduled") return "scheduled";
    if (initialTab === "kept") return "kept";
    if (initialTab === "voted") return "voted";
    return "drops";
  });
  // Only fetch a tab's list the first time it's selected — the heaviest tab
  // (Voted) no longer loads in the background before the user even asks for it.
  const [visited, setVisited] = useState<Record<ProfileContentTab, boolean>>({
    drops: tab === "drops",
    scheduled: tab === "scheduled",
    kept: tab === "kept",
    voted: tab === "voted",
  });

  function selectTab(next: ProfileContentTab) {
    setTab(next);
    setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
    const nextSearch = tabSearch(next);
    if (location.search !== nextSearch) {
      navigate({ pathname: "/profile/content", search: nextSearch }, { replace: true });
    }
  }

  const [votedFilter, setVotedFilter] = useState<"all" | "anonymous">("all");
  const [cancelScheduledMut] = useMutation(CANCEL_SCHEDULED_POST);
  const [editingPost, setEditingPost] = useState<{
    id: string;
    format?: string | null;
    caption?: string | null;
    imageUrls: string[];
    options?: Array<{
      label?: string | null;
      imageUrl?: string | null;
      imageFocalX?: number | null;
      imageFocalY?: number | null;
    }> | null;
    category?: { id: string; name?: string | null } | null;
    campaign?: { id: string; name?: string | null; slug?: string | null } | null;
    votingEndsAt?: string | null;
    isVotingOpen?: boolean | null;
    isUserGlobalBroadcast?: boolean | null;
    endingSoonLeadMinutes?: number | null;
    status?: string | null;
    scheduledAt?: string | null;
    upvoteCount?: number | null;
    downvoteCount?: number | null;
    optionStats?: Array<{ index: number; count?: number | null }> | null;
  } | null>(null);

  const playgroundPosts = useMockFeed ? mockPostsAsFeed() : [];

  const drops = usePaginatedProfileList(USER_POSTS, "getPostsByUser", visited.drops && !useMockFeed, { userId });
  const scheduled = usePaginatedProfileList(MY_SCHEDULED_POSTS, "myScheduledPosts", visited.scheduled && !useMockFeed, {});
  const kept = usePaginatedProfileList(MY_SAVED_POSTS, "mySavedPosts", visited.kept && !useMockFeed, {});
  const voted = usePaginatedProfileList(MY_VOTED_POSTS, "myVotedPosts", visited.voted && !useMockFeed, {
    anonymousOnly: votedFilter === "anonymous",
  });

  const dropPosts = useMockFeed ? playgroundPosts : drops.items;

  async function handleCancelScheduled(postId: string) {
    if (!window.confirm("Cancel this scheduled post? This can't be undone.")) return;
    try {
      await cancelScheduledMut({ variables: { postId } });
    } catch (err) {
      alert(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="cx-profile-content-page">
      <div className="cx-profile-content-page-header">
        <Link to="/profile" className="ig-scheduled-back">← Profile</Link>
        <h1 className="cx-profile-content-page-title">My Activity</h1>
        <p className="muted small">
          {summary
            ? `${summary.dropsCount} drops · ${summary.scheduledCount} scheduled · ${summary.keptCount} kept · ${summary.votedCount} voted`
            : "Drops, schedule, saves & votes"}
        </p>
      </div>

      <div className="cx-profile-content-tabbar">
        <Link to="/profile" className="cx-profile-content-tabbar-back" aria-label="Back to profile">
          ←
        </Link>
        <div className="cx-conn-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "drops"}
          className={`cx-conn-tab${tab === "drops" ? " cx-conn-tab--active" : ""}`}
          onClick={() => selectTab("drops")}
        >
          ✨ Your drops
          {(summary?.dropsCount ?? 0) > 0 && <span className="cx-conn-tab-badge">{summary?.dropsCount}</span>}
        </button>
        {!useMockFeed && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scheduled"}
            className={`cx-conn-tab${tab === "scheduled" ? " cx-conn-tab--active" : ""}`}
            onClick={() => selectTab("scheduled")}
          >
            ⏰ Scheduled
            {(summary?.scheduledCount ?? 0) > 0 && (
              <span className="cx-conn-tab-badge">{summary?.scheduledCount}</span>
            )}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "kept"}
          className={`cx-conn-tab${tab === "kept" ? " cx-conn-tab--active" : ""}`}
          onClick={() => selectTab("kept")}
        >
          🔖 Kept
          {(summary?.keptCount ?? 0) > 0 && <span className="cx-conn-tab-badge">{summary?.keptCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "voted"}
          className={`cx-conn-tab${tab === "voted" ? " cx-conn-tab--active" : ""}`}
          onClick={() => selectTab("voted")}
        >
          <IconVote size={14} />
          Voted
          {(summary?.votedCount ?? 0) > 0 && <span className="cx-conn-tab-badge">{summary?.votedCount}</span>}
        </button>
        </div>
      </div>

      {tab === "drops" && (
        <div className="cx-profile-content-panel" role="tabpanel">
          {useMockFeed && (
            <p className="cx-profile-demo-note" style={{ padding: "12px 16px" }}>
              <strong>Playground:</strong> sample compares — connect the API to see your real posts.
            </p>
          )}
          {!useMockFeed && drops.loading && <SkeletonList />}
          {!useMockFeed && !drops.loading && dropPosts.length === 0 && (
            <div className="cx-conn-empty">
              <span className="cx-conn-empty-icon">✨</span>
              <p>No compares yet.</p>
              <NavLink to="/create" className="cx-conn-btn cx-conn-btn--add" style={{ marginTop: "8px", textDecoration: "none" }}>
                Create your first compare
              </NavLink>
            </div>
          )}
          {dropPosts.length > 0 && (
            <div className="ig-feed">
              {dropPosts.map((post) => (
                <FeedPostCard key={post.id} post={post} voteMode={useMockFeed ? "local" : "api"} />
              ))}
              {!useMockFeed && (
                <>
                  <LoadMoreSentinel active={drops.hasMore} onVisible={() => void drops.loadMore()} />
                  {drops.loadingMore && <p className="cx-conn-empty small">Loading more…</p>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "scheduled" && (
        <div className="cx-profile-content-panel" role="tabpanel">
          {scheduled.loading ? (
            <SkeletonList />
          ) : scheduled.items.length === 0 ? (
            <div className="cx-conn-empty">
              <span className="cx-conn-empty-icon">⏰</span>
              <p>No scheduled posts. Schedule a post for later from Create.</p>
              <NavLink to="/create" className="cx-conn-btn cx-conn-btn--add" style={{ marginTop: "8px", textDecoration: "none" }}>
                Create a post
              </NavLink>
            </div>
          ) : (
            <div className="ig-feed">
              {scheduled.items.map((post) => (
                <div key={post.id} className="cx-scheduled-feed-item">
                  <div className="cx-scheduled-meta-bar">
                    <p className="cx-scheduled-countdown">
                      {post.scheduledAt ? formatScheduledCountdown(post.scheduledAt) : "Publishing soon…"}
                    </p>
                    <p className="cx-scheduled-date">
                      {post.scheduledAt ? `Goes live ${formatGoLiveDate(post.scheduledAt)}` : null}
                    </p>
                    <div className="cx-scheduled-actions">
                      <button
                        type="button"
                        className="cx-scheduled-edit-btn"
                        onClick={() =>
                          setEditingPost({
                            id: post.id,
                            format: post.format,
                            caption: post.caption,
                            imageUrls: post.imageUrls ?? [],
                            options: post.postOptions,
                            category: post.category,
                            campaign: post.campaign,
                            votingEndsAt: post.votingEndsAt,
                            isVotingOpen: post.isVotingOpen,
                            endingSoonLeadMinutes: post.endingSoonLeadMinutes,
                            isUserGlobalBroadcast: post.isUserGlobalBroadcast,
                            status: post.status,
                            scheduledAt: post.scheduledAt,
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="cx-scheduled-cancel-btn"
                        onClick={() => void handleCancelScheduled(post.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <FeedPostCard post={post} voteMode="api" />
                </div>
              ))}
              <LoadMoreSentinel active={scheduled.hasMore} onVisible={() => void scheduled.loadMore()} />
              {scheduled.loadingMore && <p className="cx-conn-empty small">Loading more…</p>}
            </div>
          )}
        </div>
      )}

      {tab === "kept" && (
        <div className="cx-profile-content-panel" role="tabpanel">
          {kept.loading ? (
            <SkeletonList />
          ) : kept.items.length === 0 ? (
            <div className="cx-conn-empty">
              <span className="cx-conn-empty-icon">🔖</span>
              <p>No kept posts yet. Bookmark posts from the feed!</p>
            </div>
          ) : (
            <div className="ig-feed">
              {kept.items.map((post) => (
                <FeedPostCard key={`kept-${post.id}`} post={post} voteMode="api" />
              ))}
              <LoadMoreSentinel active={kept.hasMore} onVisible={() => void kept.loadMore()} />
              {kept.loadingMore && <p className="cx-conn-empty small">Loading more…</p>}
            </div>
          )}
        </div>
      )}

      {tab === "voted" && (
        <div className="cx-profile-content-panel" role="tabpanel">
          <div className="cx-voted-filter" role="group" aria-label="Filter voted posts">
            <button
              type="button"
              className={`cx-voted-filter-btn${votedFilter === "all" ? " cx-voted-filter-btn--active" : ""}`}
              aria-pressed={votedFilter === "all"}
              onClick={() => setVotedFilter("all")}
            >
              All votes
            </button>
            <button
              type="button"
              className={`cx-voted-filter-btn${votedFilter === "anonymous" ? " cx-voted-filter-btn--active" : ""}`}
              aria-pressed={votedFilter === "anonymous"}
              onClick={() => setVotedFilter("anonymous")}
            >
              👻 Anonymous
            </button>
          </div>
          {voted.loading ? (
            <SkeletonList />
          ) : voted.items.length === 0 ? (
            <div className="cx-conn-empty">
              <span className="cx-conn-empty-icon" aria-hidden><IconVote size={28} /></span>
              <p>
                {votedFilter === "anonymous"
                  ? "You haven't voted anonymously on any posts yet."
                  : "You haven't voted on any posts yet."}
              </p>
            </div>
          ) : (
            <div className="ig-feed">
              {voted.items.map((post) => (
                <FeedPostCard key={`voted-${post.id}`} post={post} voteMode="api" />
              ))}
              <LoadMoreSentinel active={voted.hasMore} onVisible={() => void voted.loadMore()} />
              {voted.loadingMore && <p className="cx-conn-empty small">Loading more…</p>}
            </div>
          )}
        </div>
      )}

      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => setEditingPost(null)}
        />
      )}
    </div>
  );
}
