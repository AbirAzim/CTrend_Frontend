import { useApolloClient, useLazyQuery, useMutation, useQuery, useSubscription } from "@apollo/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FeedPostCard } from "../components/FeedPostCard";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS, POST_DELETED_SUB } from "../graphql/feed";
import {
  ADD_FRIEND,
  CANCEL_FRIEND_REQUEST,
  FRIEND_REQUESTS,
  FRIEND_SOCIAL_REFETCH_QUERIES,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
} from "../graphql/friends";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { ME } from "../graphql/profile";
import { START_DIRECT_CONVERSATION } from "../graphql/messages";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import type { FeedPostView } from "../types/feed";
import { CampaignBanners } from "../components/CampaignBanners";
import { ACTIVE_CAMPAIGNS } from "../graphql/campaigns";
type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};
type CampaignFilterRow = {
  id: string;
  name: string;
  isDefault?: boolean | null;
};

function friendName(f: FriendRow): string {
  // Show display name everywhere; fall back to @username when no display name is set
  return f.displayName?.trim() || `@${f.username?.trim() || "user"}`;
}

function friendInitial(f: FriendRow): string {
  return friendName(f).slice(0, 1).toUpperCase();
}

const SIDE_PREVIEW_LIMIT = 3;

function FriendMessageButton({ userId }: { userId: string }) {
  const { openChat, ensureConversation } = useMessenger();
  const [startDirect, { loading }] = useMutation(START_DIRECT_CONVERSATION);

  async function handleMessage() {
    try {
      const { data } = await startDirect({ variables: { userId } });
      const convo = data?.startDirectConversation;
      if (convo) { ensureConversation(convo); openChat(convo.id); }
    } catch { /* ignore — user can retry */ }
  }

  return (
    <button
      type="button"
      className="cx-friend-msg-btn"
      title="Send message"
      disabled={loading}
      onClick={() => void handleMessage()}
      aria-label="Send message"
    >
      {loading ? <span style={{ fontSize: "0.7rem" }}>…</span> : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      )}
    </button>
  );
}

function rotateSlice<T>(items: T[], offset: number, limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }
  const out: T[] = [];
  for (let i = 0; i < limit; i += 1) {
    out.push(items[(offset + i) % items.length]);
  }
  return out;
}

