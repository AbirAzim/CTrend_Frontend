import { useMutation, useQuery } from "@apollo/client";
import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import {
  ADD_FRIEND,
  FRIENDSHIP_STATUS,
  GET_USER_PROFILE,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
} from "../graphql/friends";
import { USER_POSTS } from "../graphql/profile";

type UserProfile = {
  id: string;
  username?: string | null;
  displayName?: string | null;
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
  const [respondRequest] = useMutation(RESPOND_FRIEND_REQUEST);

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

export function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const isOwnProfile = Boolean(user && userId === user.id);

  const { data: profileData, loading: profileLoading, error: profileError } = useQuery(
    GET_USER_PROFILE,
    { variables: { userId }, skip: !userId || isOwnProfile },
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

  if (isOwnProfile) {
    navigate("/profile", { replace: true });
    return null;
  }

  const profile = profileData?.getUserProfile as UserProfile | undefined;
  const friendshipStatus = (statusData?.friendshipStatus ?? "NONE") as FriendshipStatus;
  const posts = (postsData?.getPostsByUser ?? []) as PostRow[];
  const isFriend = friendshipStatus === "FRIEND";
  const isLoggedIn = Boolean(user);

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
  const canSeeDetails = isFriend || !isLoggedIn;

  return (
    <div className="cx-profile up-root">
      <header className="cx-profile-hero">
        <div className="cx-profile-hero-blob" aria-hidden />
        <span className="ig-profile-avatar lg cx-profile-avatar">
          {profile.profileImageUrl ? (
            <img src={profile.profileImageUrl} alt={`${name} profile`} />
          ) : (
            initial
          )}
        </span>

        <div className="cx-profile-hero-text">
          <p className="cx-profile-kicker">Ke Jitbe member</p>
          <h1 className="cx-profile-title">{name}</h1>
          <p className="cx-profile-handle">@{profile.username ?? "user"}</p>

          {canSeeDetails && profile.bio ? (
            <p className="cx-profile-bio-preview">{profile.bio}</p>
          ) : null}

          {canSeeDetails && profile.interests && profile.interests.length > 0 ? (
            <div className="up-interests">
              {profile.interests.map((interest) => (
                <span key={interest} className="cx-profile-chip">
                  {interest}
                </span>
              ))}
            </div>
          ) : null}

          {isLoggedIn && (
            <FriendButton
              userId={profile.id}
              status={friendshipStatus}
              onStatusChange={() => void refetchStatus()}
            />
          )}

          {!isLoggedIn && (
            <NavLink to="/login" className="btn-primary" style={{ marginTop: 12, display: "inline-block" }}>
              Log in to connect
            </NavLink>
          )}
        </div>
      </header>

      {!isFriend && isLoggedIn && (
        <div className="up-locked-notice">
          <span className="up-locked-icon" aria-hidden>🔒</span>
          <div>
            <strong>Friends only</strong>
            <p className="muted small">Add {name} as a friend to vote on their posts.</p>
          </div>
        </div>
      )}

      <section className="cx-profile-drops up-posts-section" aria-label={`${name}'s posts`}>
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
    </div>
  );
}
