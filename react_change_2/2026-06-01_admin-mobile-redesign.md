# Admin panel — responsive web (mobile browser)

**Date:** 2026-06-01  
**Scope:** Web browser only — `@media (max-width: 768px)` and touch-friendly layout in the mobile **browser**.  
**Not in scope:** React Native / native app admin UI (that product will be designed separately).

## Problem

On phones in the **browser** (≤768px), the admin panel was hard to use:

- Eight horizontal tabs overflowed with no way to reach later tabs easily.
- Tables forced `min-width: 760px`–`1100px`, causing painful horizontal scroll.
- Action columns were cramped; toolbars did not stack.

## Solution

### Navigation (`AdminTabNav.tsx`)

- **Mobile browser:** Section `<select>` + horizontally scrollable **chips** for quick jumps.
- **Desktop:** Unchanged tab bar (`.admin-tabs--desktop`).

### Tables (card stack)

- All admin tables use `admin-table admin-table--stack` (+ `admin-table--posts` where needed).
- Each `<td>` has `data-label="…"` for field names.
- CSS at `@media (max-width: 768px)` hides `<thead>`, renders each row as a card, labels via `td::before { content: attr(data-label) }`.
- Action buttons go full-width in a column on mobile.

### Layout polish

- Page/section padding reduced; toolbars and filters stack vertically.
- Post compare thumbnails scroll within the card.
- Admin messages log table uses the same stack pattern.
- `admin-mod-layout` already stacks at 860px; chat body height tuned for small viewports.

## Files

| File | Change |
|------|--------|
| `src/components/admin/AdminTabNav.tsx` | Mobile browser nav |
| `src/pages/AdminPage.tsx` | `AdminTabNav`, `--stack`, `data-label` on cells |
| `src/pages/AdminMessagesTab.tsx` | Stack table + labels |
| `src/index.css` | `.admin-nav-*`, `.admin-table--stack` mobile block |

## Manual test (mobile browser or DevTools ≤768px)

1. Open `/admin` as admin user.
2. Use **Section** dropdown and chips — all 8 sections reachable.
3. **Users / Posts / Invitations** — rows appear as cards with labels; no wide table scroll.
4. **Posts** — compare thumbs scroll; Edit/View actions tappable.
5. **Admin messages** — log list readable; compose layout still usable.
6. **World Cup** — fixture cards show Match, Kickoff, Status, actions.

## Native app

**Do not port this CSS/layout to the mobile app.** Admin on RN will use its own screens and patterns, not the web admin responsive stack.
