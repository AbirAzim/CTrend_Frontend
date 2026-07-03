import { useMutation, useQuery } from "@apollo/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getApolloErrorMessage } from "../lib/apolloErrorMessage";
import { mockPostsAsFeed } from "../lib/mockFeedAdapter";
import { useImageUpload } from "../lib/useImageUpload";
import {
  MY_FRIENDS,
  FRIEND_REQUESTS,
  FRIEND_SUGGESTIONS,
  ADD_FRIEND,
  FRIEND_SOCIAL_REFETCH_QUERIES,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
  CANCEL_FRIEND_REQUEST,
} from "../graphql/friends";
import { START_DIRECT_CONVERSATION, CONTACT_ADMIN } from "../graphql/messages";
import { ME, UPDATE_PROFILE, USER_POSTS, MY_VOTED_POSTS } from "../graphql/profile";
import { useMessenger } from "../context/MessengerContext";
import { MY_SAVED_POSTS, MY_SCHEDULED_POSTS, CANCEL_SCHEDULED_POST } from "../graphql/feed";
import { BulkInviteModal } from "../components/BulkInviteModal";
import { EditPostModal } from "../components/EditPostModal";
import { FeedPostCard } from "../components/FeedPostCard";
import { ProfileEngagementPanel } from "../components/ProfileEngagementPanel";
import { mapGqlPostToFeedView } from "../lib/mapGqlPostToFeedView";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";
import { useCoins } from "../context/CoinsContext";
import type { FeedPostView } from "../types/feed";
import { IconCompare, IconVote } from "../components/IgIcons";

function initialFromUser(name: string | undefined, email: string): string {
  const s = (name ?? email).trim();
  return s ? s[0]!.toUpperCase() : "?";
}

function gmailAvatarFromEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith("@gmail.com")) {
    return null;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(normalized)}&background=312e81&color=ffffff&size=256&format=png`;
}

type FriendRow = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
};

function friendName(f: FriendRow): string {
  return f.displayName?.trim() || `@${f.username?.trim() || "user"}`;
}

function friendInitial(f: FriendRow): string {
  return friendName(f).replace(/^@/, "").slice(0, 1).toUpperCase();
}

function MessageButton({ userId }: { userId: string }) {
  const { openChat, ensureConversation } = useMessenger();
  const [startDirect, { loading }] = useMutation(START_DIRECT_CONVERSATION);
  const [msgError, setMsgError] = useState<string | null>(null);

  async function handleMessage() {
    setMsgError(null);
    try {
      const { data } = await startDirect({ variables: { userId } });
      const convo = data?.startDirectConversation;
      if (convo) { ensureConversation(convo); openChat(convo.id); }
    } catch (err: unknown) {
      setMsgError(getApolloErrorMessage(err));
    }
  }

  return (
    <div className="cx-friend-msg-wrap">
      <button
        type="button"
        className="cx-friend-msg-btn"
        title={msgError ?? "Send message"}
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
      {msgError && <span className="cx-friend-msg-error" role="alert" title={msgError}>!</span>}
    </div>
  );
}

type ProfileContentTab = "drops" | "scheduled" | "kept" | "voted";

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

function profileTabSearch(tab: ProfileContentTab): string {
  if (tab === "scheduled") return "?tab=scheduled";
  if (tab === "kept") return "?tab=kept";
  if (tab === "voted") return "?tab=voted";
  return "";
}

/** "Contact admin" footer link — opens (and seeds) the user's support thread. */
function ContactAdminLink() {
  const { openChat } = useMessenger();
  const [contactAdmin, { loading }] = useMutation<{ contactAdmin: { id: string } }>(CONTACT_ADMIN);
  async function go() {
    try {
      const { data } = await contactAdmin();
      const id = data?.contactAdmin?.id;
      if (id) openChat(id);
    } catch {
      /* ignore — user can retry */
    }
  }
  return (
    <button
      type="button"
      className="cx-profile-quick-link"
      onClick={() => void go()}
      disabled={loading}
      style={{ border: "none", background: "none", width: "100%", font: "inherit", textAlign: "left", cursor: "pointer" }}
    >
      <span className="cx-profile-quick-link-icon" aria-hidden>💬</span>
      <span className="cx-profile-quick-link-text">
        <strong>Contact admin</strong>
        <span className="muted small">Questions, bugs or feedback — we'll reply</span>
      </span>
      <span className="cx-profile-quick-link-arrow" aria-hidden>→</span>
    </button>
  );
}

export function ProfilePage() {
  const { user, patchUser } = useAuth();
  const { balance } = useCoins();
  const { onlineUserIds } = useMessenger();
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = new URLSearchParams(location.search).get("tab");
  const useMockFeed = import.meta.env.VITE_USE_MOCK_FEED === "true";

  const [editing, setEditing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteType, setInviteType] = useState<"user" | "admin">("user");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formInterests, setFormInterests] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const { uploadImage } = useImageUpload();

  // Track browser connectivity in real time
  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const { data: meData, loading: meLoading, error: meError } = useQuery(ME, {
    skip: !user,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    errorPolicy: "all",
  });

  const me = meData?.me;
  const userId = me?.id ?? user?.id ?? "";
  const isAdmin = (me?.role ?? user?.role)?.toLowerCase() === "admin";
  // Online if the server has reported this user online OR if the browser connection is up
  const isOnline = (userId ? onlineUserIds.has(userId) : false) || browserOnline;

  const { data: postsData, loading: postsLoading, refetch: refetchPosts } = useQuery(USER_POSTS, {
    variables: { userId },
    skip: !userId || useMockFeed,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });
  const { data: friendsData, loading: friendsLoading, refetch: refetchFriends } = useQuery(MY_FRIENDS, {
    skip: useMockFeed,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });
  const { data: friendRequestsData, loading: friendRequestsLoading, refetch: refetchRequests } = useQuery(FRIEND_REQUESTS, {
    skip: useMockFeed,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });
  const [suggestionsSearchQuery, setSuggestionsSearchQuery] = useState("");
  const { data: suggestionsData, loading: suggestionsLoading, refetch: refetchSuggestions } = useQuery(FRIEND_SUGGESTIONS, {
    variables: { limit: 50, search: suggestionsSearchQuery || null },
    skip: useMockFeed,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });

  const [addFriendMut] = useMutation(ADD_FRIEND);
  const [respondFriendMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });
  const [unfriendMut] = useMutation(UNFRIEND);
  const [cancelFriendMut] = useMutation(CANCEL_FRIEND_REQUEST);
  const { data: savedPostsData, loading: savedPostsLoading } = useQuery(MY_SAVED_POSTS, {
    skip: useMockFeed || !user,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });
  const [votedFilter, setVotedFilter] = useState<"all" | "anonymous">("all");
  const { data: votedPostsData, loading: votedPostsLoading } = useQuery(MY_VOTED_POSTS, {
    variables: { anonymousOnly: votedFilter === "anonymous" },
    skip: useMockFeed || !user,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });
  const {
    data: scheduledPostsData,
    loading: scheduledPostsLoading,
    refetch: refetchScheduled,
  } = useQuery(MY_SCHEDULED_POSTS, {
    skip: useMockFeed || !user,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    pollInterval: 30_000,
  });
  const [cancelScheduledMut] = useMutation(CANCEL_SCHEDULED_POST);

  const playgroundPosts = useMemo(() => {
    if (!useMockFeed) {
      return [];
    }
    return mockPostsAsFeed();
  }, [useMockFeed]);

  // Feed-shaped — rendered with the same `FeedPostCard` as the main feed.
  const gridPosts: FeedPostView[] = useMockFeed
    ? playgroundPosts
    : (postsData?.getPostsByUser ?? []).map(mapGqlPostToFeedView);
  const votedPosts: FeedPostView[] = (votedPostsData?.myVotedPosts ?? []).map(
    mapGqlPostToFeedView,
  );
  const scheduledPosts: FeedPostView[] = (scheduledPostsData?.myScheduledPosts ?? []).map(
    mapGqlPostToFeedView,
  );
  const friends = (friendsData?.myFriends ?? []) as FriendRow[];
  const requestedMe = (friendRequestsData?.friendRequests?.requestedMe ?? []) as FriendRow[];
  const requestedByMe = (friendRequestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[];
  const suggestions = (suggestionsData?.friendSuggestions ?? []) as FriendRow[];
  const [actionLoadingIds, setActionLoadingIds] = useState<Set<string>>(new Set());
  const [connectionsTab, setConnectionsTab] = useState<
    "friends" | "incoming" | "sent" | "suggestions"
  >("friends");
  const [connectionsSearch, setConnectionsSearch] = useState("");
  // Collapsible sections. On web there's room to show your content up front, so
  // "Your content" starts expanded; People stays collapsed to keep things tidy.
  const [openContent, setOpenContent] = useState(true);
  const [openPeople, setOpenPeople] = useState(false);
  const [showAllInterests, setShowAllInterests] = useState(false);
  const peopleRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Friends count / stat → open People, focus Friends tab, scroll into view.
  function jumpToFriends() {
    setOpenPeople(true);
    setConnectionsTab("friends");
    setTimeout(() => peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  // Compares / Votes / Kept stats → open "Your content" on the matching tab.
  function openContentOn(tab: ProfileContentTab) {
    setOpenContent(true);
    selectProfileContentTab(tab);
    setTimeout(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }
  const [profileContentTab, setProfileContentTab] = useState<ProfileContentTab>(() => {
    if (initialTab === "scheduled") return "scheduled";
    if (initialTab === "kept") return "kept";
    if (initialTab === "voted") return "voted";
    return "drops";
  });

  async function handleCancelScheduled(postId: string) {
    if (!window.confirm("Cancel this scheduled post? This can't be undone.")) return;
    try {
      await cancelScheduledMut({ variables: { postId } });
      void refetchScheduled();
    } catch (err) {
      alert(getApolloErrorMessage(err));
    }
  }

  function selectProfileContentTab(tab: ProfileContentTab) {
    setProfileContentTab(tab);
    const nextSearch = profileTabSearch(tab);
    if (location.pathname === "/profile" && location.search !== nextSearch) {
      navigate({ pathname: "/profile", search: nextSearch }, { replace: true });
    }
  }

  // React to URL changes (e.g. clicking the Keep bottom-nav button while already on profile)
  useEffect(() => {
    if (initialTab === "scheduled") {
      setProfileContentTab("scheduled");
    } else if (initialTab === "kept") {
      setProfileContentTab("kept");
    } else if (initialTab === "voted") {
      setProfileContentTab("voted");
    } else {
      setProfileContentTab("drops");
    }
  }, [initialTab]);
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
  const [friendsPage, setFriendsPage] = useState(0);
  const [incomingPage, setIncomingPage] = useState(0);
  const [sentPage, setSentPage] = useState(0);
  const [suggestionsPage, setSuggestionsPage] = useState(0);
  const PEOPLE_PAGE = 10;

  function setActionLoading(id: string, on: boolean) {
    setActionLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) { next.add(id); } else { next.delete(id); }
      return next;
    });
  }

  async function handleAddFriend(userId: string) {
    setActionLoading(userId, true);
    try {
      await addFriendMut({ variables: { userId } });
      void refetchRequests();
      void refetchSuggestions();
    } catch { /* silent */ }
    setActionLoading(userId, false);
  }

  async function handleAcceptRequest(requesterId: string) {
    setActionLoading(requesterId, true);
    try {
      await respondFriendMut({ variables: { requesterId, accept: true } });
      void refetchRequests();
      void refetchFriends();
    } catch { /* silent */ }
    setActionLoading(requesterId, false);
  }

  async function handleRejectRequest(requesterId: string) {
    setActionLoading(requesterId, true);
    try {
      await respondFriendMut({ variables: { requesterId, accept: false } });
      void refetchRequests();
    } catch { /* silent */ }
    setActionLoading(requesterId, false);
  }

  async function handleUnfriend(userId: string) {
    setActionLoading(userId, true);
    try {
      await unfriendMut({ variables: { userId } });
      void refetchFriends();
      void refetchSuggestions();
    } catch { /* silent */ }
    setActionLoading(userId, false);
  }

  async function handleCancelRequest(userId: string) {
    setActionLoading(userId, true);
    try {
      await cancelFriendMut({ variables: { userId } });
      void refetchRequests();
      void refetchSuggestions();
    } catch { /* silent */ }
    setActionLoading(userId, false);
  }

  useEffect(() => {
    setFriendsPage(0);
    setIncomingPage(0);
    setSentPage(0);
    setSuggestionsPage(0);
  }, [connectionsSearch, connectionsTab]);

  // When on Suggestions tab, debounce the search text into a server-side query
  // so the user can search across ALL non-friend users (not just the cached page)
  useEffect(() => {
    if (connectionsTab !== "suggestions") {
      // Clear server-side search when leaving the tab so cache stays clean
      setSuggestionsSearchQuery("");
      return;
    }
    const t = setTimeout(() => {
      setSuggestionsSearchQuery(connectionsSearch.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [connectionsTab, connectionsSearch]);

  function matchesSearch(u: FriendRow): boolean {
    const q = connectionsSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.displayName?.toLowerCase().includes(q) ?? false) ||
      (u.username?.toLowerCase().includes(q) ?? false) ||
      (u.email?.toLowerCase().includes(q) ?? false)
    );
  }
  const savedPosts: FeedPostView[] = (savedPostsData?.mySavedPosts ?? []).map(
    mapGqlPostToFeedView,
  );

  const totalVotes = gridPosts.reduce(
    (a, p) => a + (p.upvoteCount ?? 0) + (p.downvoteCount ?? 0),
    0,
  );

  const displayName =
    me?.displayName ?? user?.displayName ?? user?.email.split("@")[0] ?? "you";
  const username =
    me?.username ?? user?.username ?? user?.email.split("@")[0] ?? "user";
  const bio = me?.bio ?? user?.bio ?? "";
  const interests: string[] = me?.interests ?? [];
  const heroAvatarUrl =
    normalizeProfileImageUrl(me?.profileImageUrl) ||
    normalizeProfileImageUrl(user?.profileImageUrl) ||
    gmailAvatarFromEmail(user?.email ?? "");

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


  const [saveProfile, { loading: saving }] = useMutation(UPDATE_PROFILE, {
    refetchQueries: [{ query: ME }],
  });

  function openInviteModal(type: "user" | "admin") {
    setInviteType(type);
    setShowInviteModal(true);
  }

  if (!user) {
    return null;
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
          <p className="cx-profile-kicker">Your corner of Ke Jitbe</p>
          <div className="cx-profile-name-row">
            <h1 className="cx-profile-title">{displayName}</h1>
            <span
              className={`cx-profile-presence${isOnline ? " cx-profile-presence--online" : " cx-profile-presence--offline"}`}
              title={isOnline ? "Online" : "Offline"}
            >
              <span className="cx-profile-presence-dot" aria-hidden />
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <p className="cx-profile-handle">
            @{username}
            {isAdmin && (
              <span className="admin-role-badge admin-role-badge--admin cx-profile-role-badge">
                admin
              </span>
            )}
          </p>
          <p className="cx-profile-email-inline">{user.email}</p>
          {bio ? <p className="cx-profile-bio-preview">{bio}</p> : null}
          {interests.length > 0 && (
            <div className="cx-profile-interests">
              {(showAllInterests ? interests : interests.slice(0, 3)).map((tag) => (
                <span key={tag} className="cx-profile-interest-tag">#{tag}</span>
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
          )}
          <button
            type="button"
            className="cx-profile-edit-btn"
            onClick={() => {
              setEditing((v) => !v);
              setFormError(null);
            }}
          >
            {editing ? "✕ Close" : "✏️ Edit profile"}
          </button>
        </div>
      </header>

      <div className="cx-profile-stats-row">
        <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={() => openContentOn("drops")}>
          <strong>{gridPosts.length}</strong>
          <span>compares ›</span>
        </button>
        <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={() => openContentOn("voted")}>
          <strong>{totalVotes.toLocaleString()}</strong>
          <span>votes ›</span>
        </button>
        <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={jumpToFriends}>
          <strong>{friends.length}</strong>
          <span>friends ›</span>
        </button>
        <button type="button" className="cx-profile-stat cx-profile-stat--btn" onClick={() => openContentOn("kept")}>
          <strong>{savedPosts.length}</strong>
          <span>kept ›</span>
        </button>
      </div>

      {userId ? (
        <ProfileEngagementPanel
          userId={userId}
          coins={balance ?? 0}
          isSelf
          onInviteFriend={() => openInviteModal("user")}
        />
      ) : null}

      {editing && (
        <div className="cx-profile-edit-card">
          <div className="cx-profile-edit-head">
            <span className="cx-profile-edit-head-title">Edit Profile</span>
            <button type="button" className="cx-modal-close" onClick={() => setEditing(false)} aria-label="Close">✕</button>
          </div>
          <form onSubmit={(ev) => void onSaveProfile(ev)} className="cx-profile-edit-form">
            <label className="cx-edit-label" htmlFor="edit-display-name">
              Display name
              <input
                id="edit-display-name"
                className="cx-edit-input"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                autoComplete="nickname"
                placeholder="Your public name"
              />
            </label>
            <label className="cx-edit-label" htmlFor="edit-bio">
              Bio
              <textarea
                id="edit-bio"
                className="cx-edit-textarea"
                rows={3}
                value={formBio}
                onChange={(e) => setFormBio(e.target.value)}
                placeholder="What do you love comparing?"
              />
            </label>
            <label className="cx-edit-label" htmlFor="edit-interests">
              Interests
              <input
                id="edit-interests"
                className="cx-edit-input"
                value={formInterests}
                onChange={(e) => setFormInterests(e.target.value)}
                placeholder="football, movies, food…  (comma separated)"
              />
              <span className="cx-edit-hint">Separate with commas — shown as tags on your profile</span>
            </label>
            {formError && (
              <p className="cx-edit-error" role="alert">{formError}</p>
            )}
            <div className="cx-profile-edit-footer">
              <button type="submit" className="cx-conn-btn cx-conn-btn--add" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="cx-conn-btn cx-conn-btn--ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {isAdmin ? (
        <div className="cx-profile-invite-row">
          <button
            type="button"
            className="cx-invite-btn cx-invite-btn--admin"
            onClick={() => openInviteModal("admin")}
          >
            + Invite admin
          </button>
        </div>
      ) : null}

      <NavLink to="/profile/sounds" className="cx-profile-quick-link">
        <span className="cx-profile-quick-link-icon" aria-hidden>🔊</span>
        <span className="cx-profile-quick-link-text">
          <strong>App sounds</strong>
          <span className="muted small">Vote, bell &amp; message tones</span>
        </span>
        <span className="cx-profile-quick-link-arrow" aria-hidden>→</span>
      </NavLink>

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

      {/* ── Your content (collapsible: drops / scheduled / kept / voted) ── */}
      <div className="cx-profile-content-card" ref={contentRef}>
        <button
          type="button"
          className={`cx-section-toggle${openContent ? " cx-section-toggle--open" : ""}`}
          onClick={() => setOpenContent((v) => !v)}
          aria-expanded={openContent}
        >
          <span className="cx-section-toggle-icon" aria-hidden><IconCompare size={18} /></span>
          <span className="cx-section-toggle-text">
            <strong>Your content</strong>
            <span className="muted small">
              {gridPosts.length + savedPosts.length + scheduledPosts.length === 0
                ? "Share your first compare"
                : `${gridPosts.length} drops · ${scheduledPosts.length} scheduled · ${savedPosts.length} kept`}
            </span>
          </span>
          <span className="cx-section-toggle-chevron" aria-hidden>{openContent ? "▾" : "▸"}</span>
        </button>
        {openContent && (
        <>
        <div className="cx-conn-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={profileContentTab === "drops"}
            className={`cx-conn-tab${profileContentTab === "drops" ? " cx-conn-tab--active" : ""}`}
            onClick={() => selectProfileContentTab("drops")}
          >
            ✨ Your drops
            {gridPosts.length > 0 && <span className="cx-conn-tab-badge">{gridPosts.length}</span>}
          </button>
          {!useMockFeed && (
            <button
              type="button"
              role="tab"
              aria-selected={profileContentTab === "scheduled"}
              className={`cx-conn-tab${profileContentTab === "scheduled" ? " cx-conn-tab--active" : ""}`}
              onClick={() => selectProfileContentTab("scheduled")}
            >
              ⏰ Scheduled
              {scheduledPosts.length > 0 && (
                <span className="cx-conn-tab-badge">{scheduledPosts.length}</span>
              )}
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={profileContentTab === "kept"}
            className={`cx-conn-tab${profileContentTab === "kept" ? " cx-conn-tab--active" : ""}`}
            onClick={() => selectProfileContentTab("kept")}
          >
            🔖 Kept
            {savedPosts.length > 0 && <span className="cx-conn-tab-badge">{savedPosts.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={profileContentTab === "voted"}
            className={`cx-conn-tab${profileContentTab === "voted" ? " cx-conn-tab--active" : ""}`}
            onClick={() => selectProfileContentTab("voted")}
          >
            <IconVote size={14} />
            Voted
            {votedPosts.length > 0 && <span className="cx-conn-tab-badge">{votedPosts.length}</span>}
          </button>
        </div>

        {profileContentTab === "drops" && (
          <div className="cx-profile-content-panel" role="tabpanel">
      <section className="cx-profile-drops" aria-label="Your compares">
        <h2 className="cx-profile-section-title" style={{ display: "none" }}>
          Your drops
        </h2>
        {useMockFeed && (
          <p className="cx-profile-demo-note" style={{ padding: "12px 16px" }}>
            <strong>Playground:</strong> sample compares — connect the API to see your real posts.
          </p>
        )}
        {!useMockFeed && postsLoading && gridPosts.length === 0 && (
          <div className="cx-kept-grid" aria-label="Loading your compares">
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
        )}
        {!useMockFeed && !postsLoading && gridPosts.length === 0 && (
          <div className="cx-conn-empty">
            <span className="cx-conn-empty-icon">✨</span>
            <p>No compares yet.</p>
            <NavLink to="/create" className="cx-conn-btn cx-conn-btn--add" style={{ marginTop: "8px", textDecoration: "none" }}>
              Create your first compare
            </NavLink>
          </div>
        )}
        {gridPosts.length > 0 && (
          <div className="ig-feed">
            {gridPosts.map((post) => (
              <FeedPostCard key={post.id} post={post} voteMode={useMockFeed ? "local" : "api"} />
            ))}
          </div>
        )}
      </section>
          </div>
        )}

        {profileContentTab === "scheduled" && (
          <div className="cx-profile-content-panel" role="tabpanel">
            <section className="cx-profile-drops" aria-label="Your scheduled posts">
              {scheduledPostsLoading && scheduledPosts.length === 0 ? (
                <p className="cx-conn-empty">Loading scheduled posts…</p>
              ) : scheduledPosts.length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">⏰</span>
                  <p>No scheduled posts. Schedule a post for later from Create.</p>
                  <NavLink
                    to="/create"
                    className="cx-conn-btn cx-conn-btn--add"
                    style={{ marginTop: "8px", textDecoration: "none" }}
                  >
                    Create a post
                  </NavLink>
                </div>
              ) : (
                <div className="ig-feed">
                  {scheduledPosts.map((post) => (
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
                </div>
              )}
            </section>
          </div>
        )}

        {profileContentTab === "kept" && (
          <div className="cx-profile-content-panel" role="tabpanel">
            {!useMockFeed && savedPostsLoading ? (
              <p className="cx-conn-empty">Loading kept posts…</p>
            ) : savedPosts.length === 0 ? (
              <div className="cx-conn-empty">
                <span className="cx-conn-empty-icon">🔖</span>
                <p>No kept posts yet. Bookmark posts from the feed!</p>
              </div>
            ) : (
              <div className="ig-feed">
                {savedPosts.map((post) => (
                  <FeedPostCard key={`kept-${post.id}`} post={post} voteMode="api" />
                ))}
              </div>
            )}
          </div>
        )}

        {profileContentTab === "voted" && (
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
            {!useMockFeed && votedPostsLoading && votedPosts.length === 0 ? (
              <p className="cx-conn-empty">Loading voted posts…</p>
            ) : votedPosts.length === 0 ? (
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
                {votedPosts.map((post) => (
                  <FeedPostCard key={`voted-${post.id}`} post={post} voteMode="api" />
                ))}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* ── People (collapsible) ─────────────────────── */}
      {!useMockFeed ? (
        <section className="cx-connections-card" aria-label="People" ref={peopleRef}>
          <button
            type="button"
            className={`cx-section-toggle${openPeople ? " cx-section-toggle--open" : ""}`}
            onClick={() => setOpenPeople((v) => !v)}
            aria-expanded={openPeople}
          >
            <span className="cx-section-toggle-icon" aria-hidden>👥</span>
            <span className="cx-section-toggle-text">
              <strong>People</strong>
              <span className="muted small">
                {friends.length > 0
                  ? `${friends.length} friend${friends.length === 1 ? "" : "s"}${requestedMe.length > 0 ? ` · ${requestedMe.length} request${requestedMe.length === 1 ? "" : "s"}` : ""}`
                  : "Find people to connect with"}
              </span>
            </span>
            {requestedMe.length > 0 && (
              <span className="cx-section-toggle-badge">{requestedMe.length}</span>
            )}
            <span className="cx-section-toggle-chevron" aria-hidden>{openPeople ? "▾" : "▸"}</span>
          </button>

          {openPeople && (
          <>
          {/* Search input */}
          <div className="cx-conn-search-wrap">
            <svg className="cx-conn-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              className="cx-conn-search"
              placeholder="Search by name, username or email…"
              value={connectionsSearch}
              onChange={(e) => setConnectionsSearch(e.target.value)}
              aria-label="Search people"
            />
            {connectionsSearch && (
              <button
                type="button"
                className="cx-conn-search-clear"
                onClick={() => setConnectionsSearch("")}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>

          {/* Tab bar */}
          <div className="cx-conn-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={connectionsTab === "friends"}
              className={`cx-conn-tab${connectionsTab === "friends" ? " cx-conn-tab--active" : ""}`}
              onClick={() => setConnectionsTab("friends")}
            >
              Friends
              {friends.length > 0 && (
                <span className="cx-conn-tab-badge">{friends.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={connectionsTab === "incoming"}
              className={`cx-conn-tab${connectionsTab === "incoming" ? " cx-conn-tab--active" : ""}`}
              onClick={() => setConnectionsTab("incoming")}
            >
              Received
              {requestedMe.length > 0 && (
                <span className="cx-conn-tab-badge cx-conn-tab-badge--alert">{requestedMe.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={connectionsTab === "sent"}
              className={`cx-conn-tab${connectionsTab === "sent" ? " cx-conn-tab--active" : ""}`}
              onClick={() => setConnectionsTab("sent")}
            >
              Sent
              {requestedByMe.length > 0 && (
                <span className="cx-conn-tab-badge">{requestedByMe.length}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={connectionsTab === "suggestions"}
              className={`cx-conn-tab${connectionsTab === "suggestions" ? " cx-conn-tab--active" : ""}`}
              onClick={() => setConnectionsTab("suggestions")}
            >
              Suggestions
            </button>
          </div>

          {/* ── Friends tab ── */}
          {connectionsTab === "friends" && (
            <div className="cx-conn-panel" role="tabpanel">
              {friendsLoading ? (
                <p className="cx-conn-empty">Loading…</p>
              ) : friends.length === 0 ? (
                <div className="cx-conn-empty cx-conn-empty--cta">
                  <span className="cx-conn-empty-icon">👋</span>
                  <p className="cx-conn-empty-title">No friends yet</p>
                  <p>Find people to compare with — add friends to see their drops and vote together.</p>
                  <button
                    type="button"
                    className="cx-conn-btn cx-conn-btn--add cx-conn-find-btn"
                    onClick={() => setConnectionsTab("suggestions")}
                  >
                    🔍  Find friends
                  </button>
                </div>
              ) : friends.filter(matchesSearch).length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">🔍</span>
                  <p>No friends match "{connectionsSearch}"</p>
                </div>
              ) : (() => {
                const filtered = friends.filter(matchesSearch);
                const totalPages = Math.ceil(filtered.length / PEOPLE_PAGE);
                const page = filtered.slice(friendsPage * PEOPLE_PAGE, (friendsPage + 1) * PEOPLE_PAGE);
                return (
                  <>
                <ul className="cx-conn-list">
                  {page.map((f) => (
                    <li key={f.id} className="cx-conn-row">
                      <div className="cx-conn-avatar-wrap">
                        <Link to={`/profile/${f.id}`} className="cx-conn-avatar">
                          {normalizeProfileImageUrl(f.profileImageUrl) ? (
                            <img src={normalizeProfileImageUrl(f.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                          ) : <span className="cx-conn-avatar-initial">{friendInitial(f)}</span>}
                        </Link>
                        {onlineUserIds.has(f.id) && (
                          <span className="cx-conn-online-dot" aria-label="Online" />
                        )}
                      </div>
                      <div className="cx-conn-info">
                        <Link to={`/profile/${f.id}`} className="cx-conn-name-link">
                          <span className="cx-conn-name">{friendName(f)}</span>
                        </Link>
                      </div>
                      <div className="cx-conn-actions">
                        <MessageButton userId={f.id} />
                        <button
                          type="button"
                          className="cx-conn-btn cx-conn-btn--ghost"
                          disabled={actionLoadingIds.has(f.id)}
                          onClick={() => void handleUnfriend(f.id)}
                        >
                          {actionLoadingIds.has(f.id) ? "…" : "Unfriend"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="cx-conn-pagination">
                    <button type="button" className="cx-conn-page-btn" disabled={friendsPage === 0} onClick={() => setFriendsPage((p) => p - 1)}>‹</button>
                    <span className="cx-conn-page-info">{friendsPage + 1} / {totalPages}</span>
                    <button type="button" className="cx-conn-page-btn" disabled={friendsPage >= totalPages - 1} onClick={() => setFriendsPage((p) => p + 1)}>›</button>
                  </div>
                )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Received (incoming) tab ── */}
          {connectionsTab === "incoming" && (
            <div className="cx-conn-panel" role="tabpanel">
              {friendRequestsLoading ? (
                <p className="cx-conn-empty">Loading…</p>
              ) : requestedMe.length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">📭</span>
                  <p>No incoming requests.</p>
                </div>
              ) : requestedMe.filter(matchesSearch).length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">🔍</span>
                  <p>No requests match "{connectionsSearch}"</p>
                </div>
              ) : (() => {
                const filtered = requestedMe.filter(matchesSearch);
                const totalPages = Math.ceil(filtered.length / PEOPLE_PAGE);
                const page = filtered.slice(
                  incomingPage * PEOPLE_PAGE,
                  (incomingPage + 1) * PEOPLE_PAGE,
                );
                return (
                  <>
                    <ul className="cx-conn-list">
                      {page.map((u) => (
                        <li key={u.id} className="cx-conn-row">
                          <div className="cx-conn-avatar-wrap">
                            <Link to={`/profile/${u.id}`} className="cx-conn-avatar">
                              {normalizeProfileImageUrl(u.profileImageUrl) ? (
                                <img src={normalizeProfileImageUrl(u.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                              ) : <span className="cx-conn-avatar-initial">{friendInitial(u)}</span>}
                            </Link>
                          </div>
                          <div className="cx-conn-info">
                            <Link to={`/profile/${u.id}`} className="cx-conn-name-link">
                              <span className="cx-conn-name">{friendName(u)}</span>
                            </Link>
                          </div>
                          <div className="cx-conn-actions">
                            <button
                              type="button"
                              className="cx-conn-btn cx-conn-btn--accept"
                              disabled={actionLoadingIds.has(u.id)}
                              onClick={() => void handleAcceptRequest(u.id)}
                            >
                              {actionLoadingIds.has(u.id) ? "…" : "Accept"}
                            </button>
                            <button
                              type="button"
                              className="cx-conn-btn cx-conn-btn--ghost"
                              disabled={actionLoadingIds.has(u.id)}
                              onClick={() => void handleRejectRequest(u.id)}
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {totalPages > 1 && (
                      <div className="cx-conn-pagination">
                        <button type="button" className="cx-conn-page-btn" disabled={incomingPage === 0} onClick={() => setIncomingPage((p) => p - 1)}>‹</button>
                        <span className="cx-conn-page-info">{incomingPage + 1} / {totalPages}</span>
                        <button type="button" className="cx-conn-page-btn" disabled={incomingPage >= totalPages - 1} onClick={() => setIncomingPage((p) => p + 1)}>›</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Sent tab ── */}
          {connectionsTab === "sent" && (
            <div className="cx-conn-panel" role="tabpanel">
              {friendRequestsLoading ? (
                <p className="cx-conn-empty">Loading…</p>
              ) : requestedByMe.length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">📭</span>
                  <p>No sent requests.</p>
                </div>
              ) : requestedByMe.filter(matchesSearch).length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">🔍</span>
                  <p>No requests match "{connectionsSearch}"</p>
                </div>
              ) : (() => {
                const filtered = requestedByMe.filter(matchesSearch);
                const totalPages = Math.ceil(filtered.length / PEOPLE_PAGE);
                const page = filtered.slice(
                  sentPage * PEOPLE_PAGE,
                  (sentPage + 1) * PEOPLE_PAGE,
                );
                return (
                  <>
                    <ul className="cx-conn-list">
                      {page.map((u) => (
                        <li key={u.id} className="cx-conn-row">
                          <div className="cx-conn-avatar-wrap">
                            <Link to={`/profile/${u.id}`} className="cx-conn-avatar">
                              {normalizeProfileImageUrl(u.profileImageUrl) ? (
                                <img src={normalizeProfileImageUrl(u.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                              ) : <span className="cx-conn-avatar-initial">{friendInitial(u)}</span>}
                            </Link>
                          </div>
                          <div className="cx-conn-info">
                            <Link to={`/profile/${u.id}`} className="cx-conn-name-link">
                              <span className="cx-conn-name">{friendName(u)}</span>
                            </Link>
                            <span className="cx-conn-pending-tag">Pending</span>
                          </div>
                          <button
                            type="button"
                            className="cx-conn-btn cx-conn-btn--ghost"
                            disabled={actionLoadingIds.has(u.id)}
                            onClick={() => void handleCancelRequest(u.id)}
                          >
                            {actionLoadingIds.has(u.id) ? "…" : "Cancel"}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {totalPages > 1 && (
                      <div className="cx-conn-pagination">
                        <button type="button" className="cx-conn-page-btn" disabled={sentPage === 0} onClick={() => setSentPage((p) => p - 1)}>‹</button>
                        <span className="cx-conn-page-info">{sentPage + 1} / {totalPages}</span>
                        <button type="button" className="cx-conn-page-btn" disabled={sentPage >= totalPages - 1} onClick={() => setSentPage((p) => p + 1)}>›</button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Suggestions tab ── */}
          {connectionsTab === "suggestions" && (
            <div className="cx-conn-panel" role="tabpanel">
              {suggestionsLoading ? (
                <p className="cx-conn-empty">Loading…</p>
              ) : suggestions.length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">🎉</span>
                  <p>You're connected with everyone!</p>
                </div>
              ) : suggestions.filter(matchesSearch).length === 0 ? (
                <div className="cx-conn-empty">
                  <span className="cx-conn-empty-icon">🔍</span>
                  <p>No suggestions match "{connectionsSearch}"</p>
                </div>
              ) : (() => {
                const filtered = suggestions.filter(matchesSearch);
                const totalPages = Math.ceil(filtered.length / PEOPLE_PAGE);
                const page = filtered.slice(suggestionsPage * PEOPLE_PAGE, (suggestionsPage + 1) * PEOPLE_PAGE);
                return (
                  <>
                <ul className="cx-conn-list">
                  {page.map((u) => (
                    <li key={u.id} className="cx-conn-row">
                      <div className="cx-conn-avatar-wrap">
                        <Link to={`/profile/${u.id}`} className="cx-conn-avatar">
                          {normalizeProfileImageUrl(u.profileImageUrl) ? (
                            <img src={normalizeProfileImageUrl(u.profileImageUrl) ?? ""} alt="" referrerPolicy="no-referrer" />
                          ) : <span className="cx-conn-avatar-initial">{friendInitial(u)}</span>}
                        </Link>
                      </div>
                      <div className="cx-conn-info">
                        <Link to={`/profile/${u.id}`} className="cx-conn-name-link">
                          <span className="cx-conn-name">{friendName(u)}</span>
                        </Link>
                      </div>
                      <button
                        type="button"
                        className="cx-conn-btn cx-conn-btn--add"
                        disabled={actionLoadingIds.has(u.id)}
                        onClick={() => void handleAddFriend(u.id)}
                      >
                        {actionLoadingIds.has(u.id) ? "…" : "+ Add"}
                      </button>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="cx-conn-pagination">
                    <button type="button" className="cx-conn-page-btn" disabled={suggestionsPage === 0} onClick={() => setSuggestionsPage((p) => p - 1)}>‹</button>
                    <span className="cx-conn-page-info">{suggestionsPage + 1} / {totalPages}</span>
                    <button type="button" className="cx-conn-page-btn" disabled={suggestionsPage >= totalPages - 1} onClick={() => setSuggestionsPage((p) => p + 1)}>›</button>
                  </div>
                )}
                  </>
                );
              })()}
            </div>
          )}
          </>
          )}
        </section>
      ) : null}

      <div className="cx-profile-footer-links">
        <ContactAdminLink />
        <NavLink to="/credits" className="cx-profile-quick-link">
          <span className="cx-profile-quick-link-icon" aria-hidden>👥</span>
          <span className="cx-profile-quick-link-text">
            <strong>Credits &amp; legal</strong>
            <span className="muted small">Team, privacy &amp; terms</span>
          </span>
          <span className="cx-profile-quick-link-arrow" aria-hidden>→</span>
        </NavLink>
      </div>

      {showInviteModal && (
        <BulkInviteModal
          inviteType={inviteType}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSaved={() => { void refetchPosts(); void refetchScheduled(); }}
        />
      )}
    </div>
  );
}
