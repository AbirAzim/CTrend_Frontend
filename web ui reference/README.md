# Ke Jitbe — Web UI reference (Vite)

Screenshots of the **production web app** (`src/`) for mobile parity (`mobile/`) and handoff. Compare layout, copy, badges, and admin flows against these files — not pixel-perfect mocks.

**Stack:** React 19 + Vite, `ig-*` CSS, Apollo GraphQL, AppShell (top bar + bottom nav).

## Folder map

| Folder | Route / area | Web source (typical) |
|--------|----------------|----------------------|
| [`feed/`](feed/) | Home `/` | `FeedPage`, sidebars, campaign banner |
| [`create/`](create/) | Create compare | `CreatePostPage` |
| [`messages/`](messages/) | Messenger inbox overlay | `MessengerPanel`, `MessengerContext` |
| [`post/`](post/) | Post detail | `PostDetailPage`, comments, poll results |
| [`profile/`](profile/) | Own profile | `ProfilePage` |
| [`friends/`](friends/) | People modal | `FriendsPage` |
| [`notifications/`](notifications/) | Bell dropdown | `NotificationBell`, in-app list |
| [`search/`](search/) | Global search | AppShell search |
| [`admin/`](admin/) | Admin dashboard tabs | `AdminPage` + tab components |

## Cross-cutting UI (all screens)

- **Brand:** Ke Jitbe logo, tagline *COMPARE · VOTE · VIBE*
- **Top bar:** search, theme toggle, notification bell (badge count), session exit
- **Bottom nav:** Home · Create · Messages · Keeps (badge) · Profile
- **Campaigns:** feed banner (e.g. World Cup Fever 2026 → `/campaign/world-cup-2026`)

## Related reference folders (repo root)

| Folder | Purpose |
|--------|---------|
| `notification reference/` | Android notification shade (WhatsApp / Messenger vs current app) |
| `profile example/` | Profile layout samples |
| `post example/` | Post card / detail samples |
| `chat keyboard gap bug/` | Mobile chat keyboard regression |

## Mobile sync

Track gaps in [`MOBILE_WEB_SYNC_PLAN.md`](../MOBILE_WEB_SYNC_PLAN.md) and [`MOBILE_PROGRESS.md`](../MOBILE_PROGRESS.md).

**Recent parity notes (from product):**

1. **Admin → Invite/Promote:** search must list **non-admin users** by name or email (select to promote); email-only path sends admin invite — see web `AdminPage` admin-management tab.
2. **All notifications:** show **sender avatar** (user) or **app logo** (system/moderator) — like Facebook / Messenger / WhatsApp.
3. **Mobile:** fix `expo-notifications: custom sound default not found in native app` (use bundled sound asset name, not `"default"`).
