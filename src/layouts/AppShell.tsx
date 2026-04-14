import { NavLink, Outlet } from "react-router-dom";
import { IconHome, IconPlusSquare, IconUser } from "../components/IgIcons";

export function AppShell() {
  return (
    <div className="ig-app">
      <header className="ig-topbar">
        <div className="ig-brand-block">
          <NavLink to="/" className="ig-logo" end>
            CTrend
          </NavLink>
          <span className="ig-brand-tag">Compare · vote · vibe</span>
        </div>
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
      </header>

      <main className="ig-main-scroll">
        <Outlet />
      </main>

      <nav className="ig-bottom-nav ig-bottom-nav--three" aria-label="Main">
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
