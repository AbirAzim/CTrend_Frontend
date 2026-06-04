# Friends page — Sent/Incoming tabs + animated live list moves

**Date:** 2026-06-05
**Web files changed:**
- `src/pages/FriendsPage.tsx` — rewritten around an animated view-model engine
- `src/index.css` — tab counts, sub-tabs, panel + list-item enter/leave animations, action-button accents

**Backend files changed (CTrend):**
- _None._ Uses existing mutations: `addFriend`, `respondFriendRequest`, `cancelFriendRequest`, `unfriend` (all already in `follows.resolver.ts`).

## What changed

### Separate Incoming / Sent tabs
The **Requests** tab now has two sub-tabs — **Incoming** (requests to me) and **Sent**
(requests I made) — each with its own live count badge. Tab + sub-tab switches play a
subtle panel-in transition.

### Instant, animated moves between lists
Every friend action now moves the person between lists **immediately**, with a
fade/slide-out from the list you're looking at:

| Action (where) | Person moves to |
|---|---|
| **Add Friend** (Suggestions) | Sent (or Friends if they'd already added you) |
| **Accept** (Incoming) | Friends |
| **Reject** (Incoming) | Suggestions |
| **Cancel** (Sent) | Suggestions |
| **Unfriend** (Friends) | Suggestions |
| _peer accepts my request_ | Friends (within the 8s poll) |

Because only the active tab is on screen, the visible feedback is the row **leaving**
the current list (the destination updates off-screen); count badges bump instantly.

### How it works (engine)
`FriendsPage` keeps a local 4-section view model (`suggestions / incoming / sent /
friends`) reconciled against the server snapshot:

- **Optimistic pins** — an action sets a `pin` (id → target section) and re-syncs
  immediately, so the move is instant. The pin overrides the server snapshot until
  the server catches up (mutation refetch) or an 8s safety expiry — this stops the
  background poll from "resurrecting" a row you just moved.
- **Sticky pins** for moves *to Suggestions* (reject/cancel/unfriend) don't expire, so
  the person stays in Suggestions even if the suggestion query (limited to 20) doesn't
  list them.
- **Animations** — `syncView` diffs the rendered view against the desired view and tags
  each `(section:id)` as entering (`cx-friend-item--entering`) or leaving
  (`cx-friend-item--leaving`); leaving rows stay mounted ~300ms to play the exit, then
  drop so siblings slide up.
- **Live peer updates** — `FRIEND_REQUESTS` and `MY_FRIENDS` poll every 8s, so a peer
  accepting your request animates your Sent row out / Friends row in without a refresh.
- **Failure rollback** — if a mutation rejects, the pin is dropped and the server
  snapshot animates the person back to where they were.
- Dedupe guard: a person is never shown in Suggestions while they're already an
  incoming/sent request or a friend.

## Manual test

1. **Add** from Suggestions → row slides out, Sent count +1, appears under Sent.
2. **Accept** an Incoming → slides out of Incoming, My Friends count +1.
3. **Reject** an Incoming → slides out, reappears in Suggestions.
4. **Cancel** a Sent → slides out, back to Suggestions.
5. **Unfriend** in My Friends → slides out, back to Suggestions.
6. Second device accepts your request → within ~8s your Sent row leaves and they show
   under My Friends.
7. Kill the network and unfriend → row animates back (rollback) + error banner.
8. `npm run lint` (0 errors), `npm run build` pass.

## Mobile app

<!-- Native UI may differ; port data model + API first. -->
Native can reuse the same transition table and optimistic-pin idea; the GraphQL
mutations are unchanged. For true real-time peer accepts (vs the 8s poll), a backend
friends subscription would be needed — not added here.
