export type AdminTabId =
  | "overview"
  | "users"
  | "admins"
  | "invitations"
  | "campaigns"
  | "categories"
  | "posts"
  | "reports"
  | "worldcup"
  | "admin-messages";

const ADMIN_TABS: { id: AdminTabId; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "Overview" },
  { id: "users", label: "Users", short: "Users" },
  { id: "admins", label: "Admin management", short: "Admins" },
  { id: "invitations", label: "Invitations", short: "Invites" },
  { id: "campaigns", label: "Campaigns", short: "Campaigns" },
  { id: "categories", label: "Categories", short: "Categories" },
  { id: "posts", label: "Post management", short: "Posts" },
  { id: "reports", label: "Reported posts", short: "Reports" },
  { id: "admin-messages", label: "Admin messages", short: "Messages" },
  { id: "worldcup", label: "World Cup", short: "World Cup" },
];

type Props = {
  activeTab: AdminTabId;
  onChange: (tab: AdminTabId) => void;
};

export function AdminTabNav({ activeTab, onChange }: Props) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <div className="admin-nav-mobile">
        <label className="admin-nav-select-wrap">
          <span className="admin-toolbar-label">Section</span>
          <select
            className="admin-toolbar-select admin-nav-select"
            value={activeTab}
            onChange={(e) => onChange(e.target.value as AdminTabId)}
            aria-label="Choose admin section"
          >
            {ADMIN_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-nav-chips" role="tablist" aria-label="Quick section switch">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`admin-nav-chip${activeTab === tab.id ? " admin-nav-chip--active" : ""}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.short}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-tabs admin-tabs--desktop" role="tablist">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`admin-tab${activeTab === tab.id ? " admin-tab--active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.id === "worldcup" ? "🏆 World Cup" : tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