export function FeedPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCampaignId = searchParams.get("campaign")?.trim() || "";
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";
  const { isAuthenticated } = useAuth();
  const { onlineUserIds } = useMessenger();
  const client = useApolloClient();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [friendError, setFriendError] = useState<string | null>(null);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [activePeopleModal, setActivePeopleModal] = useState<
    "suggestions" | "friends" | "requestedMe" | "requestedByMe" | null
  >(null);
  const [modalSearch, setModalSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const [isCampaignFilterOpen, setIsCampaignFilterOpen] = useState(false);
  const [isCampaignFilterDockVisible, setIsCampaignFilterDockVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isWideScreen, setIsWideScreen] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 980px)").matches,
  );

  const { data, loading, error, refetch: refetchFeed } = useQuery(FEED_POSTS, {
    variables: { campaignId: activeCampaignId || null },
    skip: useMockFeed,
    fetchPolicy: "cache-and-network",
    // 20-second poll fallback so feed stays fresh even when the WS subscription
    // is suppressed (Safari background tab, network glitch, etc.). Cheap because
    // Apollo dedupes the network response into the same cache the subscription
    // updates write to.
    pollInterval: 20_000,
  });
  const { data: campaignsData } = useQuery<{ activeCampaigns: CampaignFilterRow[] }>(
    ACTIVE_CAMPAIGNS,
    {
      skip: useMockFeed,
      fetchPolicy: "cache-and-network",
    },
  );
  const {
    data: friendsData,
    loading: friendsLoading,
    refetch: refetchFriends,
  } = useQuery(MY_FRIENDS, {
    skip: useMockFeed || !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const { data: requestsData, loading: requestsLoading, refetch: refetchRequests } = useQuery(
    FRIEND_REQUESTS,
    {
      skip: useMockFeed || !isAuthenticated,
      fetchPolicy: "cache-first",
    },
  );
  const {
    data: suggestionsData,
    loading: suggestionsLoading,
    refetch: refetchSuggestions,
  } = useQuery(
    FRIEND_SUGGESTIONS,
    {
      variables: { limit: 8 },
      skip: useMockFeed || !isAuthenticated,
      fetchPolicy: "cache-first",
    },
  );
  const { data: meData, refetch: refetchMe } = useQuery(ME, {
    skip: useMockFeed || !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const [addFriend, { loading: addingFriend }] = useMutation(ADD_FRIEND, {
    refetchQueries: [
      { query: MY_FRIENDS },
      { query: FRIEND_SUGGESTIONS, variables: { limit: 8 } },
      { query: FRIEND_REQUESTS },
    ],
  });
  const [respondFriendRequest, { loading: respondingRequest }] = useMutation(
    RESPOND_FRIEND_REQUEST,
    {
      refetchQueries: [
        ...FRIEND_SOCIAL_REFETCH_QUERIES,
        { query: FRIEND_SUGGESTIONS, variables: { limit: 8 } },
      ],
    },
  );
  const [cancelFriendRequest, { loading: cancellingRequest }] = useMutation(
    CANCEL_FRIEND_REQUEST,
    {
      refetchQueries: [
        { query: FRIEND_REQUESTS },
        { query: FRIEND_SUGGESTIONS, variables: { limit: 8 } },
      ],
    },
  );

  async function onCancelOutgoingRequest(userId: string) {
    try {
      await cancelFriendRequest({ variables: { userId } });
    } catch { /* silent */ }
  }

  // Lazy query for all suggestions used in the "View all" modal (limit 100)
  const [fetchAllSuggestions, { data: allSuggestionsData, loading: allSuggestionsLoading }] =
    useLazyQuery<{ friendSuggestions: FriendRow[] }>(FRIEND_SUGGESTIONS, {
      fetchPolicy: "network-only",
    });

  const apiPosts: FeedPostView[] | null = data?.feedPosts
    ? data.feedPosts.map(mapGqlPostToFeedView)
    : null;

  const basePostsRaw: FeedPostView[] = useMockFeed
    ? mockPostsAsFeed()
    : (apiPosts ?? []);

  // Prepend subscription-delivered posts, excluding any already in the API results
  const knownIds = new Set(basePostsRaw.map((p) => p.id));
  const postsRaw: FeedPostView[] = [
    ...liveQueue.filter((p) => !knownIds.has(p.id) && !removedIds.has(p.id)),
    ...basePostsRaw.filter((p) => !removedIds.has(p.id)),
  ];
  const friends = (friendsData?.myFriends ?? []) as FriendRow[];
  const suggestions = (suggestionsData?.friendSuggestions ?? []) as FriendRow[];
  const requestedMe = (requestsData?.friendRequests?.requestedMe ?? []) as FriendRow[];
  const requestedByMe = (requestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[];

  // For the "View all" modal: full suggestions list (fetched lazily) filtered by search
  const allModalSuggestions = (allSuggestionsData?.friendSuggestions ?? suggestions) as FriendRow[];
  const filteredModalList = useMemo(() => {
    const base =
      activePeopleModal === "suggestions" ? allModalSuggestions
        : activePeopleModal === "friends" ? friends
          : activePeopleModal === "requestedMe" ? requestedMe
            : requestedByMe;
    if (!modalSearch.trim()) return base;
    const q = modalSearch.trim().toLowerCase();
    return base.filter(
      (f) =>
        friendName(f).toLowerCase().includes(q) ||
        (f.username?.toLowerCase().includes(q) ?? false) ||
        (f.email?.toLowerCase().includes(q) ?? false),
    );
  }, [activePeopleModal, allModalSuggestions, friends, requestedMe, requestedByMe, modalSearch]);

  const visibleSuggestions = rotateSlice(suggestions, suggestionOffset, SIDE_PREVIEW_LIMIT);
  const visibleFriends = friends.slice(0, SIDE_PREVIEW_LIMIT);
  const visibleRequestedMe = requestedMe.slice(0, SIDE_PREVIEW_LIMIT);
  const visibleRequestedByMe = requestedByMe.slice(0, SIDE_PREVIEW_LIMIT);
  const me = meData?.me as FriendRow | undefined;

  const posts: FeedPostView[] = useMemo(() => {
    const profileByUsername = new Map<string, string>();
    const profileByEmail = new Map<string, string>();
    const allKnownUsers = [me, ...friends, ...suggestions, ...requestedMe, ...requestedByMe].filter(
      Boolean,
    ) as FriendRow[];
    for (const person of allKnownUsers) {
      const image = normalizeProfileImageUrl(person.profileImageUrl);
      if (!image) continue;
      const username = person.username?.trim().toLowerCase();
      const email = person.email?.trim().toLowerCase();
      if (username) profileByUsername.set(username, image);
      if (email) profileByEmail.set(email, image);
    }
    return postsRaw.map((p) => {
      if (p.authorProfileImageUrl?.trim()) return p;
      const byUsername = profileByUsername.get(p.authorUsername.trim().toLowerCase());
      const byEmail = p.authorEmail
        ? profileByEmail.get(p.authorEmail.trim().toLowerCase())
        : undefined;
      return {
        ...p,
        authorProfileImageUrl: byUsername ?? byEmail ?? null,
      };
    });
  }, [me, friends, suggestions, requestedMe, requestedByMe, postsRaw]);
  const campaignFilters = useMemo(() => {
    const items = campaignsData?.activeCampaigns ?? [];
    return [...items].sort((a, b) => {
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [campaignsData?.activeCampaigns]);
  const activeCampaign = campaignFilters.find((c) => c.id === activeCampaignId) ?? null;

  const visiblePosts = useMemo(
    () => posts.slice(0, visibleCount),
    [posts, visibleCount],
  );

  const showApiError = !useMockFeed && Boolean(error);
  const showEmpty =
    !useMockFeed && !loading && !error && posts.length === 0;

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    skip: useMockFeed,
    onData: ({ data }) => {
      const postId = data.data?.newPosts?.postId;
      if (!postId) return;
      // Refetch the canonical feed so the new post is part of the main query
      // (handles ordering, pagination cursors, and any visibility filters).
      void refetchFeed();
      // Also fetch this specific post into the live queue for instant display
      // — covers the race between the subscription firing and the refetch landing.
      void client
        .query({ query: GET_POST_BY_ID, variables: { id: postId }, fetchPolicy: "network-only" })
        .then(({ data: postData }) => {
          const gqlPost = postData?.getPostById;
          if (!gqlPost) return;
          const postCampaignId = gqlPost.campaign?.id ?? "";
          if (activeCampaignId && postCampaignId !== activeCampaignId) return;
          setLiveQueue((prev) => {
            if (prev.some((p) => p.id === postId)) return prev;
            return [mapGqlPostToFeedView(gqlPost), ...prev];
          });
        })
        .catch(() => {/* post not visible to viewer — ignore */});
    },
  });

  // Realtime delete: when any viewer's post is removed, drop it from this feed.
  useSubscription<{ postDeleted: { postId: string } }>(POST_DELETED_SUB, {
    skip: useMockFeed,
    onData: ({ data }) => {
      const postId = data.data?.postDeleted?.postId;
      if (!postId) return;
      setRemovedIds((prev) => {
        if (prev.has(postId)) return prev;
        const next = new Set(prev);
        next.add(postId);
        return next;
      });
      // Also evict from Apollo cache so a refetch (or other consumers of this
      // query) don't keep showing the stale row.
      void refetchFeed();
    },
  });

  useEffect(() => {
    if (posts.length <= visibleCount) return;
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 6, posts.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [posts.length, visibleCount]);

  useEffect(() => {
    setVisibleCount((prev) => Math.min(Math.max(8, prev), Math.max(8, posts.length)));
  }, [posts.length]);

  useEffect(() => {
    setLiveQueue([]);
    setRemovedIds(new Set());
    setVisibleCount(8);
  }, [activeCampaignId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleScroll() {
      const currentY = window.scrollY;
      const scrollingDown = currentY > lastScrollYRef.current + 6;
      if (scrollingDown) {
        setIsCampaignFilterOpen(false);
      }
      // Keep filter dock only near top; hide it once user scrolls down.
      setIsCampaignFilterDockVisible(currentY < 96);
      lastScrollYRef.current = currentY;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 980px)");
    const update = () => setIsWideScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (useMockFeed) {
      return;
    }
    function handleRefreshFeed() {
      setLiveQueue([]);
      void refetchFeed();
      void refetchFriends();
      void refetchRequests();
      void refetchSuggestions({ limit: 8 });
      void refetchMe();
    }
    window.addEventListener("ctrend:refresh-feed", handleRefreshFeed);
    return () => {
      window.removeEventListener("ctrend:refresh-feed", handleRefreshFeed);
    };
  }, [useMockFeed, refetchFeed, refetchFriends, refetchRequests, refetchSuggestions, refetchMe]);

  useEffect(() => {
    if (suggestions.length <= SIDE_PREVIEW_LIMIT) {
      return;
    }
    const timer = setInterval(() => {
      setSuggestionOffset((prev) => (prev + 1) % suggestions.length);
    }, 22000);
    return () => clearInterval(timer);
  }, [suggestions.length]);

  useEffect(() => {
    if (!activePeopleModal) {
      document.body.style.overflow = "";
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Reset search and pre-fetch all suggestions when the modal opens
    setModalSearch("");
    if (activePeopleModal === "suggestions") {
      void fetchAllSuggestions({ variables: { limit: 100 } });
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activePeopleModal, fetchAllSuggestions]);

  async function onAddFriend(userId: string) {
    setFriendError(null);
    try {
      await addFriend({ variables: { userId } });
    } catch (err: unknown) {
      setFriendError(getApolloErrorMessage(err));
    }
  }

  async function onRespondRequest(requesterId: string, accept: boolean) {
    setFriendError(null);
    try {
      await respondFriendRequest({ variables: { requesterId, accept } });
    } catch (err: unknown) {
      setFriendError(getApolloErrorMessage(err));
    }
  }

  function setCampaignFilter(campaignId: string) {
    const next = new URLSearchParams(searchParams);
    if (campaignId) next.set("campaign", campaignId);
    else next.delete("campaign");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="cx-feed-layout">
      {isWideScreen ? (
      <aside className="cx-side-panel cx-side-panel--left" aria-label="Friend suggestions">
        <div className="cx-side-head">
          <h3 className="cx-side-panel-title">Suggestions</h3>
          {suggestions.length > SIDE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActivePeopleModal("suggestions")}
            >
              View all
            </button>
          ) : null}
        </div>
        {!useMockFeed && suggestionsLoading ? (
          <p className="muted small">Loading suggestions…</p>
        ) : null}
        {!useMockFeed && suggestions.length === 0 && !suggestionsLoading ? (
          <p className="muted small">No suggestions right now.</p>
        ) : null}
        <ul className="cx-friend-list">
          {visibleSuggestions.map((s) => (
            <li key={s.id} className="cx-friend-item">
              <Link to={`/profile/${s.id}`} className="cx-friend-avatar">
                {normalizeProfileImageUrl(s.profileImageUrl) ? (
                  <img src={normalizeProfileImageUrl(s.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                ) : (
                  friendInitial(s)
                )}
              </Link>
              <div className="cx-friend-meta">
                <Link to={`/profile/${s.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(s)}</strong>
                </Link>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={addingFriend}
                onClick={() => void onAddFriend(s.id)}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      </aside>
      ) : null}

      <div className="ig-feed">
        <CampaignBanners />
        {!useMockFeed && campaignFilters.length > 0 && isCampaignFilterDockVisible ? (
          <div className="cx-campaign-filter-dock">
            <button
              type="button"
              className={`cx-campaign-filter-toggle${isCampaignFilterOpen ? " cx-campaign-filter-toggle--active" : ""}`}
              aria-expanded={isCampaignFilterOpen}
              onClick={() => setIsCampaignFilterOpen((prev) => !prev)}
            >
              <span className="cx-campaign-filter-toggle-kicker">Filter feed</span>
              <span className="cx-campaign-filter-toggle-value">
                {activeCampaign ? activeCampaign.name : "All compares"}
              </span>
            </button>
            {isCampaignFilterOpen ? (
              <div className="cx-campaign-filter-shell">
                <div className="cx-campaign-filter-head">
                  <p className="cx-campaign-filter-title">Filter feed</p>
                  {activeCampaign ? (
                    <button
                      type="button"
                      className="cx-campaign-filter-clear"
                      onClick={() => setCampaignFilter("")}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="cx-campaign-filter-bar" aria-label="Filter posts by campaign">
                  <button
                    type="button"
                    className={`cx-campaign-filter-chip${!activeCampaignId ? " cx-campaign-filter-chip--active" : ""}`}
                    onClick={() => setCampaignFilter("")}
                  >
                    All compares
                  </button>
                  {campaignFilters.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      className={`cx-campaign-filter-chip${activeCampaignId === campaign.id ? " cx-campaign-filter-chip--active" : ""}${campaign.isDefault ? " cx-campaign-filter-chip--default" : ""}`}
                      onClick={() => setCampaignFilter(campaign.id)}
                    >
                      {campaign.name}
                    </button>
                  ))}
                </div>
                <p className="cx-campaign-filter-help muted small">
                  Pick one campaign to focus the feed instantly.
                </p>
                {activeCampaign ? (
                  <p className="cx-campaign-filter-note muted small">
                    Showing <strong>{activeCampaign.name}</strong> posts now.
                  </p>
                ) : null}
              </div>
            ) : null}
            {activeCampaign ? (
              <p className="cx-campaign-filter-current muted small">
                Active: <strong>{activeCampaign.name}</strong>
              </p>
            ) : null}
          </div>
        ) : null}

        {loading && !data && !useMockFeed && (
          <p className="ig-feed-status">Loading feed…</p>
        )}

        {showApiError && (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            <strong>Couldn't reach the feed.</strong>{" "}
            <span>Check your internet connection and try again.</span>
            <button
              type="button"
              className="ig-feed-banner-retry"
              onClick={() => void refetchFeed()}
            >
              Retry
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="ig-feed-empty-state">
            <p className="ig-feed-empty-title">Nothing here yet</p>
            <p className="ig-feed-empty-desc">
              Follow people to see their posts here. Official platform polls from
              Ke Jitbe are mixed into your feed when available.
            </p>
            {isAuthenticated && (
              <p className="muted small">
                Check the <strong>Suggestions</strong> panel to find people to follow.
              </p>
            )}
          </div>
        )}

        {visiblePosts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            voteMode={useMockFeed ? "local" : "api"}
          />
        ))}
        {visiblePosts.length < posts.length ? (
          <div ref={loadMoreRef} className="ig-feed-status">
            Loading more posts…
          </div>
        ) : null}

        {friendError ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {friendError}
          </div>
        ) : null}
      </div>

      {isWideScreen ? (
      <aside className="cx-side-panel cx-side-panel--right" aria-label="My friends">
        <div className="cx-side-head">
          <h3 className="cx-side-panel-title">Friends</h3>
          {friends.length > SIDE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActivePeopleModal("friends")}
            >
              View all
            </button>
          ) : null}
        </div>
        {!useMockFeed && friendsLoading ? (
          <p className="muted small">Loading friends…</p>
        ) : null}
        {!useMockFeed && friends.length === 0 && !friendsLoading ? (
          <p className="muted small">No friends yet.</p>
        ) : null}
        <ul className="cx-friend-list">
          {visibleFriends.map((f) => (
            <li key={f.id} className="cx-friend-item">
              <div className="cx-friend-avatar-wrap">
                <Link to={`/profile/${f.id}`} className="cx-friend-avatar">
                  {normalizeProfileImageUrl(f.profileImageUrl) ? (
                    <img src={normalizeProfileImageUrl(f.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    friendInitial(f)
                  )}
                </Link>
                {onlineUserIds.has(f.id) && <span className="cx-friend-online-dot" aria-hidden />}
              </div>
              <div className="cx-friend-meta">
                <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(f)}</strong>
                </Link>
              </div>
              <FriendMessageButton userId={f.id} />
            </li>
          ))}
        </ul>

        <div className="cx-side-head cx-side-head--sub">
          <h4 className="cx-side-subtitle">Requested me</h4>
          {requestedMe.length > SIDE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActivePeopleModal("requestedMe")}
            >
              View all
            </button>
          ) : null}
        </div>
        {!useMockFeed && requestsLoading ? (
          <p className="muted small">Loading requests…</p>
        ) : null}
        {!useMockFeed && !requestsLoading && requestedMe.length === 0 ? (
          <p className="muted small">No incoming requests.</p>
        ) : null}
        <ul className="cx-friend-list">
          {visibleRequestedMe.map((f) => (
            <li key={`in-${f.id}`} className="cx-friend-item">
              <Link to={`/profile/${f.id}`} className="cx-friend-avatar">
                {normalizeProfileImageUrl(f.profileImageUrl) ? (
                  <img src={normalizeProfileImageUrl(f.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                ) : (
                  friendInitial(f)
                )}
              </Link>
              <div className="cx-friend-request-content">
                <div className="cx-friend-meta">
                  <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                    <strong>{friendName(f)}</strong>
                  </Link>
                </div>
                <div className="cx-friend-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={respondingRequest}
                    onClick={() => void onRespondRequest(f.id, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={respondingRequest}
                    onClick={() => void onRespondRequest(f.id, false)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="cx-side-head cx-side-head--sub">
          <h4 className="cx-side-subtitle">Requested by me</h4>
          {requestedByMe.length > SIDE_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setActivePeopleModal("requestedByMe")}
            >
              View all
            </button>
          ) : null}
        </div>
        {!useMockFeed && !requestsLoading && requestedByMe.length === 0 ? (
          <p className="muted small">No outgoing requests.</p>
        ) : null}
        <ul className="cx-friend-list">
          {visibleRequestedByMe.map((f) => (
            <li key={`out-${f.id}`} className="cx-friend-item">
              <Link to={`/profile/${f.id}`} className="cx-friend-avatar">
                {normalizeProfileImageUrl(f.profileImageUrl) ? (
                  <img src={normalizeProfileImageUrl(f.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                ) : (
                  friendInitial(f)
                )}
              </Link>
              <div className="cx-friend-meta">
                <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(f)}</strong>
                </Link>
                <span className="cx-pending-tag">Pending</span>
              </div>
              <button
                type="button"
                className="cx-cancel-request-btn"
                disabled={cancellingRequest}
                onClick={() => void onCancelOutgoingRequest(f.id)}
                aria-label={`Cancel request to ${friendName(f)}`}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      </aside>
      ) : null}
      {isWideScreen && activePeopleModal ? (
        <div
          className="ig-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="People list"
          onClick={() => setActivePeopleModal(null)}
        >
          <section className="ig-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-post-comments-head">
              <input
                type="search"
                className="cx-modal-search-input"
                placeholder={
                  activePeopleModal === "suggestions"
                    ? "Search suggestions by name or email…"
                    : activePeopleModal === "friends"
                      ? "Search friends by name or email…"
                      : activePeopleModal === "requestedMe"
                        ? "Search requests…"
                        : "Search…"
                }
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                autoFocus
              />
              <button type="button" className="btn-ghost" onClick={() => setActivePeopleModal(null)}>
                Close
              </button>
            </div>
            <div className="cx-modal-list-scroll">
              {allSuggestionsLoading && activePeopleModal === "suggestions" ? (
                <p className="muted small" style={{ padding: "16px 12px" }}>Loading all users…</p>
              ) : filteredModalList.length === 0 ? (
                <p className="muted small" style={{ padding: "16px 12px" }}>
                  {modalSearch.trim() ? "No matches found." : "Nothing here yet."}
                </p>
              ) : null}
              <ul className="cx-friend-list">
                {filteredModalList.map((f) => (
                    <li key={`${activePeopleModal}-${f.id}`} className="cx-friend-item">
                      <div className="cx-friend-avatar-wrap">
                        <Link to={`/profile/${f.id}`} className="cx-friend-avatar" onClick={() => setActivePeopleModal(null)}>
                          {normalizeProfileImageUrl(f.profileImageUrl) ? (
                            <img src={normalizeProfileImageUrl(f.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                          ) : friendInitial(f)}
                        </Link>
                        {activePeopleModal === "friends" && onlineUserIds.has(f.id) && <span className="cx-friend-online-dot" aria-hidden />}
                      </div>
                      <div className="cx-friend-meta">
                        <Link to={`/profile/${f.id}`} className="cx-friend-profile-link" onClick={() => setActivePeopleModal(null)}>
                          <strong>{friendName(f)}</strong>
                        </Link>
                      </div>
                      {activePeopleModal === "friends" ? (
                        <FriendMessageButton userId={f.id} />
                      ) : null}
                      {activePeopleModal === "suggestions" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={addingFriend}
                          onClick={() => void onAddFriend(f.id)}
                        >
                          Add
                        </button>
                      ) : null}
                      {activePeopleModal === "requestedMe" ? (
                        <div className="cx-friend-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={respondingRequest}
                            onClick={() => void onRespondRequest(f.id, true)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={respondingRequest}
                            onClick={() => void onRespondRequest(f.id, false)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                      {activePeopleModal === "requestedByMe" ? (
                        <div className="cx-friend-actions">
                          <span className="cx-pending-tag">Pending</span>
                          <button
                            type="button"
                            className="cx-cancel-request-btn"
                            disabled={cancellingRequest}
                            onClick={() => void onCancelOutgoingRequest(f.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
