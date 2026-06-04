# Admin dashboard

All tabs live under **Admin Dashboard** (`ADMIN` badge). Subtitle: *Manage users and admin access.*

**Web:** `src/pages/AdminPage.tsx` and tab components.

## Screenshots

| File | Tab | What it shows |
|------|-----|----------------|
| `users-all-users-table.png` | **Users** | All users table, filters, Invite User, View Profile / Remove |
| `admin-management-promote-revoke.png` | **Admin management** | Admins list, **+ Invite / Promote Admin**, Revoke / Remove |
| `invitations-sent-list.png` | **Invitations** | Sent invites: email, role, status (Pending/Accepted/Expired) |
| `campaigns-world-cup-banner.png` | **Campaigns** | Campaign list, New Campaign, CTA slug, prize, Active/Default |
| `categories-post-categories.png` | **Categories** | Post categories (Entertainment, Sports, …), Add / Edit / Delete |
| `post-management-polls-table.png` | **Post management** | Platform-wide polls, stats, filters, winner column |
| `admin-messages-moderator-chat.png` | **Admin messages** | Chat as **Ke Jitbe Moderator**, threads + recipient picker |

## Invite / promote admin (product rule)

When using **+ Invite / Promote Admin**:

1. **Search** should return every user who is **not already admin**, matchable by **name or email**, then select to promote.
2. If only an **email** is entered and invite is sent → **admin invitation email** flow (see web implementation).

Mobile: `mobile/app/admin/` — align promote search with web before shipping.

## Other admin tabs (no screenshot yet)

- **World Cup** — tournament admin (`WorldCupPage` / admin tab)
