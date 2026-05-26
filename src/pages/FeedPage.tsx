import { useApolloClient, useMutation, useQuery, useSubscription } from "@apollo/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FeedPostCard } from "../components/FeedPostCard";
import { FEED_POSTS, GET_POST_BY_ID, NEW_POSTS } from "../graphql/feed";
import {
  ADD_FRIEND,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
} from "../graphql/friends";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { ME } from "../graphql/profile";
import { useAuth } from "../context/AuthContext";
import type { FeedPostView } from "../types/feed";
import { CampaignBanners } from "../components/CampaignBanners";

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

function friendName(f: FriendRow): string {
  return f.displayName?.trim() || f.username?.trim() || "User";
}

function friendInitial(f: FriendRow): string {
  return friendName(f).slice(0, 1).toUpperCase();
}

const SIDE_PREVIEW_LIMIT = 3;

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
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";
  const { isAuthenticated } = useAuth();
  const client = useApolloClient();
  const [liveQueue, setLiveQueue] = useState<FeedPostView[]>([]);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [suggestionOffset, setSuggestionOffset] = useState(0);
  const [activePeopleModal, setActivePeopleModal] = useState<
    "suggestions" | "friends" | "requestedMe" | "requestedByMe" | null
  >(null);

  const { data, loading, error, refetch: refetchFeed } = useQuery(FEED_POSTS, {
    skip: useMockFeed,
    fetchPolicy: "cache-and-network",
  });
  const {
    data: friendsData,
    loading: friendsLoading,
    refetch: refetchFriends,
  } = useQuery(MY_FRIENDS, {
    skip: useMockFeed || !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const { data: requestsData, loading: requestsLoading, refetch: refetchRequests } = useQuery(
    FRIEND_REQUESTS,
    {
      skip: useMockFeed || !isAuthenticated,
      fetchPolicy: "cache-and-network",
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
      fetchPolicy: "cache-and-network",
    },
  );
  const { data: meData, refetch: refetchMe } = useQuery(ME, {
    skip: useMockFeed || !isAuthenticated,
    fetchPolicy: "cache-and-network",
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
        { query: FRIEND_REQUESTS },
        { query: MY_FRIENDS },
        { query: FRIEND_SUGGESTIONS, variables: { limit: 8 } },
      ],
    },
  );

  const apiPosts: FeedPostView[] | null = data?.feedPosts
    ? data.feedPosts.map(mapGqlPostToFeedView)
    : null;

  const basePostsRaw: FeedPostView[] = useMockFeed
    ? mockPostsAsFeed()
    : (apiPosts ?? []);

  // Prepend subscription-delivered posts, excluding any already in the API results
  const knownIds = new Set(basePostsRaw.map((p) => p.id));
  const postsRaw: FeedPostView[] = [
    ...liveQueue.filter((p) => !knownIds.has(p.id)),
    ...basePostsRaw,
  ];
  const friends = (friendsData?.myFriends ?? []) as FriendRow[];
  const suggestions = (suggestionsData?.friendSuggestions ?? []) as FriendRow[];
  const requestedMe = (requestsData?.friendRequests?.requestedMe ?? []) as FriendRow[];
  const requestedByMe = (requestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[];
  const visibleSuggestions = rotateSlice(suggestions, suggestionOffset, SIDE_PREVIEW_LIMIT);
  const visibleFriends = friends.slice(0, SIDE_PREVIEW_LIMIT);
  const visibleRequestedMe = requestedMe.slice(0, SIDE_PREVIEW_LIMIT);
  const visibleRequestedByMe = requestedByMe.slice(0, SIDE_PREVIEW_LIMIT);
  const me = meData?.me as FriendRow | undefined;

  const profileByUsername = new Map<string, string>();
  const profileByEmail = new Map<string, string>();
  const allKnownUsers = [me, ...friends, ...suggestions, ...requestedMe, ...requestedByMe].filter(
    Boolean,
  ) as FriendRow[];
  for (const person of allKnownUsers) {
    const image = person.profileImageUrl?.trim();
    if (!image) {
      continue;
    }
    const username = person.username?.trim().toLowerCase();
    const email = person.email?.trim().toLowerCase();
    if (username) {
      profileByUsername.set(username, image);
    }
    if (email) {
      profileByEmail.set(email, image);
    }
  }

  const posts: FeedPostView[] = postsRaw.map((p) => {
    if (p.authorProfileImageUrl?.trim()) {
      return p;
    }
    const byUsername = profileByUsername.get(p.authorUsername.trim().toLowerCase());
    const byEmail = p.authorEmail
      ? profileByEmail.get(p.authorEmail.trim().toLowerCase())
      : undefined;
    return {
      ...p,
      authorProfileImageUrl: byUsername ?? byEmail ?? null,
    };
  });

  const showApiError = !useMockFeed && Boolean(error);
  const showEmpty =
    !useMockFeed && !loading && !error && posts.length === 0;

  useSubscription<{ newPosts: { postId: string } }>(NEW_POSTS, {
    skip: useMockFeed,
    onData: ({ data }) => {
      const postId = data.data?.newPosts?.postId;
      if (!postId) return;
      void client
        .query({ query: GET_POST_BY_ID, variables: { id: postId }, fetchPolicy: "network-only" })
        .then(({ data: postData }) => {
          const gqlPost = postData?.getPostById;
          if (!gqlPost) return;
          setLiveQueue((prev) => {
            if (prev.some((p) => p.id === postId)) return prev;
            return [mapGqlPostToFeedView(gqlPost), ...prev];
          });
        })
        .catch(() => {/* post not visible to viewer — ignore */});
    },
  });

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
    return () => {
      document.body.style.overflow = previous;
    };
  }, [activePeopleModal]);

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

  return (
    <div className="cx-feed-layout">
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
                {s.profileImageUrl ? (
                  <img src={s.profileImageUrl} alt="" />
                ) : (
                  friendInitial(s)
                )}
              </Link>
              <div className="cx-friend-meta">
                <Link to={`/profile/${s.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(s)}</strong>
                  <span>@{s.username ?? "user"}</span>
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

      <div className="ig-feed">
        <CampaignBanners />

        {loading && !data && !useMockFeed && (
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
          <div className="ig-feed-empty-state">
            <p className="ig-feed-empty-title">Nothing here yet</p>
            <p className="ig-feed-empty-desc">
              Follow people to see their posts here. The feed shows posts from
              people you follow — platform-wide posts from Ke Jitbe also appear here.
            </p>
            {isAuthenticated && (
              <p className="muted small">
                Check the <strong>Suggestions</strong> panel to find people to follow.
              </p>
            )}
          </div>
        )}

        {posts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            voteMode={useMockFeed ? "local" : "api"}
          />
        ))}

        {friendError ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {friendError}
          </div>
        ) : null}
      </div>

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
              <Link to={`/profile/${f.id}`} className="cx-friend-avatar">
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </Link>
              <div className="cx-friend-meta">
                <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(f)}</strong>
                  <span>@{f.username ?? "user"}</span>
                </Link>
              </div>
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
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </Link>
              <div className="cx-friend-request-content">
                <div className="cx-friend-meta">
                  <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                    <strong>{friendName(f)}</strong>
                    <span>@{f.username ?? "user"}</span>
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
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </Link>
              <div className="cx-friend-meta">
                <Link to={`/profile/${f.id}`} className="cx-friend-profile-link">
                  <strong>{friendName(f)}</strong>
                  <span>@{f.username ?? "user"}</span>
                </Link>
              </div>
              <span className="cx-pending-badge">Pending</span>
            </li>
          ))}
        </ul>
      </aside>
      {activePeopleModal ? (
        <div
          className="ig-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="People list"
          onClick={() => setActivePeopleModal(null)}
        >
          <section className="ig-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ig-post-comments-head">
              <h3 className="ig-post-comments-title">
                {activePeopleModal === "suggestions"
                  ? "All suggestions"
                  : activePeopleModal === "friends"
                    ? "All friends"
                    : activePeopleModal === "requestedMe"
                      ? "Requested me"
                      : "Requested by me"}
              </h3>
              <button type="button" className="btn-ghost" onClick={() => setActivePeopleModal(null)}>
                Close
              </button>
            </div>
            <div className="cx-modal-list-scroll">
              <ul className="cx-friend-list">
                {(activePeopleModal === "suggestions"
                  ? suggestions
                  : activePeopleModal === "friends"
                    ? friends
                    : activePeopleModal === "requestedMe"
                      ? requestedMe
                      : requestedByMe
                  ).map((f) => (
                    <li key={`${activePeopleModal}-${f.id}`} className="cx-friend-item">
                      <Link to={`/profile/${f.id}`} className="cx-friend-avatar" onClick={() => setActivePeopleModal(null)}>
                        {f.profileImageUrl ? <img src={f.profileImageUrl} alt="" /> : friendInitial(f)}
                      </Link>
                      <div className="cx-friend-meta">
                        <Link to={`/profile/${f.id}`} className="cx-friend-profile-link" onClick={() => setActivePeopleModal(null)}>
                          <strong>{friendName(f)}</strong>
                          <span>@{f.username ?? "user"}</span>
                        </Link>
                      </div>
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
                        <span className="cx-pending-badge">Pending</span>
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
