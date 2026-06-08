import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import {
  ADD_FRIEND,
  FRIENDSHIP_STATUS,
  GET_USER_PROFILE,
  FRIEND_SOCIAL_REFETCH_QUERIES,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
  USER_FRIENDS,
  USER_VOTE_COUNT,
  MY_FRIENDS,
  FRIEND_REQUESTS,
} from "../graphql/friends";
import { START_DIRECT_CONVERSATION } from "../graphql/messages";
import { USER_POSTS } from "../graphql/profile";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";

type UserProfile = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
  interests?: string[] | null;
};

type PostRow = {
  id: string;
  imageUrls: string[];
  caption?: string | null;
  totalVotes?: number | null;
  options?: Array<{ label?: string | null }> | null;
  category?: { id: string; name?: string | null } | null;
  isVotingOpen?: boolean | null;
};

type FriendshipStatus = "FRIEND" | "PENDING_SENT" | "PENDING_RECEIVED" | "NONE";

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

function avatarInitial(profile: UserProfile): string {
  const name = profile.displayName?.trim() || profile.username?.trim() || "U";
  return name[0]!.toUpperCase();
}

function displayName(profile: UserProfile): string {
  return profile.displayName?.trim() || profile.username?.trim() || "User";
}

function FriendButton({
  userId,
  status,
  onStatusChange,
}: {
  userId: string;
  status: FriendshipStatus;
  onStatusChange: () => void;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [addFriend] = useMutation(ADD_FRIEND);
  const [unfriend] = useMutation(UNFRIEND);
  const [respondRequest] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });

  async function handleAddFriend() {
    setActionError(null);
    setLoading(true);
    try {
      await addFriend({ variables: { userId } });
      onStatusChange();
    } catch (err: unknown) {
      setActionError(getApolloErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleUnfriend() {
    if (!confirm("Remove this friend?")) return;
    setActionError(null);
    setLoading(true);
    try {
      await unfriend({ variables: { userId } });
      onStatusChange();
    } catch (err: unknown) {
      setActionError(getApolloErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRespond(accept: boolean) {
    setActionError(null);
    setLoading(true);
    try {
      await respondRequest({ variables: { requesterId: userId, accept } });
      onStatusChange();
    } catch (err: unknown) {
      setActionError(getApolloErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="up-friend-actions">
      {status === "FRIEND" && (
        <button
          type="button"
          className="up-friend-btn up-friend-btn--friend"
          disabled={loading}
          onClick={() => void handleUnfriend()}
        >
          ✓ Friend · Unfriend
        </button>
      )}
      {status === "PENDING_SENT" && (
        <button
          type="button"
          className="up-friend-btn up-friend-btn--pending"
          disabled
        >
          Request Sent
        </button>
      )}
      {status === "PENDING_RECEIVED" && (
        <div className="up-friend-respond">
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => void handleRespond(true)}
          >
            Accept
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={loading}
            onClick={() => void handleRespond(false)}
          >
            Decline
          </button>
        </div>
      )}
      {status === "NONE" && (
        <button
          type="button"
          className="btn-primary"
          disabled={loading}
          onClick={() => void handleAddFriend()}
        >
          {loading ? "Sending…" : "+ Send Request"}
        </button>
      )}
      {actionError && (
        <p className="error up-friend-error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}

function MessageIconButton({ userId }: { userId: string }) {
  const { openChat, ensureConversation } = useMessenger();
  const [startDirect, { loading }] = useMutation(START_DIRECT_CONVERSATION);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="up-msg-btn"
        disabled={loading}
        onClick={() => void handle()}
        aria-label="Send message"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {loading ? "Opening…" : "Message"}
      </button>
      {error ? <small className="cx-extend-error" role="alert">{error}</small> : null}
    </div>
  );
}

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { onlineUserIds } = useMessenger();
  const navigate = useNavigate();

  const isOwnProfile = Boolean(user && userId === user.id);

  useEffect(() => {
    if (isOwnProfile) {
      navigate("/profile", { replace: true });
    }
  }, [isOwnProfile, navigate]);

  const { data: profileData, loading: profileLoading, error: profileError } = useQuery(
    GET_USER_PROFILE,
    { variables: { userId }, skip: !userId || isOwnProfile, fetchPolicy: "network-only" },
  );

  const { data: statusData, refetch: refetchStatus } = useQuery(FRIENDSHIP_STATUS, {
    variables: { userId },
    skip: !userId || !user || isOwnProfile,
    fetchPolicy: "network-only",
  });

  const { data: postsData, loading: postsLoading } = useQuery(USER_POSTS, {
    variables: { userId },
    skip: !userId || isOwnProfile,
    fetchPolicy: "network-only",
  });

  const { data: userFriendsData, loading: userFriendsLoading } = useQuery(USER_FRIENDS, {
    variables: { userId },
    skip: !userId || isOwnProfile || !user,
    fetchPolicy: "cache-and-network",
  });

  const { data: voteCountData } = useQuery(USER_VOTE_COUNT, {
    variables: { userId },
    skip: !userId || isOwnProfile || !user,
    fetchPolicy: "cache-and-network",
  });

  // My own friends + pending-sent, to label rows in their friend list correctly.
  const { data: myFriendsData } = useQuery(MY_FRIENDS, { skip: !user, fetchPolicy: "cache-first" });
  const { data: myRequestsData } = useQuery(FRIEND_REQUESTS, { skip: !user, fetchPolicy: "cache-and-network" });

  const [addFriendMut] = useMutation(ADD_FRIEND);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  const comparesRef = useRef<HTMLDivElement | null>(null);
  const friendsRef = useRef<HTMLDivElement | null>(null);
  const [showAllInterests, setShowAllInterests] = useState(false);

  function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function sendFriendRequest(targetId: string) {
    setAddingIds((s) => new Set(s).add(targetId));
    try {
      await addFriendMut({ variables: { userId: targetId } });
      setPendingIds((s) => new Set(s).add(targetId));
    } catch {
      /* ignore — UI keeps "Add" so the user can retry */
    } finally {
      setAddingIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
    }
  }

  if (isOwnProfile) {
    return null;
  }

  const profile = profileData?.getUserProfile as UserProfile | undefined;
  const friendshipStatus = (statusData?.friendshipStatus ?? "NONE") as FriendshipStatus;
  const posts = (postsData?.getPostsByUser ?? []) as PostRow[];
  const userFriends = (userFriendsData?.userFriends ?? []) as FriendRow[];
  const voteCount = (voteCountData?.userVoteCount ?? 0) as number;
  const myFriendIds = new Set(((myFriendsData?.myFriends ?? []) as FriendRow[]).map((f) => f.id));
  const mySentIds = new Set(
    ((myRequestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[]).map((f) => f.id),
  );
  const isFriend = friendshipStatus === "FRIEND";
  const isLoggedIn = Boolean(user);
  // Show online status only for friends (mutual trust)
  const isUserOnline = isFriend && Boolean(userId) && onlineUserIds.has(userId!);

  if (profileLoading) {
    return <div className="cx-profile"><p className="muted small">Loading profile…</p></div>;
  }

  if (profileError || !profile) {
    return (
      <div className="cx-profile">
        <p className="error">User not found.</p>
        <NavLink to="/" className="btn-ghost" style={{ marginTop: 16 }}>← Back to feed</NavLink>
      </div>
    );
  }

  const name = displayName(profile);
  const initial = avatarInitial(profile);
  const interests = profile.interests ?? [];

  return (
    <div className="cx-profile up-root">
      <header className="cx-profile-hero">
        <div className="cx-profile-hero-blob" aria-hidden />
        <span className="ig-profile-avatar lg cx-profile-avatar">
          {normalizeProfileImageUrl(profile.profileImageUrl) ? (
            <img
              src={normalizeProfileImageUrl(profile.profileImageUrl) ?? ""}
              alt={`${name} profile`}
              referrerPolicy="no-referrer"
            />
          ) : (
            initial
          )}
        </span>

        <div className="cx-profile-hero-text">
          <p className="cx-profile-kicker">Ke Jitbe member</p>
          <div className="cx-profile-name-row">
            <h1 className="cx-profile-title">{name}</h1>
            {isFriend && (
              <span
                className={`cx-profile-presence${isUserOnline ? " cx-profile-presence--online" : " cx-profile-presence--offline"}`}
                title={isUserOnline ? "Online" : "Offline"}
              >
                <span className="cx-profile-presence-dot" aria-hidden />
                {isUserOnline ? "Online" : "Offline"}
              </span>
            )}
          </div>
          <p className="cx-profile-handle">@{profile.username ?? "user"}</p>

          {profile.email ? (
            <p className="cx-profile-email-inline">{profile.email}</p>
          ) : null}

          {profile.bio ? (
            <p className="cx-profile-bio-preview">{profile.bio}</p>
          ) : null}

          {interests.length > 0 ? (
            <div className="cx-profile-interests up-interests">
              {(showAllInterests ? interests : interests.slice(0, 3)).map((interest) => (
                <span key={interest} className="cx-profile-interest-tag">
                  #{interest}
                </span>
              ))}
              {interests.length > 3 && (
                <button
                  type="button"
                  className="cx-profile-interest-more"
                  onClick={() => setShowAllInterests((v) => !v)}
                >
                  {showAllInterests ? "− less" : `+${interests.length - 3} more`}
                </button>
              )}
            </div>
          ) : null}

          {isLoggedIn && (
            <div className="up-action-row">
              <FriendButton
                userId={profile.id}
                status={friendshipStatus}
                onStatusChange={() => void refetchStatus()}
              />
              {friendshipStatus === "FRIEND" && (
                <MessageIconButton userId={profile.id} />
              )}
            </div>
          )}

          {!isLoggedIn && (
            <NavLink to="/login" className="btn-primary" style={{ marginTop: 12, display: "inline-block" }}>
              Log in to connect
            </NavLink>
          )}
        </div>
      </header>

      {isLoggedIn && (
        <div className="cx-profile-stats-row">
          <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={() => scrollToRef(comparesRef)}>
            <strong>{posts.length.toLocaleString()}</strong>
            <span>compares ›</span>
          </button>
          <div className="cx-profile-stat">
            <strong>{voteCount.toLocaleString()}</strong>
            <span>votes</span>
          </div>
          <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={() => scrollToRef(friendsRef)}>
            <strong>{userFriends.length.toLocaleString()}</strong>
            <span>friends ›</span>
          </button>
        </div>
      )}

      {!isFriend && isLoggedIn && (
        <div className="up-locked-notice">
          <span className="up-locked-icon" aria-hidden>🔒</span>
          <div>
            <strong>Friends only</strong>
            <p className="muted small">Add {name} as a friend to vote on their posts.</p>
          </div>
        </div>
      )}

      <section ref={comparesRef} className="cx-profile-drops up-posts-section" aria-label={`${name}'s posts`}>
        <h2 className="cx-profile-section-title">{name}'s compares</h2>

        {postsLoading && <p className="muted small">Loading posts…</p>}

        {!postsLoading && posts.length === 0 && (
          <p className="muted small">No posts yet.</p>
        )}

        {posts.length > 0 && (
          <ul className="cx-profile-grid cx-profile-grid--rich">
            {posts.map((post) => (
              <li key={post.id}>
                <article className="cx-profile-drop-card">
                  <NavLink to={`/post/${post.id}`} className="cx-profile-drop-link">
                    <div className="cx-profile-drop-media-grid">
                      {(post.imageUrls ?? []).map((u, idx) => (
                        <span
                          key={`${post.id}-img-${idx}`}
                          className="cx-profile-grid-cell"
                          style={{ backgroundImage: `url(${u})` }}
                        />
                      ))}
                      {(!post.imageUrls || post.imageUrls.length === 0) && (
                        <span className="cx-profile-grid-fallback">?</span>
                      )}
                    </div>
                  </NavLink>
                  <div className="cx-profile-drop-meta">
                    <p className="cx-profile-drop-title">
                      {post.caption?.trim() || "Untitled compare"}
                    </p>
                    <p className="cx-profile-drop-sub">
                      {post.category?.name ?? "General"} ·{" "}
                      {(post.totalVotes ?? 0).toLocaleString()} votes
                    </p>
                    {(post.options ?? []).length > 0 && (
                      <div className="cx-profile-drop-chips">
                        {(post.options ?? [])
                          .map((o) => o.label?.trim())
                          .filter(Boolean)
                          .slice(0, 4)
                          .map((label) => (
                            <span key={`${post.id}-${label}`} className="cx-profile-chip">
                              {label}
                            </span>
                          ))}
                      </div>
                    )}
                    {!isFriend && isLoggedIn && (
                      <p className="up-vote-locked muted small">🔒 Add as friend to vote</p>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isLoggedIn && (
      <section ref={friendsRef} className="cx-profile-drops up-friends-section" aria-label={`${name}'s friends`}>
        <h2 className="cx-profile-section-title">{name}'s friends</h2>

        {userFriendsLoading && userFriends.length === 0 && (
          <p className="muted small">Loading friends…</p>
        )}

        {!userFriendsLoading && userFriends.length === 0 && (
          <p className="muted small">No friends to show yet.</p>
        )}

        {userFriends.length > 0 && (
          <ul className="cx-conn-list">
            {userFriends.map((f) => {
              const fName = f.displayName?.trim() || f.username?.trim() || "User";
              const fInitial = fName[0]!.toUpperCase();
              const img = normalizeProfileImageUrl(f.profileImageUrl);
              const isMe = Boolean(user && f.id === user.id);
              const alreadyFriend = myFriendIds.has(f.id);
              const requested = mySentIds.has(f.id) || pendingIds.has(f.id);
              return (
                <li key={f.id} className="cx-conn-row">
                  <div className="cx-conn-avatar-wrap">
                    <Link to={`/profile/${f.id}`} className="cx-conn-avatar">
                      {img ? (
                        <img src={img} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="cx-conn-avatar-initial">{fInitial}</span>
                      )}
                    </Link>
                    {onlineUserIds.has(f.id) && (
                      <span className="cx-conn-online-dot" aria-label="Online" />
                    )}
                  </div>
                  <div className="cx-conn-info">
                    <Link to={`/profile/${f.id}`} className="cx-conn-name-link">
                      <span className="cx-conn-name">{fName}</span>
                    </Link>
                  </div>
                  {isLoggedIn && !isMe && (
                    <div className="cx-conn-actions">
                      {alreadyFriend ? (
                        <span className="cx-conn-btn cx-conn-btn--ghost" aria-disabled>✓ Friend</span>
                      ) : requested ? (
                        <span className="cx-conn-btn cx-conn-btn--ghost" aria-disabled>Requested</span>
                      ) : (
                        <button
                          type="button"
                          className="cx-conn-btn"
                          disabled={addingIds.has(f.id)}
                          onClick={() => void sendFriendRequest(f.id)}
                        >
                          {addingIds.has(f.id) ? "…" : "+ Add"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
