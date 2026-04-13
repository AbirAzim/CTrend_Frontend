import { NavLink, Outlet } from "react-router-dom";
import {
  IconHome,
  IconPlusSquare,
  IconReels,
  IconSearch,
  IconUser,
} from "../components/IgIcons";

export function AppShell() {
  return (
    <div className="ig-app">
      <header className="ig-topbar">
        <NavLink to="/" className="ig-logo" end>
          CTrend
        </NavLink>
        <div className="ig-topbar-actions">
          <button type="button" className="ig-icon-btn" aria-label="Notifications">
            <span className="ig-heart-dot" aria-hidden />
          </button>
          <button type="button" className="ig-icon-btn" aria-label="Messages">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden
            >
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="ig-main-scroll">
        <Outlet />
      </main>

      <nav className="ig-bottom-nav" aria-label="Main">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `ig-nav-item${isActive ? " ig-nav-item--active" : ""}`
          }
          aria-label="Home"
        >
          {({ isActive }) => <IconHome active={isActive} />}
        </NavLink>
        <button
          type="button"
          className="ig-nav-item ig-nav-item--muted"
          disabled
          title="Search — coming soon"
          aria-label="Search"
        >
          <IconSearch />
        </button>
        <button
          type="button"
          className="ig-nav-item ig-nav-item--muted"
          disabled
          title="Create — coming soon"
          aria-label="Create"
        >
          <IconPlusSquare />
        </button>
        <button
          type="button"
          className="ig-nav-item ig-nav-item--muted"
          disabled
          title="Reels — coming soon"
          aria-label="Reels"
        >
          <IconReels />
        </button>
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
