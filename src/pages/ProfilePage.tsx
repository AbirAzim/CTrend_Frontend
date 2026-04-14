import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { ME, UPDATE_PROFILE, USER_POSTS } from "../graphql/profile";

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

export function ProfilePage() {
  const { user, logout, patchUser } = useAuth();
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const [editing, setEditing] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formInterests, setFormInterests] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: meData, loading: meLoading, error: meError } = useQuery(ME, {
    skip: !user,
    fetchPolicy: "network-only",
  });

  const me = meData?.me;
  const userId = me?.id ?? user?.id ?? "";

  const { data: postsData, loading: postsLoading } = useQuery(USER_POSTS, {
    variables: { userId },
    skip: !userId || useMockFeed,
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

  useEffect(() => {
    if (me) {
      setFormDisplayName(me.displayName ?? "");
      setFormBio(me.bio ?? "");
      setFormInterests((me.interests ?? []).join(", "));
    }
  }, [me]);

  const [saveProfile, { loading: saving }] = useMutation(UPDATE_PROFILE, {
    refetchQueries: [{ query: ME }],
  });

  if (!user) {
    return null;
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

  return (
    <div className="cx-profile">
      <header className="cx-profile-hero">
        <div className="cx-profile-hero-blob" aria-hidden />
        <span className="ig-profile-avatar lg cx-profile-avatar">
          {initialFromUser(displayName, user.email)}
        </span>
        <div className="cx-profile-hero-text">
          <p className="cx-profile-kicker">Your corner of CTrend</p>
          <h1 className="cx-profile-title">{displayName}</h1>
          <p className="cx-profile-handle">@{username}</p>
          {bio ? <p className="cx-profile-bio-preview">{bio}</p> : null}
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

      <div className="cx-profile-actions">
        <button
          type="button"
          className="ig-btn-outline cx-profile-btn-primary"
          onClick={() => {
            setEditing((v) => !v);
            setFormError(null);
          }}
        >
          {editing ? "Close editor" : "Edit vibe"}
        </button>
        <NavLink to="/create" className="ig-btn-outline cx-profile-btn-accent">
          New compare
        </NavLink>
      </div>

      {editing ? (
        <form className="cx-profile-editor" onSubmit={(ev) => void onSaveProfile(ev)}>
          <h2 className="cx-profile-editor-title">Shape your profile</h2>
          <label className="ig-field">
            <span>Display name</span>
            <input
              className="ig-input"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              autoComplete="nickname"
            />
          </label>
          <label className="ig-field">
            <span>Bio</span>
            <textarea
              className="ig-input ig-input-textarea"
              rows={3}
              value={formBio}
              onChange={(e) => setFormBio(e.target.value)}
              placeholder="What do you love comparing?"
            />
          </label>
          <label className="ig-field">
            <span>Interests (comma separated)</span>
            <input
              className="ig-input"
              value={formInterests}
              onChange={(e) => setFormInterests(e.target.value)}
              placeholder="coffee, sneakers, sunsets"
            />
          </label>
          {formError ? (
            <p className="error" role="alert">
              {formError}
            </p>
          ) : null}
          <button
            type="submit"
            className="ig-create-submit"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      ) : null}

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
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="muted small cx-profile-email">{user.email}</p>

      <button type="button" className="ig-logout" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}
