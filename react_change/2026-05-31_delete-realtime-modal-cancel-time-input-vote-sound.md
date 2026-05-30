# Realtime Delete, People Modal Polish, Outgoing-Request Cancel, Time-Input Fix, Vote Sound Rebuild

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/FeedPage.tsx`
- `src/pages/CreatePostPage.tsx`
- `src/graphql/feed.ts`
- `src/lib/notificationSound.ts`
- `src/index.css`

**Backend files changed:**
- `src/pubsub.ts`
- `src/posts/posts.service.ts`
- `src/feed/new-posts.resolver.ts`
- `src/feed/graphql/post-deleted.types.ts` (new)

## What changed

### 1. Realtime post deletion (backend + frontend)
**Backend:**
- New `POST_DELETED` pubsub topic.
- New `PostDeletedGql` GraphQL type (single `postId: ID!` field).
- `posts.service.deletePost()` now publishes `POST_DELETED` after the cascade-delete completes.
- `NewPostsResolver` exposes a `postDeleted` subscription on the same WebSocket channel as `newPosts`.

**Frontend:**
- New `POST_DELETED_SUB` GraphQL subscription.
- `FeedPage` keeps a local `removedIds: Set<string>` that the subscription writes to.
- `postsRaw` filters BOTH `liveQueue` AND `basePostsRaw` against `removedIds` so deleted posts disappear from the live UI immediately.
- The subscription also fires `refetchFeed()` so the canonical Apollo query is purged.

### 2. Time-input typing — actually works now
**Bug:** The previous controlled `<input value={String(hour12).padStart(2, "0")}>` clamped every keystroke through `Math.max/Math.min`, which made it impossible to type a two-digit value (typing `1` then `2` resulted in `01` then `02`, never `12`).

**Fix:**
- Added local `hourDraft` / `minDraft` string state.
- Inputs read from drafts and accept any 0–2 digit string while typing — no on-the-fly clamping.
- `onBlur` (and Enter) commits: clamps to 1–12 / 0–59, syncs draft and parent value.
- `useEffect` syncs drafts back from props when the date picker reopens.
- Bonus: `updateTime` now defaults the date to today if the user touches the time inputs before picking a day, so the time setting actually takes effect instead of silently no-op.

### 3. People modal — world-class polish
- **Card layout** now uses `display: flex; flex-direction: column` with sticky search header and scrollable list — no more cramped padding.
- **Search input** redesigned:
  - Padding bumped to 10×14px (was 8×12px)
  - Inline SVG magnifier icon embedded as `background-image` (no extra DOM)
  - `padding-left: 38px` makes room for the icon — text never sits under it
  - Subtle accent focus ring (3px translucent shadow) instead of the harsh purple border
  - Themed for both light and dark
- **Header** now has 14×18px padding and a clean 1px bottom border.
- **List scroll area** has 4×14×12px padding so rows don't crash into the edge.

### 4. "Requested by me" — Cancel button on each row
- New `CANCEL_FRIEND_REQUEST` mutation hooked into `FeedPage`.
- Sidebar `requestedByMe` rows now show:
  - Bold display name (unchanged)
  - Small amber "Pending" tag (`cx-pending-tag`) under the name
  - **Cancel** button on the right (`cx-cancel-request-btn`) — ghost styling, blushes rose on hover, calls `cancelFriendRequest` and refetches `FRIEND_REQUESTS` + `FRIEND_SUGGESTIONS`
- "View All" button in the sidebar header (already existed when `> SIDE_PREVIEW_LIMIT`).
- **People modal** for `requestedByMe` mirrors the new layout: Pending tag + Cancel button per row.

### 5. DateTimePicker popover z-index
- Bumped `.ig-dtp-popover` z-index from 200 → 1000.
- Added `isolation: isolate` so the popover establishes a new stacking context (defends against ancestor `transform`/`filter` rules that broke the old z-index).
- Stronger shadow (two layered shadows) so the popover visually "lifts" off the buttons behind it.

### 6. Vote sound — rebuilt as a tactile "tick + pop + thump"
The old vote sound was a melodic pluck + sparkle — too musical, not satisfying for a tap-confirm. Replaced with three layered stages:

| Stage | Window | Sound | Purpose |
|---|---|---|---|
| 1 | 0–35 ms | High-freq tick (1800→1400 Hz sine, sharp 3 ms attack) | Reads as a finger tap — immediate "got it" |
| 2 | 20–180 ms | Warm body pop (520→380 Hz sine, gentle decay) | Adds weight; the "click" is heard, not just felt |
| 3 | 40–160 ms | Sub-bass thump (110 Hz sine) | Physical presence — makes the click feel deliberate |

Total ≈ 200 ms. All `linearRampToValueAtTime(0, ...)` (Safari-safe).

## Mobile implementation instructions

### Realtime delete
1. Wire the new `POST_DELETED_SUB` subscription on mobile.
2. Maintain a `removedIds` set in the feed screen and filter rendered posts against it.

### People modal cancel button
Mirror the row structure: name + Pending tag + Cancel button. Use `cancelFriendRequest` from `graphql/friends`.

### Time input
React Native uses native time pickers — no change needed for the typing bug.

### Vote sound
Mobile uses a prebuilt audio asset; replace it with a recorded version of the new three-stage click if desired.

## Notes / gotchas
- **Backend type-checks clean** with `npx tsc --noEmit`.
- **`POST_DELETED` reaches everyone** — including the deleting user. The frontend filter is idempotent, so adding the same id twice is a no-op.
- **`isolation: isolate` on the popover** is the key fix for the overlap in the screenshot. The old z-index alone wasn't enough when a parent had its own stacking context (e.g. `cx-schedule-picker-wrap` has `transform`-based hover effects, which can suppress descendant z-index).
- **Time input drafts** are intentionally not clamped during typing. The user could type `99` for hours and it would visually show — but on blur it clamps to 12. This is the only way to allow free typing without disrupting the cursor on every keystroke.
- **The Cancel button refetches `FRIEND_REQUESTS`** so the sidebar updates instantly. If the user has a `requestedByMe` count badge or "View all" button gating on `> 3`, those re-render automatically because they read from the same query.
