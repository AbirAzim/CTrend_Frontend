# Phase 1 — Voters modal full redesign (+ backend pagination/search/avatars)

**Date:** 2026-06-01
**Web files changed:**
- `src/components/FeedPostCard.tsx` (modal markup, state, fetch/pagination logic)
- `src/graphql/feed.ts` (`VOTERS_BY_POST` query)
- `src/index.css` (`.cx-voters-*`, `.cx-voter-*` styles)
- Backend: `src/votes/votes.resolver.ts`, `src/votes/votes.service.ts`,
  `src/users/users.service.ts`, `src/schema.gql`

## What changed on web (final, confirmed behaviour)

Rebuilt the "See voters" / "Voters" modal from a plain grouped list into a polished,
paginated, searchable panel.

**Backend — `votersByPost` now supports search + pagination + avatars:**
- Signature: `votersByPost(postId: ID!, optionIndex: Int, search: String, skip: Int, take: Int): [PostVoterGql!]!`
- `search` → resolves matching user ids by displayName/username (case-insensitive)
  and restricts the vote query to them; anonymous votes are excluded while searching.
  Implemented via new `UsersService.findIdsByNameSearch(term)`.
- `skip`/`take` → `.skip().limit()` for batched loading.
- Each row's `user` now includes `profileImageUrl` (already available via
  `usersService.toGql`; just added to the GraphQL selection).

**Frontend behaviour (all confirmed by the user):**
1. **Floating, centered, non-blocking panel.** No dim backdrop. The page behind
   stays fully **scrollable and interactive** — the overlay is `pointer-events: none`
   and the card is `pointer-events: auto`. The card is fully **opaque** (so the feed
   never bleeds through) with a strong shadow.
2. **Sits under the nav.** Overlay `z-index: 49` (just below the top/bottom nav at
   `z-index: 50`) so the nav chrome stays visible and tappable while the panel is open.
3. **Stays open** until: the **Close** button, **Escape**, or a **click outside** the
   card. Outside-close uses a **document `click` listener** (not mousedown/touchstart,
   so a scroll gesture never closes it) that is **attached one tick late** (so the
   click that opened the modal doesn't immediately close it). No body scroll lock.
4. **Internal list scroll with edge hand-off.** The card is capped at `max-height:
   82dvh`; the list scrolls inside it. There is **no `overscroll-behavior: contain`** —
   when the list reaches its top or bottom, further scrolling flows to the page.
5. **Infinite scroll, 10 at a time** (`VOTERS_PAGE_SIZE = 10`). Loads the first 10 on
   open; fetches the next 10 when scrolled within 140px of the bottom; appends. A
   monotonic request id ignores out-of-order/stale responses. Flat, newest-first list
   (not grouped) so appending never reflows rows already on screen.
6. **Each voter row:** avatar (`profileImageUrl`, else gradient initial; neutral "?"
   for anonymous), display name linking to `/profile/:id` (anonymous = non-clickable),
   relative time, and a small color-coded **"chose <option>" tag** (shown only in the
   all-voters view, not when scoped to one option).
7. **Header:** "Voted by" + a count chip showing loaded count (`N` or `N+` if more).
8. **Server-side search box** (debounced 300ms, clear "×" button, search-aware empty
   state "No voters match …"). Input `font-size: 16px` so iOS doesn't auto-zoom.
9. States: initial loading spinner, load-more spinner, "That's everyone" end marker,
   empty state. Full dark theming.

## Mobile implementation instructions (React Native)

1. **Backend is shared** — the same `votersByPost(search, skip, take)` and
   `profileImageUrl` selection work as-is for mobile. Reuse them.
2. **Use a `FlatList`, not a manual append list.** RN's `FlatList` gives you
   virtualization for free (better than the web's append-only DOM), plus
   `onEndReached` + `onEndReachedThreshold={0.3}` for infinite scroll and
   `ListFooterComponent` for the load-more spinner / "That's everyone" row.
   - `data` = accumulated voters; on `onEndReached` fetch `skip = data.length, take = 10`
     and append; track `hasMore = lastPage.length === 10`; guard with a request id.
3. **Non-blocking floating panel.** Do **not** use RN's `<Modal>` (it blocks the
   screen and you can't scroll the page behind). Instead render an absolutely
   positioned overlay `View` with `pointerEvents="box-none"` (lets touches pass to the
   page) and an inner card `View` with `pointerEvents="auto"`. Keep its `zIndex` below
   the nav so the nav stays on top.
4. **Outside-close.** Since the page is interactive, a global "tap outside closes"
   is awkward in RN. Two options: (a) a Close (×) button + back-button handler
   (`BackHandler` on Android) — simplest and recommended; or (b) wrap the page in a
   `Pressable` that closes when the card is not the target. Prefer (a).
5. **Edge scroll hand-off** — `FlatList` already bounces/stops at its bounds; if the
   panel is inside a scrollable screen, RN's nested scrolling is fine. No
   `overscroll-behavior` equivalent needed.
6. **Search** = `TextInput` with a debounced (300ms) re-query (reset list to page 0).
   Use `autoCapitalize="none"`. iOS auto-zoom isn't a thing in RN, so the 16px rule
   is web-only.
7. **Avatars** = `Image` with a fallback initial `View`; anonymous → neutral avatar.
8. **Option tag** = small `View` pill with `compareOptionLabel(post, selectedOptionIndex)`,
   color by `selectedOptionIndex % 4`.
9. **Theming** — map the light/dark colors below into the RN theme object.

## Relevant web code snippets

```tsx
// Pagination fetch (FeedPostCard.tsx) — adapt to FlatList onEndReached
const VOTERS_PAGE_SIZE = 10;
const { data } = await fetchVoters({
  variables: { postId: post.id, optionIndex, search: term || null, skip, take: VOTERS_PAGE_SIZE },
});
const rows = data?.votersByPost ?? [];
setVoters(prev => append ? [...prev, ...rows] : rows);
setVotersHasMore(rows.length === VOTERS_PAGE_SIZE);
```

```ts
// Backend search helper (users.service.ts)
async findIdsByNameSearch(term: string): Promise<Types.ObjectId[]> {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = { $regex: escaped, $options: 'i' };
  const docs = await this.userModel
    .find({ $or: [{ displayName: regex }, { username: regex }] }, { _id: 1 })
    .lean().exec();
  return docs.map(d => d._id as Types.ObjectId);
}
```

```css
/* Floating, non-blocking, under the nav */
.cx-voters-overlay { background: transparent; pointer-events: none; z-index: 49; }
.cx-voters-overlay .cx-voters-card { pointer-events: auto; }
.cx-voters-card { background: var(--ig-card); /* opaque */ }
```

## Notes / gotchas

- **Web-specific quirks you can skip on mobile:** the `pointer-events: none` overlay
  trick, the "attach outside-click one tick late" hack (React-18 discrete-event
  flush), the 16px-input iOS-zoom guard, and `overscroll-behavior`. These are all
  browser concerns.
- **Centering vs bottom sheet:** web is centered at all sizes (the user explicitly
  rejected a bottom sheet). On mobile a centered card is fine; if you ever want a
  sheet, confirm with the user first.
- **Counts:** the header chip shows *loaded* count (`N+` when more remain), not a true
  total. The true total lives on the post's vote stats — see the action-bar doc for
  the "Voters N" chip which uses `optionStats` sum / `up+down`.
