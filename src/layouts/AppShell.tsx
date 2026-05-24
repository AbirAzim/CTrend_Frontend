import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useQuery } from "@apollo/client";
import { IconBookmark, IconHome, IconLogout, IconPlusSquare, IconUser } from "../components/IgIcons";
import { useAuth } from "../context/AuthContext";
import { MY_SAVED_POSTS } from "../graphql/feed";
import { ME } from "../graphql/profile";

type ThemeMode = "light" | "dark";

export function AppShell() {
  const { logout, isAuthenticated, user } = useAuth();
  const { data: meData } = useQuery(ME, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-first",
  });
  const isAdmin = (meData?.me?.role ?? user?.role) === "admin";
  const navigate = useNavigate();
  const location = useLocation();
  const [navHidden, setNavHidden] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
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
  const { data: savedPostsData } = useQuery(MY_SAVED_POSTS, {
    skip: !isAuthenticated,
    fetchPolicy: "cache-and-network",
  });
  const savedCount = (savedPostsData?.mySavedPosts?.length as number | undefined) ?? 0;

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
    lastYRef.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastYRef.current;
      // Ignore micro-jitter from touchpads.
      if (Math.abs(delta) < 8) {
        return;
      }
      lastYRef.current = y;
      if (y < 60) {
        setNavHidden(false);
        setTopbarHidden(false);
        return;
      }
      if (delta > 0) {
        // Scrolling down: hide bottom nav, show topbar
        setNavHidden(true);
        setTopbarHidden(false);
      } else {
        // Scrolling up: show bottom nav, hide topbar
        setNavHidden(false);
        setTopbarHidden(true);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("ctrend_theme", theme);
  }, [theme]);

  return (
    <div className="ig-app">
      <header className={`ig-topbar${topbarHidden ? " ig-topbar--hidden" : ""}`}>
        <div className="ig-brand-block">
          <NavLink to="/" className="ig-logo" end>
            CTrend
          </NavLink>
          <span className="ig-brand-tag">Compare · vote · vibe</span>
        </div>
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
          {isAdmin && (
            <NavLink
              to="/admin"
              className="ig-topbar-cta ig-topbar-admin"
              title="Admin dashboard"
            >
              <span className="ig-topbar-cta-label">Admin</span>
            </NavLink>
          )}
          {isAuthenticated && (
            <NavLink
              to="/create"
              className="ig-topbar-cta"
              title="Start a new compare"
            >
              <span className="ig-topbar-cta-glyph" aria-hidden>
                &#10022;
              </span>
              <span className="ig-topbar-cta-label">New compare</span>
            </NavLink>
          )}
          {isAuthenticated ? (
            <button
              type="button"
              className="ig-topbar-logout"
              onClick={onLogoutClick}
              aria-label="Logout"
              title="Logout"
            >
              <IconLogout />
            </button>
          ) : (
            <NavLink to="/login" className="ig-topbar-cta">
              <span className="ig-topbar-cta-label">Log in</span>
            </NavLink>
          )}
        </div>
      </header>

      <main className="ig-main-scroll">
        <Outlet />
      </main>

      <nav
        className={`ig-bottom-nav ig-bottom-nav--four${navHidden ? " ig-bottom-nav--hidden" : ""}`}
        aria-label="Main"
      >
        <NavLink
          to="/"
          end
          onClick={onHomeClick}
          className={({ isActive }) =>
            `ig-nav-item${isActive ? " ig-nav-item--active" : ""}`
          }
          aria-label="Home"
        >
          {({ isActive }) => <IconHome active={isActive} />}
        </NavLink>
        <NavLink
          to={isAuthenticated ? "/create" : "/login"}
          state={!isAuthenticated ? { from: location.pathname } : undefined}
          className={({ isActive }) =>
            `ig-nav-item ig-nav-item--fab${isActive ? " ig-nav-item--active" : ""}`
          }
          title="Create compare"
          aria-label="Create compare"
        >
          <IconPlusSquare />
        </NavLink>
        <NavLink
          to={isAuthenticated ? "/profile?view=keeps#saved-posts" : "/login"}
          state={!isAuthenticated ? { from: "/profile?view=keeps#saved-posts" } : undefined}
          className={({ isActive }) =>
            `ig-nav-item ig-nav-item--keeps${isActive ? " ig-nav-item--active" : ""}`
          }
          aria-label="View all keeps"
          title="View all keeps"
        >
          {({ isActive }) => (
            <span className="ig-nav-keeps-wrap">
              <IconBookmark filled={isActive} />
              <span className="ig-nav-keeps-badge">{savedCount}</span>
            </span>
          )}
        </NavLink>
        <NavLink
          to={isAuthenticated ? "/profile" : "/login"}
          state={!isAuthenticated ? { from: "/profile" } : undefined}
          className={({ isActive }) =>
            `ig-nav-item${isActive ? " ig-nav-item--active" : ""}`
          }
          aria-label="Profile"
        >
          {({ isActive }) => <IconUser active={isActive} />}
        </NavLink>
      </nav>
    </div>
  );
}
