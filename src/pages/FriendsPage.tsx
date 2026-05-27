import { useMutation, useQuery } from "@apollo/client";
import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  ADD_FRIEND,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
} from "../graphql/friends";
import { START_DIRECT_CONVERSATION } from "../graphql/messages";
import { useMessenger } from "../context/MessengerContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

function MessageButton({ userId }: { userId: string }) {
  const { openChat, ensureConversation } = useMessenger();
  const [startDirect, { loading }] = useMutation(START_DIRECT_CONVERSATION);
  const [error, setError] = useState<string | null>(null);

  async function handleMessage() {
    setError(null);
    try {
      const { data } = await startDirect({ variables: { userId } });
      const convo = data?.startDirectConversation;
      if (convo) {
        ensureConversation(convo);
        openChat(convo.id);
      }
    } catch (err: unknown) {
      setError(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="cx-friend-msg-wrap">
      <button
        type="button"
        className="cx-friend-msg-btn"
        title={error ?? "Send message"}
        disabled={loading}
        onClick={() => void handleMessage()}
        aria-label="Send message"
      >
        {loading ? (
          <span style={{ fontSize: "0.7rem" }}>…</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>
      {error ? <span className="cx-friend-msg-error" role="alert" title={error}>!</span> : null}
    </div>
  );
}

function friendName(f: FriendRow): string {
  return f.displayName?.trim() || f.username?.trim() || "User";
}

function friendInitial(f: FriendRow): string {
  return friendName(f).slice(0, 1).toUpperCase();
}

export function FriendsPage() {
  const { onlineUserIds } = useMessenger();
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
                  <NavLink to={`/profile/${u.id}`} className="cx-friend-avatar">
                    {u.profileImageUrl ? (
                      <img src={u.profileImageUrl} alt="" />
                    ) : (
                      friendInitial(u)
                    )}
                  </NavLink>
                  <div className="cx-friend-meta">
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                      <strong>{friendName(u)}</strong>
                      <span>@{u.username ?? "user"}</span>
                    </NavLink>
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
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-avatar">
                      {u.profileImageUrl ? (
                        <img src={u.profileImageUrl} alt="" />
                      ) : (
                        friendInitial(u)
                      )}
                    </NavLink>
                    <div className="cx-friend-meta">
                      <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                        <strong>{friendName(u)}</strong>
                        <span>@{u.username ?? "user"}</span>
                      </NavLink>
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
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-avatar">
                      {u.profileImageUrl ? (
                        <img src={u.profileImageUrl} alt="" />
                      ) : (
                        friendInitial(u)
                      )}
                    </NavLink>
                    <div className="cx-friend-meta">
                      <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                        <strong>{friendName(u)}</strong>
                        <span>@{u.username ?? "user"}</span>
                      </NavLink>
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
            {friends.map((u) => {
              const friendOnline = onlineUserIds.has(u.id);
              return (
                <li key={u.id} className="cx-friend-item">
                  <div className="cx-friend-avatar-wrap">
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-avatar">
                      {u.profileImageUrl ? <img src={u.profileImageUrl} alt="" /> : friendInitial(u)}
                    </NavLink>
                    {friendOnline && <span className="cx-friend-online-dot" aria-hidden />}
                  </div>
                  <div className="cx-friend-meta">
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                      <strong>{friendName(u)}</strong>
                      <span>@{u.username ?? "user"}</span>
                    </NavLink>
                    <span
                      className={`cx-friend-status${friendOnline ? " cx-friend-status--online" : " cx-friend-status--offline"}`}
                      aria-label={friendOnline ? "Online" : "Offline"}
                    >
                      <span className="cx-friend-status-dot" aria-hidden />
                      {friendOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <MessageButton userId={u.id} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
