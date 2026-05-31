# Profile Page — Connections Section (Friends, Requests, Suggestions)

**Date:** 2026-05-30
**Web files changed:**
- `src/pages/ProfilePage.tsx`
- `src/graphql/friends.ts`
- `src/index.css`
**Backend files changed:**
- `src/follows/follows.service.ts`
- `src/follows/follows.resolver.ts`

## What changed on web

Moved the social graph (suggestions, sent requests, incoming requests) from the feed sidebar — which has no space on mobile — into the Profile page.

### New backend mutation
`cancelFriendRequest(userId: ID!): Boolean!` — deletes the outgoing PENDING follow document so the user can retract a sent request.

### New frontend GQL
`CANCEL_FRIEND_REQUEST` mutation added to `src/graphql/friends.ts`.

### Profile page additions
Four sections now appear in ProfilePage below the posts grid:

1. **Friends** — existing list enhanced: each avatar/name links to `/profile/:id`, added **Unfriend** ghost button per row.
2. **Friend Requests** — shows `requestedMe` list. Each row: clickable profile link + **Accept** (green pill) + **Reject** (rose outline) buttons. Section hidden when empty.
3. **Sent Requests** — shows `requestedByMe` list. Each row: clickable profile link + "Pending" badge + **Cancel** ghost button. Section hidden when empty.
4. **Suggestions** — shows `friendSuggestions` (limit 10). Each row: clickable profile link + **Add** (purple pill). Section hidden when empty.

All action buttons use an `actionLoadingIds: Set<string>` pattern — each user ID is added on mutation start and removed on completion to show per-row `…` loading state.

After each action, the relevant queries are refetched via `refetch` callbacks rather than `refetchQueries` option to keep control explicit.

New CSS classes: `cx-pf-btn`, `cx-pf-btn--{accept|reject|add|ghost}`, `cx-pf-actions`, `cx-pf-badge`, `cx-pf-badge--alert`, `cx-pf-status-tag`.

## Mobile implementation instructions

1. Add a "Connections" tab or section to the Profile screen.
2. Use the same four subsection structure: Friends, Friend Requests, Sent Requests, Suggestions.
3. Wire `cancelFriendRequest` mutation (new) — same pattern as `unfriend`.
4. Each user row: `TouchableOpacity` wrapping avatar+name → `navigation.navigate('UserProfile', { userId })`.
5. Action buttons: use `ActivityIndicator` when `actionLoadingIds.has(id)`.
6. For "Pending" tag on sent requests: small `View` with `borderRadius`, `borderWidth: 1` and muted color text.
7. For the badge count on section headers: small colored `View` with `Text` inside, `borderRadius: 10`.

## Notes / gotchas
- `cancelFriendRequest` only deletes PENDING rows — if the row is already ACCEPTED it's a no-op (use `unfriend` for that).
- The `requestedMe` count badge turns red (`cx-pf-badge--alert`) to draw attention to pending incoming requests.
- Refetches are called with `void` to suppress unhandled promise lint warnings; errors are silently swallowed since the refetch will restore the correct state anyway.
