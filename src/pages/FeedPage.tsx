import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useState } from "react";
import { FeedPostCard } from "../components/FeedPostCard";
import { FEED_POSTS } from "../graphql/feed";
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
import type { FeedPostView } from "../types/feed";

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

export function FeedPage() {
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";
  const [friendError, setFriendError] = useState<string | null>(null);

  const { data, loading, error, refetch: refetchFeed } = useQuery(FEED_POSTS, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
  });
  const {
    data: friendsData,
    loading: friendsLoading,
    refetch: refetchFriends,
  } = useQuery(MY_FRIENDS, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
  });
  const { data: requestsData, loading: requestsLoading, refetch: refetchRequests } = useQuery(
    FRIEND_REQUESTS,
    {
      skip: useMockFeed,
      fetchPolicy: "network-only",
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
      skip: useMockFeed,
      fetchPolicy: "network-only",
    },
  );
  const { data: meData, refetch: refetchMe } = useQuery(ME, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
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

  const postsRaw: FeedPostView[] = useMockFeed
    ? mockPostsAsFeed()
    : (apiPosts ?? []);
  const friends = (friendsData?.myFriends ?? []) as FriendRow[];
  const suggestions = (suggestionsData?.friendSuggestions ?? []) as FriendRow[];
  const requestedMe = (requestsData?.friendRequests?.requestedMe ?? []) as FriendRow[];
  const requestedByMe = (requestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[];
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

  useEffect(() => {
    if (useMockFeed) {
      return;
    }
    function handleRefreshFeed() {
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
        <h3 className="cx-side-panel-title">Suggestions</h3>
        {!useMockFeed && suggestionsLoading ? (
          <p className="muted small">Loading suggestions…</p>
        ) : null}
        {!useMockFeed && suggestions.length === 0 && !suggestionsLoading ? (
          <p className="muted small">No suggestions right now.</p>
        ) : null}
        <ul className="cx-friend-list">
          {suggestions.map((s) => (
            <li key={s.id} className="cx-friend-item">
              <span className="cx-friend-avatar">
                {s.profileImageUrl ? (
                  <img src={s.profileImageUrl} alt="" />
                ) : (
                  friendInitial(s)
                )}
              </span>
              <div className="cx-friend-meta">
                <strong>{friendName(s)}</strong>
                <span>@{s.username ?? "user"}</span>
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

        {friendError ? (
          <div className="ig-feed-banner ig-feed-banner--error" role="alert">
            {friendError}
          </div>
        ) : null}
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

      <aside className="cx-side-panel cx-side-panel--right" aria-label="My friends">
        <h3 className="cx-side-panel-title">Friends</h3>
        {!useMockFeed && friendsLoading ? (
          <p className="muted small">Loading friends…</p>
        ) : null}
        {!useMockFeed && friends.length === 0 && !friendsLoading ? (
          <p className="muted small">No friends yet.</p>
        ) : null}
        <ul className="cx-friend-list">
          {friends.map((f) => (
            <li key={f.id} className="cx-friend-item">
              <span className="cx-friend-avatar">
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </span>
              <div className="cx-friend-meta">
                <strong>{friendName(f)}</strong>
                <span>@{f.username ?? "user"}</span>
              </div>
            </li>
          ))}
        </ul>

        <h4 className="cx-side-subtitle">Requested me</h4>
        {!useMockFeed && requestsLoading ? (
          <p className="muted small">Loading requests…</p>
        ) : null}
        {!useMockFeed && !requestsLoading && requestedMe.length === 0 ? (
          <p className="muted small">No incoming requests.</p>
        ) : null}
        <ul className="cx-friend-list">
          {requestedMe.map((f) => (
            <li key={`in-${f.id}`} className="cx-friend-item">
              <span className="cx-friend-avatar">
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </span>
              <div className="cx-friend-request-content">
                <div className="cx-friend-meta">
                  <strong>{friendName(f)}</strong>
                  <span>@{f.username ?? "user"}</span>
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

        <h4 className="cx-side-subtitle">Requested by me</h4>
        {!useMockFeed && !requestsLoading && requestedByMe.length === 0 ? (
          <p className="muted small">No outgoing requests.</p>
        ) : null}
        <ul className="cx-friend-list">
          {requestedByMe.map((f) => (
            <li key={`out-${f.id}`} className="cx-friend-item">
              <span className="cx-friend-avatar">
                {f.profileImageUrl ? (
                  <img src={f.profileImageUrl} alt="" />
                ) : (
                  friendInitial(f)
                )}
              </span>
              <div className="cx-friend-meta">
                <strong>{friendName(f)}</strong>
                <span>@{f.username ?? "user"}</span>
              </div>
              <span className="cx-pending-badge">Pending</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
