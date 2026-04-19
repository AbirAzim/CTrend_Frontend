import { useMutation, useQuery } from "@apollo/client";
import { useMemo, useState } from "react";
import {
  ADD_FRIEND,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
} from "../graphql/friends";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

function friendName(f: FriendRow): string {
  return f.displayName?.trim() || f.username?.trim() || "User";
}

function friendInitial(f: FriendRow): string {
  return friendName(f).slice(0, 1).toUpperCase();
}

export function FriendsPage() {
  const [tab, setTab] = useState<"suggestions" | "requests" | "friends">(
    "suggestions",
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Record<string, true>>({});
  const { data: requestsData, loading: requestsLoading } = useQuery(
    FRIEND_REQUESTS,
    { fetchPolicy: "network-only" },
  );
  const { data: friendsData, loading: friendsLoading } = useQuery(MY_FRIENDS, {
    fetchPolicy: "network-only",
  });
  const { data: suggestionsData, loading: suggestionsLoading } = useQuery(
    FRIEND_SUGGESTIONS,
    {
      variables: { limit: 20 },
      fetchPolicy: "network-only",
    },
  );

  const [addFriend, { loading: addingFriend }] = useMutation(ADD_FRIEND, {
    refetchQueries: [
      { query: FRIEND_SUGGESTIONS, variables: { limit: 20 } },
      { query: FRIEND_REQUESTS },
      { query: MY_FRIENDS },
    ],
  });
  const [respondRequest, { loading: responding }] = useMutation(
    RESPOND_FRIEND_REQUEST,
    {
      refetchQueries: [
        { query: FRIEND_REQUESTS },
        { query: MY_FRIENDS },
      ],
    },
  );

  const requestedMe = (requestsData?.friendRequests?.requestedMe ?? []) as FriendRow[];
  const requestedByMe = (requestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[];
  const friends = useMemo(() => (friendsData?.myFriends ?? []) as FriendRow[], [friendsData]);
  const suggestions = (suggestionsData?.friendSuggestions ?? []) as FriendRow[];
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  async function onAddFriend(userId: string) {
    setActionError(null);
    try {
      const { data } = await addFriend({ variables: { userId } });
      if (String(data?.addFriend ?? "").toLowerCase() === "requested") {
        setRequestedIds((prev) => ({ ...prev, [userId]: true }));
      }
    } catch (err: unknown) {
      setActionError(getApolloErrorMessage(err));
    }
  }

  async function onRespond(requesterId: string, accept: boolean) {
    setActionError(null);
    try {
      await respondRequest({
        variables: { requesterId, accept },
      });
    } catch (err: unknown) {
      setActionError(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="cx-friends-page">
      <h1 className="cx-friends-title">Friends</h1>
      <div className="cx-friends-tabs" role="tablist" aria-label="Friends sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "suggestions"}
          className={`cx-friends-tab${tab === "suggestions" ? " is-active" : ""}`}
          onClick={() => setTab("suggestions")}
        >
          Suggestions
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          className={`cx-friends-tab${tab === "requests" ? " is-active" : ""}`}
          onClick={() => setTab("requests")}
        >
          Requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "friends"}
          className={`cx-friends-tab${tab === "friends" ? " is-active" : ""}`}
          onClick={() => setTab("friends")}
        >
          My Friends
        </button>
      </div>
      {actionError ? (
        <div className="ig-feed-banner ig-feed-banner--error" role="alert">
          {actionError}
        </div>
      ) : null}

      {tab === "suggestions" ? (
        <section className="cx-friends-block" aria-label="Friend suggestions">
          <h2>Suggestions</h2>
          {suggestionsLoading ? (
            <p className="muted small">Loading suggestions…</p>
          ) : null}
          {!suggestionsLoading && suggestions.length === 0 ? (
            <p className="muted small">No suggestions right now.</p>
          ) : null}
          <ul className="cx-friend-list">
            {suggestions.map((u) => {
              const requested =
                Boolean(requestedIds[u.id]) ||
                requestedByMe.some((x) => x.id === u.id);
              const accepted = friendIds.has(u.id);
              return (
                <li key={u.id} className="cx-friend-item">
                  <span className="cx-friend-avatar">
                    {u.profileImageUrl ? (
                      <img src={u.profileImageUrl} alt="" />
                    ) : (
                      friendInitial(u)
                    )}
                  </span>
                  <div className="cx-friend-meta">
                    <strong>{friendName(u)}</strong>
                    <span>@{u.username ?? "user"}</span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={addingFriend || requested || accepted}
                    onClick={() => void onAddFriend(u.id)}
                  >
                    {accepted ? "Friends" : requested ? "Requested" : "Add Friend"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === "requests" ? (
        <section className="cx-friends-block" aria-label="Friend requests">
          <h2>Requests</h2>
          {requestsLoading ? <p className="muted small">Loading requests…</p> : null}
          {!requestsLoading &&
          requestedMe.length === 0 &&
          requestedByMe.length === 0 ? (
            <p className="muted small">No pending requests.</p>
          ) : null}

          {requestedMe.length > 0 ? (
            <>
              <p className="muted small">Requested me</p>
              <ul className="cx-friend-list">
                {requestedMe.map((u) => (
                  <li key={u.id} className="cx-friend-item">
                    <span className="cx-friend-avatar">
                      {u.profileImageUrl ? (
                        <img src={u.profileImageUrl} alt="" />
                      ) : (
                        friendInitial(u)
                      )}
                    </span>
                    <div className="cx-friend-meta">
                      <strong>{friendName(u)}</strong>
                      <span>@{u.username ?? "user"}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={responding}
                      onClick={() => void onRespond(u.id, true)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={responding}
                      onClick={() => void onRespond(u.id, false)}
                    >
                      Reject
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {requestedByMe.length > 0 ? (
            <>
              <p className="muted small">Requested by me</p>
              <ul className="cx-friend-list">
                {requestedByMe.map((u) => (
                  <li key={u.id} className="cx-friend-item">
                    <span className="cx-friend-avatar">
                      {u.profileImageUrl ? (
                        <img src={u.profileImageUrl} alt="" />
                      ) : (
                        friendInitial(u)
                      )}
                    </span>
                    <div className="cx-friend-meta">
                      <strong>{friendName(u)}</strong>
                      <span>@{u.username ?? "user"}</span>
                    </div>
                    <span className="cx-pending-badge">Pending</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "friends" ? (
        <section className="cx-friends-block" aria-label="My friends">
          <h2>My friends</h2>
          {friendsLoading ? <p className="muted small">Loading friends…</p> : null}
          {!friendsLoading && friends.length === 0 ? (
            <p className="muted small">No friends yet.</p>
          ) : null}
          <ul className="cx-friend-list">
            {friends.map((u) => (
              <li key={u.id} className="cx-friend-item">
                <span className="cx-friend-avatar">
                  {u.profileImageUrl ? <img src={u.profileImageUrl} alt="" /> : friendInitial(u)}
                </span>
                <div className="cx-friend-meta">
                  <strong>{friendName(u)}</strong>
                  <span>@{u.username ?? "user"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
