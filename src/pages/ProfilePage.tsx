import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { useImageUpload } from "../lib/useImageUpload";
import { MY_FRIENDS } from "../graphql/friends";
import { ME, UPDATE_PROFILE, USER_POSTS } from "../graphql/profile";
import { EXTEND_POST_VOTING, MY_SAVED_POSTS } from "../graphql/feed";
import { INVITE_ADMIN, INVITE_USER } from "../graphql/admin";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import type { FeedPostView } from "../types/feed";

function initialFromUser(name: string | undefined, email: string): string {
  const s = (name ?? email).trim();
  return s ? s[0]!.toUpperCase() : "?";
}

function rel(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = t - Date.now();
  const absMin = Math.floor(Math.abs(d) / 60000);
  if (d <= 0) return "ended";
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function gmailAvatarFromEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith("@gmail.com")) {
    return null;
  }
  return `https://www.google.com/s2/photos/profile/${encodeURIComponent(normalized)}?sz=256`;
}

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

export function ProfilePage() {
  const { user, patchUser } = useAuth();
  const location = useLocation();
  const keepsOnlyView = new URLSearchParams(location.search).get("view") === "keeps";
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const [editing, setEditing] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteType, setInviteType] = useState<"user" | "admin">("user");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "success" | "error">("idle");
  const [inviteError, setInviteError] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formInterests, setFormInterests] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [extendDraftByPost, setExtendDraftByPost] = useState<Record<string, string>>(
    {},
  );
  const [extendErrorByPost, setExtendErrorByPost] = useState<Record<string, string>>(
    {},
  );
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const { uploadImage } = useImageUpload();

  const { data: meData, loading: meLoading, error: meError } = useQuery(ME, {
    skip: !user,
    fetchPolicy: "network-only",
    errorPolicy: "all",
  });

  const me = meData?.me;
  const userId = me?.id ?? user?.id ?? "";
  const isAdmin = (me?.role ?? user?.role)?.toLowerCase() === "admin";

  const { data: postsData, loading: postsLoading } = useQuery(USER_POSTS, {
    variables: { userId },
    skip: !userId || useMockFeed,
    fetchPolicy: "network-only",
  });
  const { data: friendsData, loading: friendsLoading } = useQuery(MY_FRIENDS, {
    skip: useMockFeed,
    fetchPolicy: "network-only",
  });
  const { data: savedPostsData, loading: savedPostsLoading } = useQuery(MY_SAVED_POSTS, {
    skip: useMockFeed || !user,
    fetchPolicy: "network-only",
  });

  const apiPosts = (postsData?.getPostsByUser ?? []) as Array<{
    id: string;
    imageUrls: string[];
    caption?: string | null;
    createdAt?: string | null;
    totalVotes?: number | null;
    upvoteCount?: number | null;
    downvoteCount?: number | null;
    isVotingOpen?: boolean | null;
    votingEndsAt?: string | null;
    options?: Array<{ label?: string | null }> | null;
    category?: { id: string; name?: string | null; slug?: string | null } | null;
  }>;

  const playgroundPosts = useMemo(() => {
    if (!useMockFeed) {
      return [];
    }
    return mockPostsAsFeed();
  }, [useMockFeed]);

  const gridPosts: Array<{
    id: string;
    imageUrls: string[];
    caption?: string | null;
    createdAt?: string | null;
    totalVotes?: number | null;
    upvoteCount?: number | null;
    downvoteCount?: number | null;
    isVotingOpen?: boolean | null;
    votingEndsAt?: string | null;
    options?: Array<{ label?: string | null }> | null;
    category?: { id: string; name?: string | null; slug?: string | null } | null;
  }> = useMockFeed
    ? playgroundPosts
    : apiPosts;
  const friends = (friendsData?.myFriends ?? []) as FriendRow[];
  const savedPosts: FeedPostView[] = (savedPostsData?.mySavedPosts ?? []).map(
    mapGqlPostToFeedView,
  );
  const visibleSavedPosts = showAllSaved ? savedPosts : savedPosts.slice(0, 6);

  const totalImages = gridPosts.reduce((a, p) => a + (p.imageUrls?.length ?? 0), 0);
  const totalVotes = gridPosts.reduce(
    (a, p) => a + (p.totalVotes ?? (p.upvoteCount ?? 0) + (p.downvoteCount ?? 0)),
    0,
  );
  const activeVoting = gridPosts.filter((p) => p.isVotingOpen !== false).length;

  const displayName =
    me?.displayName ?? user?.displayName ?? user?.email.split("@")[0] ?? "you";
  const username =
    me?.username ?? user?.username ?? user?.email.split("@")[0] ?? "user";
  const bio = me?.bio ?? user?.bio ?? "";
  const heroAvatarUrl =
    me?.profileImageUrl?.trim() || gmailAvatarFromEmail(user?.email ?? "");

  useEffect(() => {
    if (me) {
      setFormDisplayName(me.displayName ?? "");
      setFormBio(me.bio ?? "");
      setFormInterests((me.interests ?? []).join(", "));
      // Sync role from server into stored session so AppShell and other components see it
      if (me.role && me.role !== user?.role) {
        patchUser({ role: me.role });
      }
    }
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [heroAvatarUrl]);

  useEffect(() => {
    if (location.hash !== "#saved-posts" && !keepsOnlyView) {
      return;
    }
    // Deep-link from bottom keeps icon should open full kept list.
    setShowAllSaved(true);
    window.setTimeout(() => {
      const target = document.getElementById("saved-posts");
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [location.hash, keepsOnlyView, savedPosts.length]);

  const [saveProfile, { loading: saving }] = useMutation(UPDATE_PROFILE, {
    refetchQueries: [{ query: ME }],
  });
  const [extendVotingMut, { loading: extendingVoting }] = useMutation(
    EXTEND_POST_VOTING,
    {
      refetchQueries: [{ query: USER_POSTS, variables: { userId } }],
    },
  );
  const [inviteUserMut, { loading: invitingUser }] = useMutation(INVITE_USER);
  const [inviteAdminMut, { loading: invitingAdmin }] = useMutation(INVITE_ADMIN);
  const inviting = invitingUser || invitingAdmin;

  async function onInviteFriend(e: React.FormEvent) {
    e.preventDefault();
    setInviteStatus("idle");
    setInviteError("");
    try {
      if (inviteType === "admin") {
        await inviteAdminMut({ variables: { email: inviteEmail.trim() } });
      } else {
        await inviteUserMut({ variables: { email: inviteEmail.trim() } });
      }
      setInviteStatus("success");
      setInviteEmail("");
    } catch (err: unknown) {
      const msg = getApolloErrorMessage(err);
      setInviteError(
        msg.includes("A user with this email already exists")
          ? "This email is already registered on CTrend."
          : msg,
      );
      setInviteStatus("error");
    }
  }

  function openInviteModal(type: "user" | "admin") {
    setInviteType(type);
    setShowInviteModal(true);
    setInviteStatus("idle");
    setInviteError("");
    setInviteEmail("");
  }

  if (!user) {
    return null;
  }

  if (keepsOnlyView) {
    return (
      <div className="cx-profile">
        <section className="cx-profile-friends" aria-label="Saved posts" id="saved-posts">
          <h2 className="cx-profile-section-title">Kept posts</h2>
          {!useMockFeed && savedPostsLoading ? (
            <p className="muted small">Loading kept posts…</p>
          ) : null}
          {!useMockFeed && !savedPostsLoading && savedPosts.length === 0 ? (
            <p className="muted small">No kept posts yet.</p>
          ) : null}
          {savedPosts.length > 0 ? (
            <ul className="cx-profile-grid cx-profile-grid--rich">
              {savedPosts.map((post) => (
                <li key={`saved-${post.id}`}>
                  <article className="cx-profile-drop-card">
                    <NavLink to={`/post/${post.id}`} className="cx-profile-drop-link">
                      <div className="cx-profile-drop-media-grid">
                        {(post.imageUrls ?? []).map((u, idx) => (
                          <span
                            key={`${post.id}-saved-img-${idx}`}
                            className="cx-profile-grid-cell"
                            style={{ backgroundImage: `url(${u})` }}
                          />
                        ))}
                      </div>
                    </NavLink>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    );
  }

  async function onAvatarFileChange(file: File | undefined) {
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const publicUrl = await uploadImage(file);
      const { data } = await saveProfile({
        variables: { input: { profileImageUrl: publicUrl } },
      });
      const u = data?.updateProfile;
      if (u) {
        patchUser({ displayName: u.displayName ?? null, username: u.username ?? null, bio: u.bio ?? null });
      }
      setAvatarLoadFailed(false);
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const interests = formInterests
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const { data } = await saveProfile({
        variables: {
          input: {
            displayName: formDisplayName.trim() || undefined,
            bio: formBio.trim() || undefined,
            interests: interests.length ? interests : undefined,
          },
        },
      });
      const u = data?.updateProfile;
      if (u) {
        patchUser({
          displayName: u.displayName ?? null,
          username: u.username ?? null,
          bio: u.bio ?? null,
        });
      }
      setEditing(false);
    } catch (err: unknown) {
      setFormError(getApolloErrorMessage(err));
    }
  }

  async function onExtendVoting(postId: string, currentEnd?: string | null) {
    const raw = (extendDraftByPost[postId] ?? "").trim();
    setExtendErrorByPost((prev) => ({ ...prev, [postId]: "" }));
    if (!raw) {
      setExtendErrorByPost((prev) => ({
        ...prev,
        [postId]: "Pick a new date-time.",
      }));
      return;
    }
    const next = new Date(raw);
    if (Number.isNaN(next.getTime())) {
      setExtendErrorByPost((prev) => ({
        ...prev,
        [postId]: "Invalid datetime.",
      }));
      return;
    }
    if (next.getTime() <= Date.now()) {
      setExtendErrorByPost((prev) => ({
        ...prev,
        [postId]: "New deadline must be in the future.",
      }));
      return;
    }
    if (currentEnd) {
      const cur = new Date(currentEnd).getTime();
      if (!Number.isNaN(cur) && next.getTime() <= cur) {
        setExtendErrorByPost((prev) => ({
          ...prev,
          [postId]: "New deadline should be after current end time.",
        }));
        return;
      }
    }
    try {
      await extendVotingMut({
        variables: {
          postId,
          newVotingEndsAt: next.toISOString(),
        },
      });
      setExtendDraftByPost((prev) => ({ ...prev, [postId]: "" }));
    } catch (err: unknown) {
      setExtendErrorByPost((prev) => ({
        ...prev,
        [postId]: getApolloErrorMessage(err),
      }));
    }
  }

  return (
    <div className="cx-profile">
      <header className="cx-profile-hero">
        <div className="cx-profile-hero-blob" aria-hidden />
        <span className="ig-profile-avatar lg cx-profile-avatar cx-profile-avatar--editable">
          {heroAvatarUrl && !avatarLoadFailed ? (
            <img
              src={heroAvatarUrl}
              alt={`${displayName} profile`}
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            initialFromUser(displayName, user.email)
          )}
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            style={{ display: "none" }}
            onChange={(ev) => void onAvatarFileChange(ev.target.files?.[0])}
          />
          <button
            type="button"
            className="cx-avatar-edit-btn"
            onClick={() => avatarFileRef.current?.click()}
            disabled={avatarUploading}
            title="Change profile picture"
            aria-label="Change profile picture"
          >
            {avatarUploading ? "…" : "📷"}
          </button>
        </span>
        {avatarError && (
          <p className="cx-avatar-error">{avatarError}</p>
        )}
        <div className="cx-profile-hero-text">
          <p className="cx-profile-kicker">Your corner of CTrend</p>
          <h1 className="cx-profile-title">{displayName}</h1>
          <p className="cx-profile-handle">
            @{username}
            {isAdmin && (
              <span className="admin-role-badge admin-role-badge--admin cx-profile-role-badge">
                admin
              </span>
            )}
          </p>
          {bio ? <p className="cx-profile-bio-preview">{bio}</p> : null}
          <button
            type="button"
            className="cx-profile-edit-btn"
            onClick={() => {
              setEditing((v) => !v);
              setFormError(null);
            }}
          >
            {editing ? "Close" : "Edit profile"}
          </button>
        </div>
      </header>

      <div className="cx-profile-stats-row">
        <div className="cx-profile-stat">
          <strong>{gridPosts.length}</strong>
          <span>compares</span>
        </div>
        <div className="cx-profile-stat">
          <strong>{totalImages}</strong>
          <span>images</span>
        </div>
        <div className="cx-profile-stat">
          <strong>{totalVotes.toLocaleString()}</strong>
          <span>votes</span>
        </div>
        <div className="cx-profile-stat cx-profile-stat--ghost">
          <strong>{activeVoting}</strong>
          <span>open</span>
        </div>
      </div>

      {editing && (
        <div className="cx-profile-edit-card">
          <form onSubmit={(ev) => void onSaveProfile(ev)}>
            <div className="cx-edit-row">
              <label className="cx-edit-label" htmlFor="edit-display-name">
                Display name
              </label>
              <input
                id="edit-display-name"
                className="ig-input"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                autoComplete="nickname"
                placeholder="Your name"
              />
            </div>
            <div className="cx-edit-row">
              <label className="cx-edit-label" htmlFor="edit-bio">
                Bio
              </label>
              <textarea
                id="edit-bio"
                className="ig-input ig-input-textarea"
                rows={3}
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                placeholder="What do you love comparing?"
              />
            </div>
            <div className="cx-edit-row">
              <label className="cx-edit-label" htmlFor="edit-interests">
                Interests
              </label>
              <input
                id="edit-interests"
                className="ig-input"
                value={formInterests}
                onChange={(e) => setFormInterests(e.target.value)}
                placeholder="coffee, sneakers, sunsets"
              />
            </div>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="cx-edit-footer">
              <button type="submit" className="cx-edit-save-btn" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="cx-edit-cancel-btn"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="cx-profile-invite-row">
        <button
          type="button"
          className="cx-invite-btn"
          onClick={() => openInviteModal("user")}
        >
          + Invite a friend
        </button>
        {isAdmin && (
          <button
            type="button"
            className="cx-invite-btn cx-invite-btn--admin"
            onClick={() => openInviteModal("admin")}
          >
            + Invite admin
          </button>
        )}
      </div>

      {isAdmin && (
        <div className="cx-admin-card">
          <span className="cx-admin-card-label">Admin</span>
          <NavLink to="/admin" className="cx-admin-card-link">
            Dashboard →
          </NavLink>
          <NavLink to="/profile/scheduled" className="cx-admin-card-link">
            Scheduled →
          </NavLink>
        </div>
      )}

      {meLoading && !me && (
        <p className="ig-feed-status">Loading your profile…</p>
      )}
      {meError && (
        <div className="ig-feed-banner ig-feed-banner--error" role="alert">
          Could not refresh profile. {meError.message}
        </div>
      )}

      <section className="cx-profile-drops" aria-label="Your compares">
        <h2 className="cx-profile-section-title">
          <span className="cx-profile-section-emoji" aria-hidden>
            &#10024;
          </span>{" "}
          Your drops
        </h2>
        {useMockFeed && (
          <p className="cx-profile-demo-note">
            <strong>Playground:</strong> sample compares below — connect the API
            to see your real posts here.
          </p>
        )}
        {!useMockFeed && postsLoading && (
          <p className="muted small">Loading your compares…</p>
        )}
        {!useMockFeed && !postsLoading && gridPosts.length === 0 && (
          <div className="cx-profile-empty">
            <p className="cx-profile-empty-title">No compares yet</p>
            <p className="muted">
              Start a playful A/B post — your grid will light up here.
            </p>
            <NavLink to="/create" className="cx-profile-empty-cta">
              Create your first compare
            </NavLink>
          </div>
        )}
        {gridPosts.length > 0 && (
          <ul className="cx-profile-grid cx-profile-grid--rich">
            {gridPosts.map((post) => {
              const thumb = post.imageUrls[0] ?? null;
              const ended = post.isVotingOpen === false || rel(post.votingEndsAt) === "ended";
              return (
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
                        {!thumb ? <span className="cx-profile-grid-fallback">?</span> : null}
                      </div>
                    </NavLink>
                    <div className="cx-profile-drop-meta">
                      <p className="cx-profile-drop-title">
                        {post.caption?.trim() || "Untitled compare"}
                      </p>
                      <p className="cx-profile-drop-sub">
                        {(post.category?.name ?? "General").toString()} ·{" "}
                        {(post.totalVotes ?? 0).toLocaleString()} votes
                      </p>
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
                      <p className="cx-profile-drop-sub">
                        {ended ? "Voting closed" : rel(post.votingEndsAt) || "Voting open"}
                      </p>
                      {!useMockFeed ? (
                        <div className="cx-profile-drop-actions">
                          <NavLink
                            to={`/post/${post.id}`}
                            className="btn-ghost cx-profile-drop-edit"
                          >
                            Edit post
                          </NavLink>
                          <input
                            type="datetime-local"
                            className="ig-input cx-profile-drop-extend-input"
                            value={extendDraftByPost[post.id] ?? ""}
                            onChange={(e) =>
                              setExtendDraftByPost((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                            min={toLocalDateTimeInputValue(new Date(Date.now() + 60_000))}
                          />
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={extendingVoting}
                            onClick={() => void onExtendVoting(post.id, post.votingEndsAt)}
                          >
                            {extendingVoting ? "Updating..." : "Extend voting"}
                          </button>
                          {extendErrorByPost[post.id] ? (
                            <small className="error" role="alert">
                              {extendErrorByPost[post.id]}
                            </small>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="cx-profile-friends" aria-label="Your friends">
        <h2 className="cx-profile-section-title">Friends</h2>
        {!useMockFeed && friendsLoading ? (
          <p className="muted small">Loading friends…</p>
        ) : null}
        {!useMockFeed && !friendsLoading && friends.length === 0 ? (
          <p className="muted small">No friends yet.</p>
        ) : null}
        {friends.length > 0 ? (
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
        ) : null}
      </section>

      <section className="cx-profile-friends" aria-label="Saved posts" id="saved-posts">
        <h2 className="cx-profile-section-title">Kept posts</h2>
        {!useMockFeed && savedPostsLoading ? (
          <p className="muted small">Loading kept posts…</p>
        ) : null}
        {!useMockFeed && !savedPostsLoading && savedPosts.length === 0 ? (
          <p className="muted small">No kept posts yet.</p>
        ) : null}
        {savedPosts.length > 0 ? (
          <>
            <ul className="cx-profile-grid cx-profile-grid--rich">
              {visibleSavedPosts.map((post) => (
                <li key={`saved-${post.id}`}>
                  <article className="cx-profile-drop-card">
                    <NavLink to={`/post/${post.id}`} className="cx-profile-drop-link">
                      <div className="cx-profile-drop-media-grid">
                        {(post.imageUrls ?? []).map((u, idx) => (
                          <span
                            key={`${post.id}-saved-grid-${idx}`}
                            className="cx-profile-grid-cell"
                            style={{ backgroundImage: `url(${u})` }}
                          />
                        ))}
                      </div>
                    </NavLink>
                  </article>
                </li>
              ))}
            </ul>
            {savedPosts.length > 6 ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowAllSaved((v) => !v)}
                style={{ marginTop: "10px" }}
              >
                {showAllSaved ? "Show less" : "View all kept items"}
              </button>
            ) : null}
          </>
        ) : null}
      </section>

      <p className="muted small cx-profile-email">{user.email}</p>

      {showInviteModal && (
        <div
          className="admin-modal-overlay"
          onClick={() => setShowInviteModal(false)}
          role="dialog"
          aria-modal
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">
              {inviteType === "admin" ? "Invite Admin" : "Invite a Friend"}
            </h2>
            {inviteType === "admin" && (
              <p className="muted small" style={{ marginBottom: 12 }}>
                The invitee will receive admin-level access to CTrend.
              </p>
            )}
            {inviteStatus === "success" ? (
              <>
                <p className="admin-modal-success">
                  Invitation sent!{" "}
                  {inviteType === "admin"
                    ? "The new admin will receive an email to set up their account."
                    : "Your friend will receive an email to join CTrend."}
                </p>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowInviteModal(false)}
                  style={{ marginTop: 12 }}
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={(ev) => void onInviteFriend(ev)} className="admin-modal-form">
                <label className="field">
                  <span>{inviteType === "admin" ? "Email address" : "Friend's email address"}</span>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                {inviteStatus === "error" && (
                  <p className="error" role="alert">{inviteError}</p>
                )}
                <div className="admin-modal-actions">
                  <button type="submit" className="btn-primary" disabled={inviting}>
                    {inviting ? "Sending…" : "Send invitation"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowInviteModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
