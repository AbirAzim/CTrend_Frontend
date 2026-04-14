import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { MouseEvent } from "react";
import { IconHome, IconLogout, IconPlusSquare, IconUser } from "../components/IgIcons";
import { useAuth } from "../context/AuthContext";

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div className="ig-app">
      <header className="ig-topbar">
        <div className="ig-brand-block">
          <NavLink to="/" className="ig-logo" end>
            CTrend
          </NavLink>
          <span className="ig-brand-tag">Compare · vote · vibe</span>
        </div>
        <div className="ig-topbar-actions">
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
          <button
            type="button"
            className="ig-topbar-logout"
            onClick={onLogoutClick}
            aria-label="Logout"
            title="Logout"
          >
            <IconLogout />
          </button>
        </div>
      </header>

      <main className="ig-main-scroll">
        <Outlet />
      </main>

      <nav className="ig-bottom-nav ig-bottom-nav--three" aria-label="Main">
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
          to="/create"
          className={({ isActive }) =>
            `ig-nav-item ig-nav-item--fab${isActive ? " ig-nav-item--active" : ""}`
          }
          title="Create compare"
          aria-label="Create compare"
        >
          <IconPlusSquare />
        </NavLink>
        <NavLink
          to="/profile"
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
