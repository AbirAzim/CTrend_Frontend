# Move Admin + Remove New Compare from Top Nav; Admin Shield in Bottom Nav

**Date:** 2026-05-31
**Web files changed:**
- `src/layouts/AppShell.tsx`
- `src/components/IgIcons.tsx`
- `src/index.css`

## What changed

### 1. Top nav cleanup
Removed two CTA pills from the topbar action row:
- **NEW COMPARE** (`NavLink to="/create"`) — redundant; the FAB plus-square in the bottom nav already does this.
- **ADMIN** (`NavLink to="/admin"`) — promoted into the bottom nav as a proper tab.

These were the two widest items in the topbar. Removing them frees ~200px of horizontal space, which gives the search input more breathing room and stops the brand block from being squeezed.

### 2. Bottom nav — new 5-item variant for admins
The bottom nav was hard-coded to a 4-item layout (`ig-bottom-nav--four`). When the viewer is an admin, it now switches to a 5-item layout (`ig-bottom-nav--five`):

**Standard user (4 items, unchanged):**
`Home · Create (FAB) · Keeps · Profile`

**Admin (5 items):**
`Home · Create (FAB) · Keeps · Profile · Admin (Shield)`

### 3. New `IconShield` icon
Two-state SVG (`active` filled / inactive outlined). Outlined version is a shield with a check mark inside; filled is the same silhouette. Reads as "privileged area / verified" without being aggressive.

### 4. Admin nav slot — subtle accent
- `ig-nav-item--admin` colors the icon with `var(--cx-accent-deep)` so it's clearly the privileged slot.
- A small 6×6 gradient dot in the top-right corner (via `::after` pseudo-element) — like a "badge" — signals this is admin-only without using big text or a bright color.
- `position: relative` added so the dot positions against the nav item.

### 5. `.ig-bottom-nav--five` CSS
- `max-width: 440px` (was 372px for four), `gap: 6px`, same `space-between` distribution.
- All five items use the same 46×46 hit target — no awkward squeeze.

## Mobile implementation instructions

1. Drop the equivalent top-bar ADMIN / NEW COMPARE buttons from the React Native shell.
2. In the bottom tab navigator, conditionally insert an Admin tab when `user.role === "admin"`.
3. Use a shield-with-check icon (e.g. `Ionicons "shield-checkmark-outline"`).
4. Match the spacing pattern: 4-tab default; 5-tab with same distribution when admin.

## Notes / gotchas
- **Dead CSS preserved** (`ig-topbar-admin`, `ig-topbar-cta`, `ig-topbar-cta-label`, `ig-topbar-cta-glyph`) — leaving them in place because they're harmless and might be referenced by other components I haven't audited. Safe to remove in a future cleanup pass.
- **The mobile search-icon button** (from the global search component) still appears between the brand block and the action chips. With ADMIN + NEW COMPARE gone, the topbar now fits comfortably on every breakpoint.
- **`IconShield` `active` state** uses a filled shield with the integrated check mark drawn into the SVG path — slight modeling trick because filled SVGs need a single path for crisp rendering, so the check is sculpted into the negative space.
- **The accent dot on the admin slot** is purely decorative; it does NOT track unread admin notifications. If you want it to indicate pending admin tasks (e.g. pending invitations to review), wire it to a count badge similar to `ig-nav-keeps-badge`.
