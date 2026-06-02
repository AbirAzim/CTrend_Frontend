import { useLazyQuery } from "@apollo/client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { GLOBAL_SEARCH } from "../graphql/search";
import { SearchPostThumbs } from "./SearchPostThumbs";
import { normalizeProfileImageUrl } from "../lib/profileImageUrl";

type SearchUser = {
  isFriend: boolean;
  user: {
    id: string;
    username: string;
    displayName?: string | null;
    email?: string | null;
    profileImageUrl?: string | null;
  };
};

type SearchPost = {
  id: string;
  caption?: string | null;
  imageUrls?: string[] | null;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
};

type SearchData = {
  globalSearch: {
    users: SearchUser[];
    posts: SearchPost[];
  };
};

function userName(u: SearchUser["user"]): string {
  return u.displayName?.trim() || `@${u.username}`;
}

function userInitial(u: SearchUser["user"]): string {
  return (u.displayName?.trim() || u.username || "U").charAt(0).toUpperCase();
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOverlayOpen, setMobileOverlayOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runSearch, { data, loading }] = useLazyQuery<SearchData>(GLOBAL_SEARCH, {
    fetchPolicy: "no-cache",
  });

  // Debounced search trigger
  useEffect(() => {
    if (!mobileOverlayOpen) return;
    const id = requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [mobileOverlayOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length === 0) return;
    debounceRef.current = setTimeout(() => {
      void runSearch({ variables: { query: q, limit: 20 } });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Outside click + Escape close (touch-friendly: pointerdown)
  useEffect(() => {
    if (!open && !mobileOverlayOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (overlayRef.current?.contains(target)) return;
      setOpen(false);
      if (mobileOverlayOpen) {
        setMobileOverlayOpen(false);
        setQuery("");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMobileOverlayOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobileOverlayOpen]);

  function closeAndReset() {
    setOpen(false);
    setMobileOverlayOpen(false);
    setQuery("");
  }

  function goToUser(id: string) {
    closeAndReset();
    navigate(`/profile/${id}`);
  }

  function goToPost(id: string) {
    closeAndReset();
    navigate(`/post/${id}`);
  }

  const users = data?.globalSearch.users ?? [];
  const posts = data?.globalSearch.posts ?? [];
  const showDropdown = (open || mobileOverlayOpen) && query.trim().length > 0;
  const showEmpty = showDropdown && !loading && users.length === 0 && posts.length === 0;

  // Build a single mixed list — friends first (already sorted server-side), then other users, then posts
  const resultsList: Array<
    { kind: "user"; data: SearchUser } | { kind: "post"; data: SearchPost }
  > = [
    ...users.map((u) => ({ kind: "user" as const, data: u })),
    ...posts.map((p) => ({ kind: "post" as const, data: p })),
  ];

  return (
    <>
      {/* Desktop inline input */}
      <div
        className={`cx-gsearch cx-gsearch--bar${open ? " cx-gsearch--open" : ""}`}
        ref={wrapRef}
      >
        <span className="cx-gsearch-icon" aria-hidden>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={desktopInputRef}
          type="search"
          className="cx-gsearch-input"
          placeholder="Search people, posts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          aria-label="Global search"
          enterKeyHint="search"
        />
        {query && (
          <button
            type="button"
            className="cx-gsearch-clear"
            onClick={() => {
              setQuery("");
              desktopInputRef.current?.focus();
            }}
            aria-label="Clear search"
          >✕</button>
        )}

        {/* Dropdown */}
        {showDropdown && !mobileOverlayOpen && (
          <div className="cx-gsearch-dropdown" role="listbox">
            {loading && (
              <p className="cx-gsearch-status">Searching…</p>
            )}
            {showEmpty && (
              <p className="cx-gsearch-status">
                No matches for <strong>"{query.trim()}"</strong>
              </p>
            )}
            {!loading && resultsList.length > 0 && (
              <ul className="cx-gsearch-list">
                {resultsList.map((row, idx) => {
                  if (row.kind === "user") {
                    const u = row.data.user;
                    const avatarUrl = normalizeProfileImageUrl(u.profileImageUrl);
                    return (
                      <li key={`u-${u.id}-${idx}`}>
                        <button
                          type="button"
                          className="cx-gsearch-row cx-gsearch-row--user"
                          onClick={() => goToUser(u.id)}
                          role="option"
                        >
                          <span className="cx-gsearch-avatar">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                            ) : userInitial(u)}
                          </span>
                          <span className="cx-gsearch-row-meta">
                            <span className="cx-gsearch-row-name">
                              {userName(u)}
                              {row.data.isFriend && (
                                <span className="cx-gsearch-friend-tag">Friend</span>
                              )}
                            </span>
                            <span className="cx-gsearch-row-sub">@{u.username}</span>
                          </span>
                        </button>
                      </li>
                    );
                  }
                  const p = row.data;
                  return (
                    <li key={`p-${p.id}-${idx}`}>
                      <button
                        type="button"
                        className="cx-gsearch-row cx-gsearch-row--post"
                        onClick={() => goToPost(p.id)}
                        role="option"
                      >
                        <SearchPostThumbs imageUrls={p.imageUrls} />
                        <span className="cx-gsearch-row-meta">
                          <span className="cx-gsearch-row-name">
                            {p.caption?.trim() || "Untitled compare"}
                          </span>
                          <span className="cx-gsearch-row-sub">
                            Post by {p.authorDisplayName?.trim() || `@${p.authorUsername}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Mobile icon trigger */}
      <button
        type="button"
        className="cx-gsearch-mobile-btn ig-icon-btn"
        aria-label="Open search"
        onClick={() => {
          setMobileOverlayOpen(true);
          requestAnimationFrame(() => {
            mobileInputRef.current?.focus();
          });
        }}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {/* Mobile overlay — portaled so topbar transform/overflow cannot clip it */}
      {mobileOverlayOpen &&
        createPortal(
          <div
            ref={overlayRef}
            className="cx-gsearch-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div className="cx-gsearch-overlay-head">
              <button
                type="button"
                className="cx-gsearch-overlay-back"
                onClick={closeAndReset}
                aria-label="Close search"
              >
                ←
              </button>
              <span className="cx-gsearch cx-gsearch--mobile">
                <span className="cx-gsearch-icon" aria-hidden>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
                    <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  ref={mobileInputRef}
                  type="search"
                  className="cx-gsearch-input"
                  placeholder="Search people, posts…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Global search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    type="button"
                    className="cx-gsearch-clear"
                    onClick={() => {
                      setQuery("");
                      mobileInputRef.current?.focus();
                    }}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </span>
            </div>
            <div className="cx-gsearch-overlay-body">
              {loading && <p className="cx-gsearch-status">Searching…</p>}
              {showEmpty && (
                <p className="cx-gsearch-status">
                  No matches for <strong>"{query.trim()}"</strong>
                </p>
              )}
              {!loading && resultsList.length > 0 && (
                <ul className="cx-gsearch-list">
                  {resultsList.map((row, idx) => {
                    if (row.kind === "user") {
                      const u = row.data.user;
                      const avatarUrl = normalizeProfileImageUrl(u.profileImageUrl);
                      return (
                        <li key={`u-${u.id}-${idx}`}>
                          <button
                            type="button"
                            className="cx-gsearch-row cx-gsearch-row--user"
                            onClick={() => goToUser(u.id)}
                          >
                            <span className="cx-gsearch-avatar">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
                              ) : (
                                userInitial(u)
                              )}
                            </span>
                            <span className="cx-gsearch-row-meta">
                              <span className="cx-gsearch-row-name">
                                {userName(u)}
                                {row.data.isFriend && (
                                  <span className="cx-gsearch-friend-tag">Friend</span>
                                )}
                              </span>
                              <span className="cx-gsearch-row-sub">@{u.username}</span>
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const p = row.data;
                    return (
                      <li key={`p-${p.id}-${idx}`}>
                        <button
                          type="button"
                          className="cx-gsearch-row cx-gsearch-row--post"
                          onClick={() => goToPost(p.id)}
                        >
                          <SearchPostThumbs imageUrls={p.imageUrls} />
                          <span className="cx-gsearch-row-meta">
                            <span className="cx-gsearch-row-name">
                              {p.caption?.trim() || "Untitled compare"}
                            </span>
                            <span className="cx-gsearch-row-sub">
                              Post by {p.authorDisplayName?.trim() || `@${p.authorUsername}`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
