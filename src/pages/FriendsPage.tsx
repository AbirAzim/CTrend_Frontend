import { useMutation, useQuery } from "@apollo/client";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { NavLink } from "react-router-dom";
import {
  ADD_FRIEND,
  CANCEL_FRIEND_REQUEST,
  FRIEND_REQUESTS,
  FRIEND_SOCIAL_REFETCH_QUERIES,
  FRIEND_SUGGESTIONS,
  MY_FRIENDS,
  RESPOND_FRIEND_REQUEST,
  UNFRIEND,
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

type Section = "suggestions" | "incoming" | "sent" | "friends";
const SECTIONS: Section[] = ["suggestions", "incoming", "sent", "friends"];
type View = Record<Section, FriendRow[]>;
const EMPTY_VIEW: View = { suggestions: [], incoming: [], sent: [], friends: [] };

// Animation timings — keep in sync with the keyframes in index.css.
const OUT_MS = 300;
const IN_MS = 340;
// How long an optimistic "pin" holds an item in its new section before we
// trust the server again (covers the mutation + refetch round-trip).
const PIN_MS = 8000;

function friendName(f: FriendRow): string {
  return f.displayName?.trim() || `@${f.username?.trim() || "user"}`;
}
function friendInitial(f: FriendRow): string {
  return friendName(f).slice(0, 1).toUpperCase();
}
function sectionOf(view: View, id: string): Section | null {
  for (const s of SECTIONS) if (view[s].some((x) => x.id === id)) return s;
  return null;
}

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

export function FriendsPage() {
  const { onlineUserIds } = useMessenger();
  const [tab, setTab] = useState<"friends" | "incoming" | "sent" | "suggestions">(
    "friends",
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Queries (poll so a peer accepting/declining shows up "live") ──────
  const { data: requestsData, loading: requestsLoading } = useQuery(FRIEND_REQUESTS, {
    fetchPolicy: "network-only",
    pollInterval: 8000,
  });
  const { data: friendsData, loading: friendsLoading } = useQuery(MY_FRIENDS, {
    fetchPolicy: "network-only",
    pollInterval: 8000,
  });
  const { data: suggestionsData, loading: suggestionsLoading } = useQuery(FRIEND_SUGGESTIONS, {
    variables: { limit: 20 },
    fetchPolicy: "network-only",
  });

  const [addFriendMut] = useMutation(ADD_FRIEND, {
    refetchQueries: [
      { query: FRIEND_SUGGESTIONS, variables: { limit: 20 } },
      { query: FRIEND_REQUESTS },
      { query: MY_FRIENDS },
    ],
  });
  const [respondMut] = useMutation(RESPOND_FRIEND_REQUEST, {
    refetchQueries: [...FRIEND_SOCIAL_REFETCH_QUERIES],
  });
  const [cancelMut] = useMutation(CANCEL_FRIEND_REQUEST, {
    refetchQueries: [
      ...FRIEND_SOCIAL_REFETCH_QUERIES,
      { query: FRIEND_SUGGESTIONS, variables: { limit: 20 } },
    ],
  });
  const [unfriendMut] = useMutation(UNFRIEND, {
    refetchQueries: [
      ...FRIEND_SOCIAL_REFETCH_QUERIES,
      { query: FRIEND_SUGGESTIONS, variables: { limit: 20 } },
    ],
  });

  // Server snapshot, mapped into our four sections.
  const serverView = useMemo<View>(
    () => ({
      suggestions: (suggestionsData?.friendSuggestions ?? []) as FriendRow[],
      incoming: (requestsData?.friendRequests?.requestedMe ?? []) as FriendRow[],
      sent: (requestsData?.friendRequests?.requestedByMe ?? []) as FriendRow[],
      friends: (friendsData?.myFriends ?? []) as FriendRow[],
    }),
    [suggestionsData, requestsData, friendsData],
  );

  // ── Animated view-model engine ────────────────────────────────────────
  const [view, setView] = useState<View>(EMPTY_VIEW);
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  // Per (section:id) animation state: "in" (entering) | "out" (leaving).
  const animRef = useRef<Map<string, "in" | "out">>(new Map());
  // Optimistic overrides: id -> the section it should live in (null = removed).
  const pinsRef = useRef<Map<string, { section: Section | null; until: number }>>(new Map());
  const cacheRef = useRef<Map<string, FriendRow>>(new Map());
  const [, bump] = useReducer((c: number) => c + 1, 0);

  const animKey = (s: Section, id: string) => `${s}:${id}`;

  // Compose the *desired* view = server snapshot with optimistic pins applied.
  const buildDesired = useCallback((): View => {
    const sv = serverView;
    const now = Date.now();
    const desired: View = {
      suggestions: [...sv.suggestions],
      incoming: [...sv.incoming],
      sent: [...sv.sent],
      friends: [...sv.friends],
    };
    for (const s of SECTIONS) for (const it of sv[s]) cacheRef.current.set(it.id, it);

    for (const [id, pin] of [...pinsRef.current]) {
      const serverSection = sectionOf(sv, id);
      if (serverSection === pin.section) {
        pinsRef.current.delete(id); // server caught up — drop the override
        continue;
      }
      if (pin.until < now) {
        pinsRef.current.delete(id); // expired safety net
        continue;
      }
      for (const s of SECTIONS) desired[s] = desired[s].filter((x) => x.id !== id);
      if (pin.section) {
        const item = cacheRef.current.get(id);
        if (item) desired[pin.section] = [item, ...desired[pin.section]];
      }
    }

    // A person can only live in one place: never suggest someone who is already
    // an incoming/sent request or a friend.
    const taken = new Set(
      [...desired.incoming, ...desired.sent, ...desired.friends].map((i) => i.id),
    );
    desired.suggestions = desired.suggestions.filter((u) => !taken.has(u.id));
    return desired;
  }, [serverView]);

  // Reconcile current rendered view -> desired, with enter/leave animations.
  const syncView = useCallback((desired: View) => {
    const cur = viewRef.current;
    const curSection = new Map<string, Section>();
    for (const s of SECTIONS) for (const it of cur[s]) curSection.set(it.id, s);

    const next: View = { suggestions: [], incoming: [], sent: [], friends: [] };
    const removals: { section: Section; id: string }[] = [];

    for (const s of SECTIONS) {
      const desiredIds = new Set(desired[s].map((i) => i.id));
      next[s] = [...desired[s]];
      // Entering: items newly in this section
      for (const it of desired[s]) {
        if (curSection.get(it.id) !== s) {
          animRef.current.set(animKey(s, it.id), "in");
        }
      }
      // Leaving: items that were here but aren't anymore — keep mounted to animate out
      for (const it of cur[s]) {
        if (!desiredIds.has(it.id)) {
          if (animRef.current.get(animKey(s, it.id)) !== "out") {
            animRef.current.set(animKey(s, it.id), "out");
            removals.push({ section: s, id: it.id });
          }
          next[s].push(it);
        }
      }
    }

    setView(next);

    // Clear one-shot "in" classes so a later re-entry animates again.
    for (const s of SECTIONS) {
      for (const it of desired[s]) {
        if (curSection.get(it.id) !== s) {
          const key = animKey(s, it.id);
          window.setTimeout(() => {
            if (animRef.current.get(key) === "in") {
              animRef.current.delete(key);
              bump();
            }
          }, IN_MS);
        }
      }
    }
    // Drop leaving items once their exit animation has played.
    for (const r of removals) {
      const key = animKey(r.section, r.id);
      window.setTimeout(() => {
        animRef.current.delete(key);
        setView((v) => ({ ...v, [r.section]: v[r.section].filter((x) => x.id !== r.id) }));
      }, OUT_MS);
    }
  }, []);

  const applySync = useCallback(() => {
    syncView(buildDesired());
  }, [syncView, buildDesired]);

  // Re-run whenever the server snapshot changes (initial load + polls + refetch).
  useEffect(() => {
    applySync();
  }, [applySync]);

  // Optimistically move `id` to `target` (null = drop), animate, then fire the
  // mutation. On failure, undo the pin and let the server snapshot restore it.
  const move = useCallback(
    (
      id: string,
      target: Section | null,
      run: () => Promise<unknown>,
      opts?: { sticky?: boolean },
    ) => {
      setActionError(null);
      const item =
        SECTIONS.map((s) => view[s].find((x) => x.id === id)).find(Boolean) ??
        cacheRef.current.get(id);
      if (item) cacheRef.current.set(id, item);
      pinsRef.current.set(id, {
        section: target,
        until: opts?.sticky ? Number.MAX_SAFE_INTEGER : Date.now() + PIN_MS,
      });
      applySync();
      void run().catch((err: unknown) => {
        pinsRef.current.delete(id);
        applySync();
        setActionError(getApolloErrorMessage(err));
      });
    },
    [view, applySync],
  );

  // ── Action handlers ───────────────────────────────────────────────────
  const onAdd = useCallback(
    (id: string) => {
      // Suggestions → Sent (or straight to Friends if they'd already added us).
      move(id, "sent", async () => {
        const { data } = await addFriendMut({ variables: { userId: id } });
        if (String(data?.addFriend ?? "").toLowerCase() === "friends") {
          pinsRef.current.set(id, { section: "friends", until: Date.now() + PIN_MS });
          applySync();
        }
      });
    },
    [move, addFriendMut, applySync],
  );

  const onAccept = useCallback(
    (id: string) => {
      // Incoming → Friends
      move(id, "friends", () =>
        respondMut({ variables: { requesterId: id, accept: true } }),
      );
    },
    [move, respondMut],
  );

  const onReject = useCallback(
    (id: string) => {
      // Incoming → Suggestions
      move(
        id,
        "suggestions",
        () => respondMut({ variables: { requesterId: id, accept: false } }),
        { sticky: true },
      );
    },
    [move, respondMut],
  );

  const onCancel = useCallback(
    (id: string) => {
      // Sent → Suggestions
      move(id, "suggestions", () => cancelMut({ variables: { userId: id } }), {
        sticky: true,
      });
    },
    [move, cancelMut],
  );

  const onUnfriend = useCallback(
    (id: string) => {
      // Friends → Suggestions
      move(id, "suggestions", () => unfriendMut({ variables: { userId: id } }), {
        sticky: true,
      });
    },
    [move, unfriendMut],
  );

  // ── Render helpers ────────────────────────────────────────────────────
  const liveCount = useCallback(
    (s: Section) =>
      view[s].filter((it) => animRef.current.get(animKey(s, it.id)) !== "out").length,
    [view],
  );
  const itemClass = (s: Section, id: string) => {
    const a = animRef.current.get(animKey(s, id));
    return `cx-friend-item${a === "in" ? " cx-friend-item--entering" : ""}${a === "out" ? " cx-friend-item--leaving" : ""}`;
  };

  const incomingCount = liveCount("incoming");
  const sentCount = liveCount("sent");
  const friendsCount = liveCount("friends");

  function Avatar({ u }: { u: FriendRow }) {
    return (
      <NavLink to={`/profile/${u.id}`} className="cx-friend-avatar">
        {u.profileImageUrl ? <img src={u.profileImageUrl} alt="" /> : friendInitial(u)}
      </NavLink>
    );
  }

  return (
    <div className="cx-friends-page">
      <h1 className="cx-friends-title">Friends</h1>
      <div className="cx-friends-tabs" role="tablist" aria-label="Friends sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "friends"}
          className={`cx-friends-tab${tab === "friends" ? " is-active" : ""}`}
          onClick={() => setTab("friends")}
        >
          My Friends
          {friendsCount > 0 ? <span className="cx-friends-tab-count">{friendsCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "incoming"}
          className={`cx-friends-tab${tab === "incoming" ? " is-active" : ""}`}
          onClick={() => setTab("incoming")}
        >
          Received
          {incomingCount > 0 ? <span className="cx-friends-tab-count cx-friends-tab-count--alert">{incomingCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sent"}
          className={`cx-friends-tab${tab === "sent" ? " is-active" : ""}`}
          onClick={() => setTab("sent")}
        >
          Sent
          {sentCount > 0 ? <span className="cx-friends-tab-count">{sentCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "suggestions"}
          className={`cx-friends-tab${tab === "suggestions" ? " is-active" : ""}`}
          onClick={() => setTab("suggestions")}
        >
          Suggestions
        </button>
      </div>
      {actionError ? (
        <div className="ig-feed-banner ig-feed-banner--error" role="alert">
          {actionError}
        </div>
      ) : null}

      {tab === "suggestions" ? (
        <section key="suggestions" className="cx-friends-block cx-friends-panel" aria-label="Friend suggestions">
          <h2>Suggestions</h2>
          {suggestionsLoading && view.suggestions.length === 0 ? (
            <p className="muted small">Loading suggestions…</p>
          ) : null}
          {!suggestionsLoading && liveCount("suggestions") === 0 ? (
            <p className="muted small">No suggestions right now.</p>
          ) : null}
          <ul className="cx-friend-list">
            {view.suggestions.map((u) => (
              <li key={u.id} className={itemClass("suggestions", u.id)}>
                <Avatar u={u} />
                <div className="cx-friend-meta">
                  <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                    <strong>{friendName(u)}</strong>
                  </NavLink>
                </div>
                <button type="button" className="btn-ghost" onClick={() => onAdd(u.id)}>
                  Add Friend
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "incoming" ? (
        <section key="incoming" className="cx-friends-block cx-friends-panel" aria-label="Received friend requests">
          <h2>Received</h2>
          {requestsLoading && view.incoming.length === 0 ? (
            <p className="muted small">Loading requests…</p>
          ) : null}
          {!requestsLoading && incomingCount === 0 ? (
            <p className="muted small">No incoming requests.</p>
          ) : null}
          <ul className="cx-friend-list">
            {view.incoming.map((u) => (
              <li key={u.id} className={itemClass("incoming", u.id)}>
                <Avatar u={u} />
                <div className="cx-friend-meta">
                  <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                    <strong>{friendName(u)}</strong>
                  </NavLink>
                </div>
                <button type="button" className="btn-ghost cx-btn-accept" onClick={() => onAccept(u.id)}>
                  Accept
                </button>
                <button type="button" className="btn-ghost" onClick={() => onReject(u.id)}>
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "sent" ? (
        <section key="sent" className="cx-friends-block cx-friends-panel" aria-label="Sent friend requests">
          <h2>Sent</h2>
          {requestsLoading && view.sent.length === 0 ? (
            <p className="muted small">Loading requests…</p>
          ) : null}
          {!requestsLoading && sentCount === 0 ? (
            <p className="muted small">No sent requests.</p>
          ) : null}
          <ul className="cx-friend-list">
            {view.sent.map((u) => (
              <li key={u.id} className={itemClass("sent", u.id)}>
                <Avatar u={u} />
                <div className="cx-friend-meta">
                  <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                    <strong>{friendName(u)}</strong>
                  </NavLink>
                </div>
                <span className="cx-pending-badge">Pending</span>
                <button type="button" className="btn-ghost cx-btn-cancel" onClick={() => onCancel(u.id)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "friends" ? (
        <section key="friends" className="cx-friends-block cx-friends-panel" aria-label="My friends">
          <h2>My friends</h2>
          {friendsLoading && view.friends.length === 0 ? (
            <p className="muted small">Loading friends…</p>
          ) : null}
          {!friendsLoading && friendsCount === 0 ? (
            <p className="muted small">No friends yet.</p>
          ) : null}
          <ul className="cx-friend-list">
            {view.friends.map((u) => {
              const friendOnline = onlineUserIds.has(u.id);
              return (
                <li key={u.id} className={itemClass("friends", u.id)}>
                  <div className="cx-friend-avatar-wrap">
                    <Avatar u={u} />
                    {friendOnline && <span className="cx-friend-online-dot" aria-hidden />}
                  </div>
                  <div className="cx-friend-meta">
                    <NavLink to={`/profile/${u.id}`} className="cx-friend-profile-link">
                      <strong>{friendName(u)}</strong>
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
                  <button type="button" className="btn-ghost cx-btn-unfriend" onClick={() => onUnfriend(u.id)}>
                    Unfriend
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
