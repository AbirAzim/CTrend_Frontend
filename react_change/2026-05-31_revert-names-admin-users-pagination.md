# Revert: Show Display Names + Admin Users Tab Pagination Fix

**Date:** 2026-05-31
**Web files changed:**
- `src/components/FeedPostCard.tsx`
- `src/pages/FeedPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/FriendsPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/graphql/admin.ts`

**Backend files changed:**
- `src/users/users.service.ts`
- `src/users/users.resolver.ts`

## What changed

### 1. Display name visibility — REVERSED
Previous change hid display names and showed `@username` everywhere except profile pages. The user wanted the **opposite**: show display name (e.g. "Badhon Kundu") and hide the `@username` line.

**Reverted in:**
- `FeedPage.friendName()` → returns `displayName || @username` fallback
- `ProfilePage.friendName()` and `friendInitial()` → same pattern; initial strips the leading `@` from fallback strings
- `FriendsPage.friendName()` → same pattern
- `FeedPostCard` post header → shows `authorDisplayName` (fallback to `@authorUsername`)
- `FeedPostCard` avatar initial → from `displayName || username`
- `FeedPostCard` comment authors (mini preview, full list, voter list) → all show display names again

**Kept removed** (no regression): the duplicate `<span>@{username}</span>` rows that appeared below the strong-tagged name. Friend rows now show ONE identifier (the display name) instead of TWO stacked lines.

### 2. Admin → Users tab: now shows ALL users with proper pagination
Two bugs were stacking:

**Bug A — admins counted against the user list.** `LIST_USERS` was called with NO `role` argument, returning all users including admins. The frontend then filtered admins out client-side (`!hasAdminRole(u)`). On a 20-per-page query, any admin in the result set silently shrunk the visible list AND tripped the "less than PAGE_SIZE" Next-button disable check.

**Bug B — no total count.** `Next` was disabled when `allUsers.length < PAGE_SIZE`. After client filtering, this disable check kicked in early; users beyond page 1 were unreachable.

**Backend fixes** (`users.service.ts` + `users.resolver.ts`):
- New `buildListFilter(role)` helper:
  - `role: "user"` → `roles=user AND NOT (roles=admin OR role=admin)` (excludes dual-role admins)
  - `role: "admin"` → matches the role in either field (handles legacy `role` field + new `roles[]` array)
  - no role → no filter
- New `listUsersCount(role?)` query (admin-guarded) that returns the total matching the same filter logic, for proper pagination math.
- `listUsers` now uses the same `buildListFilter` so list + count stay in sync.

**Frontend fixes** (`AdminPage.tsx`):
- `UsersTab`:
  - Passes `role: "user"` to `LIST_USERS` — backend returns only non-admin users
  - Dropped the client-side `.filter((u) => !hasAdminRole(u))` (no longer needed)
  - Calls `LIST_USERS_COUNT` and computes pagination from real totals
  - Pagination footer now displays `Showing 1–20 of 87` and disables Next only when truly at the end
- `AdminsTab`: same pattern — adds `LIST_USERS_COUNT` with `role: "admin"` and updates pagination footer
- Removed the orphaned `hasAdminRole` helper function (no callers)
- Both tabs refetch the count after destructive actions (remove user / revoke admin) so the footer stays accurate

## Mobile implementation instructions

### Display names
Mirror the frontend revert: show `displayName` first, fall back to `@username` only when no display name is set. Drop any `<View>` showing a second `@username` line below the name.

### Admin users pagination
1. Add the `LIST_USERS_COUNT` GraphQL query and feed its result into the pagination state.
2. Pass `role: "user"` (or `"admin"`) when loading paged data.
3. Compute `hasMore = skip + items.length < totalCount` for the Next button.

## Notes / gotchas
- **Backend type-checks clean** (`npx tsc --noEmit`).
- **`buildListFilter`** is a private helper — both `listUsers` and `listUsersCount` use it, so list page and total count are always consistent.
- **Pure-admin accounts** (no `user` role) are correctly EXCLUDED from the Users tab and INCLUDED in the Admins tab. Dual-role admins ('user' + 'admin') are EXCLUDED from Users tab (they're admins; they live in the Admins tab) but DO appear in friend Suggestions / notifications (per earlier spec).
- **Pagination shows "0 of 0"** when no users match, not "1–0 of 0", because of the `totalCount === 0 ? 0 : skip + 1` short-circuit.
- **Removed `<span>@username</span>` rows from friend cards** — even after restoring display names. Those secondary `@username` strings were the bulk of the visual noise the user originally complained about; showing just the display name keeps the rows clean.
