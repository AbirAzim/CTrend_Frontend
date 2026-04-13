import { useAuth } from "../context/AuthContext";

function initialFromUser(name: string | undefined, email: string): string {
  const s = (name ?? email).trim();
  return s ? s[0]!.toUpperCase() : "?";
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const label = user.displayName || user.email.split("@")[0] || "user";

  return (
    <div className="ig-profile">
      <header className="ig-profile-header">
        <span className="ig-profile-avatar lg">
          {initialFromUser(user.displayName ?? undefined, user.email)}
        </span>
        <div className="ig-profile-stats">
          <div className="ig-stat">
            <strong>0</strong>
            <span>posts</span>
          </div>
          <div className="ig-stat">
            <strong>—</strong>
            <span>followers</span>
          </div>
          <div className="ig-stat">
            <strong>—</strong>
            <span>following</span>
          </div>
        </div>
      </header>

      <div className="ig-profile-bio">
        <p className="ig-profile-name">{label}</p>
        <p className="ig-profile-email muted">{user.email}</p>
      </div>

      <div className="ig-profile-actions">
        <button type="button" className="ig-btn-outline">
          Edit profile
        </button>
        <button type="button" className="ig-btn-outline">
          Share profile
        </button>
      </div>

      <section className="ig-profile-grid" aria-label="Posts">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="ig-grid-cell" />
        ))}
      </section>
      <p className="ig-profile-empty muted">No posts yet</p>

      <button type="button" className="ig-logout" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}
