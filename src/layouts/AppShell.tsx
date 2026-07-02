import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { IconBookmark, IconHome, IconLogin, IconLogout, IconMessages, IconPlusSquare, IconShield, IconTrophy, IconUser } from "../components/IgIcons";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { MY_SAVED_POSTS } from "../graphql/feed";
import { ME } from "../graphql/profile";
import { SWITCH_ACTIVE_ROLE } from "../graphql/auth";
import { NotificationBell } from "../components/NotificationBell";
import { CoinCounter } from "../components/CoinCounter";
import { GlobalSearch } from "../components/GlobalSearch";
import { MessengerPanel } from "../components/MessengerPanel";
import { WorldCupFloating } from "../components/WorldCupFloating";
import {
  isBottomNavAdmin,
  isBottomNavCreate,
  isBottomNavHome,
  isBottomNavKeeps,
  isBottomNavProfile,
} from "../lib/bottomNavActive";
import { useMobileShell } from "../lib/useMobileShell";

type ThemeMode = "light" | "dark";

export function AppShell() {
  const { logout, isAuthenticated, user, patchUser, setSession } = useAuth();
  const { data: meData } = useQuery(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "network-only",
    errorPolicy: "all",
  });

  // Propagate role from server into stored session.
  useEffect(() => {
    const serverMe = meData?.me;
    if (!serverMe) return;
    const serverRole = serverMe.role?.toLowerCase() ?? null;
    if (serverRole && serverRole !== user?.role?.toLowerCase()) {
      patchUser({ role: serverRole });
    }
  }, [meData]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeRole = (meData?.me?.role ?? user?.role)?.toLowerCase();
  const isAdmin = activeRole === "admin";
  // hasDualRole will be wired once backend exposes `roles` array
  const hasDualRole = false;

  const [switchRoleMut, { loading: switchingRole }] = useMutation(SWITCH_ACTIVE_ROLE);

  async function onSwitchRole() {
    const targetRole = activeRole === "admin" ? "USER" : "ADMIN";
    try {
      const { data } = await switchRoleMut({ variables: { role: targetRole } });
      const payload = data?.switchActiveRole;
      if (payload?.accessToken && payload.user && user) {
        setSession(payload.accessToken, {
          ...user,
          role: (payload.user.role as string)?.toLowerCase() ?? targetRole.toLowerCase(),
        });
      }
    } catch {
      // Silent — role switch is non-critical
    }
  }

  const navigate = useNavigate();
  const location = useLocation();
  const minimalChrome = /^\/world-cup\/match\//.test(location.pathname);
  const [chromeHidden, setChromeHidden] = useState(false);
  const chromeHiddenRef = useRef(false);
  useEffect(() => {
    document.documentElement.dataset.topbarHidden = chromeHidden ? "true" : "false";
    document.documentElement.dataset.chromeHidden = chromeHidden ? "true" : "false";
  }, [chromeHidden]);
  useEffect(() => {
    document.documentElement.dataset.minimalChrome = minimalChrome ? "true" : "false";
    return () => {
      document.documentElement.removeAttribute("data-minimal-chrome");
    };
  }, [minimalChrome]);
  const mobileShell = useMobileShell();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const storedTheme = window.localStorage.getItem("ctrend_theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const lastYRef = useRef(0);
  const scrollRafRef = useRef<number | null>(null);
  const scrollAccumRef = useRef(0);
  const lastScrollDirRef = useRef<-1 | 0 | 1>(0);
  const chromeCooldownUntilRef = useRef(0);
  const topbarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    });
    ro.observe(el);
    document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    return () => ro.disconnect();
  }, []);

  const { data: savedPostsData } = useQuery(MY_SAVED_POSTS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const savedCount = (savedPostsData?.mySavedPosts?.length as number | undefined) ?? 0;

  const {
    panelOpen,
    setPanelOpen,
    openWindowIds,
    totalUnread,
    refetchConversations,
    closeAllMessenger,
  } = useMessenger();

  const messengerOpen = panelOpen || openWindowIds.length > 0;
  const topbarHidden = chromeHidden;
  const navHidden = chromeHidden && !(mobileShell && messengerOpen);

  function revealChrome() {
    scrollAccumRef.current = 0;
    lastScrollDirRef.current = 0;
    if (!chromeHiddenRef.current) return;
    chromeHiddenRef.current = false;
    setChromeHidden(false);
    chromeCooldownUntilRef.current = Date.now() + 280;
  }

  function hideChrome() {
    scrollAccumRef.current = 0;
    lastScrollDirRef.current = 0;
    if (chromeHiddenRef.current) return;
    chromeHiddenRef.current = true;
    setChromeHidden(true);
    chromeCooldownUntilRef.current = Date.now() + 280;
  }

  function resetChromeScrollTracking() {
    lastYRef.current = window.scrollY;
    scrollAccumRef.current = 0;
    lastScrollDirRef.current = 0;
    chromeCooldownUntilRef.current = 0;
  }

  const bottomNavActive = useMemo(() => {
    if (isAuthenticated && messengerOpen) {
      return {
        home: false,
        create: false,
        messages: true,
        keeps: false,
        profile: false,
        admin: false,
      };
    }
    return {
      home: isBottomNavHome(location),
      create: isAuthenticated && isBottomNavCreate(location),
      messages: false,
      keeps: isAuthenticated && isBottomNavKeeps(location),
      profile: isAuthenticated && isBottomNavProfile(location),
      admin: isBottomNavAdmin(location),
      worldCup: location.pathname.startsWith("/world-cup"),
    };
  }, [location, isAuthenticated, messengerOpen]);

  useEffect(() => {
    if (!isAuthenticated || !messengerOpen) return;
    closeAllMessenger();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMessagesNavClick() {
    if (!isAuthenticated) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (messengerOpen) {
      closeAllMessenger();
      return;
    }
    setPanelOpen(true);
    refetchConversations();
  }

  function onHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    if (location.pathname !== "/") {
      return;
    }
    event.preventDefault();
    const isAtTop = window.scrollY <= 8;
    if (!isAtTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.dispatchEvent(new CustomEvent("ctrend:refresh-feed"));
  }

  function onLogoutClick() {
    logout();
    navigate("/login", { replace: true });
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    chromeHiddenRef.current = false;
    setChromeHidden(false);
    resetChromeScrollTracking();
  }, [location.pathname]);

  useEffect(() => {
    const CHROME_REVEAL_TOP = 56;
    const HIDE_DISTANCE = 44;
    const SHOW_DISTANCE = 32;

    resetChromeScrollTracking();

    function onScroll() {
      if (scrollRafRef.current != null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const now = Date.now();
        const y = window.scrollY;
        const delta = y - lastYRef.current;
        lastYRef.current = y;

        if (y < CHROME_REVEAL_TOP) {
          revealChrome();
          return;
        }

        if (now < chromeCooldownUntilRef.current) {
          return;
        }

        const dir: -1 | 0 | 1 = delta > 1 ? 1 : delta < -1 ? -1 : 0;
        if (dir !== 0) {
          if (lastScrollDirRef.current !== 0 && dir !== lastScrollDirRef.current) {
            scrollAccumRef.current = 0;
          }
          lastScrollDirRef.current = dir;
          scrollAccumRef.current += delta;
        }

        if (!chromeHiddenRef.current && scrollAccumRef.current >= HIDE_DISTANCE) {
          hideChrome();
        } else if (chromeHiddenRef.current && scrollAccumRef.current <= -SHOW_DISTANCE) {
          revealChrome();
        }
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current != null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ctrend_theme", theme);
  }, [theme]);


  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return (
    <div className="ig-app">
      {!isOnline && (
        <div className="ig-offline-banner" role="alert" aria-live="assertive">
          <span className="ig-offline-banner-icon" aria-hidden>📡</span>
          <span>You're offline — check your connection</span>
        </div>
      )}
      <header ref={topbarRef} className={`ig-topbar${topbarHidden ? " ig-topbar--hidden" : ""}`}>
        <div className="ig-brand-block">
          <NavLink to="/" className="ig-brand-unit" end aria-label="Ke Jitbe home">
            <span className="ig-brand-bar" aria-hidden="true" />
            <span className="ig-brand-body">
              <img src="/header-logo-light.png?v=1" className="ig-logo-mark ig-logo-mark--light" alt="" />
              <img src="/header-logo.png?v=4" className="ig-logo-mark ig-logo-mark--dark" alt="" />
              <span className="ig-brand-tag">Compare · vote · vibe</span>
            </span>
          </NavLink>
        </div>
        {isAuthenticated && <GlobalSearch />}
        <div className="ig-topbar-actions">
          <button
            type="button"
            className="ig-icon-btn ig-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            <span className="ig-theme-toggle-glyph" aria-hidden>
              {theme === "dark" ? "☀" : "🌙"}
            </span>
          </button>
          {hasDualRole && (
            <button
              type="button"
              className={`ig-role-switcher${isAdmin ? " ig-role-switcher--admin" : ""}`}
              onClick={() => void onSwitchRole()}
              disabled={switchingRole}
              title={`Active: ${activeRole} — click to switch to ${isAdmin ? "user" : "admin"} mode`}
            >
              <span className="ig-role-switcher-dot" aria-hidden />
              {switchingRole ? "…" : isAdmin ? "Admin" : "User"}
            </button>
          )}
          {isAuthenticated && <CoinCounter />}
          {isAuthenticated && <NotificationBell />}
          {isAuthenticated ? (
            <button
              type="button"
              className="ig-icon-btn ig-topbar-logout"
              onClick={onLogoutClick}
              aria-label="Logout"
              title="Logout"
            >
              <IconLogout />
            </button>
          ) : (
            <NavLink
              to="/login"
              className="ig-topbar-cta ig-topbar-cta--auth"
              aria-label="Log in"
              title="Log in"
            >
              <span className="ig-topbar-cta-glyph" aria-hidden>
                <IconLogin size={16} />
              </span>
              <span className="ig-topbar-cta-label">Log in</span>
            </NavLink>
          )}
        </div>
      </header>

      <main className="ig-main-scroll">
        <Outlet key={location.pathname} />
      </main>

      <WorldCupFloating />
      <MessengerPanel />

      <nav
        className={`ig-bottom-nav ig-bottom-nav--six${navHidden ? " ig-bottom-nav--hidden" : ""}`}
        aria-label="Main"
      >
        <Link
          to="/"
          onClick={onHomeClick}
          className={`ig-nav-item${bottomNavActive.home ? " ig-nav-item--active" : ""}`}
          aria-label="Home"
          aria-current={bottomNavActive.home ? "page" : undefined}
        >
          <IconHome active={bottomNavActive.home} />
        </Link>
        <Link
          to={isAuthenticated ? "/create" : "/login"}
          state={!isAuthenticated ? { from: location.pathname } : undefined}
          className={`ig-nav-item ig-nav-item--fab${bottomNavActive.create ? " ig-nav-item--active" : ""}`}
          title="Create compare"
          aria-label="Create compare"
          aria-current={bottomNavActive.create ? "page" : undefined}
        >
          <IconPlusSquare />
        </Link>
        <button
          type="button"
          className={`ig-nav-item ig-nav-item--messages${bottomNavActive.messages ? " ig-nav-item--active" : ""}`}
          aria-label={`Messages${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
          aria-current={bottomNavActive.messages ? "page" : undefined}
          aria-expanded={messengerOpen}
          onClick={onMessagesNavClick}
        >
          <span className="ig-nav-messages-wrap">
            <IconMessages active={bottomNavActive.messages} />
            {totalUnread > 0 ? (
              <span className="ig-nav-msg-badge">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            ) : null}
          </span>
        </button>
        <Link
          to={isAuthenticated ? "/profile?tab=kept" : "/login"}
          state={!isAuthenticated ? { from: "/profile?tab=kept" } : undefined}
          className={`ig-nav-item ig-nav-item--keeps${bottomNavActive.keeps ? " ig-nav-item--active" : ""}`}
          aria-label="View all keeps"
          title="View all keeps"
          aria-current={bottomNavActive.keeps ? "page" : undefined}
        >
          <span className="ig-nav-keeps-wrap">
            <IconBookmark filled={bottomNavActive.keeps} />
            {savedCount > 0 ? (
              <span className="ig-nav-keeps-badge">{savedCount > 99 ? "99+" : savedCount}</span>
            ) : null}
          </span>
        </Link>
        <Link
          to={isAuthenticated ? "/profile" : "/login"}
          state={!isAuthenticated ? { from: "/profile" } : undefined}
          className={`ig-nav-item${bottomNavActive.profile ? " ig-nav-item--active" : ""}`}
          aria-label="Profile"
          aria-current={bottomNavActive.profile ? "page" : undefined}
        >
          <IconUser active={bottomNavActive.profile} />
        </Link>
        {isAdmin ? (
          <Link
            to="/admin"
            className={`ig-nav-item ig-nav-item--admin${bottomNavActive.admin ? " ig-nav-item--active" : ""}`}
            aria-label="Admin dashboard"
            title="Admin dashboard"
            aria-current={bottomNavActive.admin ? "page" : undefined}
          >
            <IconShield active={bottomNavActive.admin} />
          </Link>
        ) : (
          <Link
            to="/world-cup"
            className={`ig-nav-item ig-nav-item--worldcup${bottomNavActive.worldCup ? " ig-nav-item--active" : ""}`}
            aria-label="World Cup"
            title="World Cup"
            aria-current={bottomNavActive.worldCup ? "page" : undefined}
          >
            <IconTrophy active={bottomNavActive.worldCup} />
          </Link>
        )}
      </nav>
    </div>
  );
}
