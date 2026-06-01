# Profile drop stats + "Voted" tab (anonymous filter) + compact single-post view

**Date:** 2026-06-01
**Web files changed:**
- `src/pages/ProfilePage.tsx` (drop stats row; Voted tab + filter; voted query)
- `src/graphql/profile.ts` (`MY_VOTED_POSTS` query)
- `src/index.css` (`.cx-drop-stats*`, `.cx-voted-filter*`, `.ig-post-detail` media cap)
- Backend: `src/posts/posts.resolver.ts`, `src/posts/posts.service.ts`,
  `src/votes/votes.service.ts`, `src/schema.gql`

Three confirmed changes, all on the profile/post-view surfaces.

---

## 1. Per-drop engagement stats

Each row in **"Your drops"** (and the new **Voted** tab) now shows a stats line under
the title/category/option-chips:

```
🗳️ 6 votes    💬 2    ❤️ 1    🔖 4
```

The data was already returned by `USER_POSTS` (`getPostsByUser`) — fields
`commentCount`, `hypeCount`, `saveCount`, `totalVotes`/`upvoteCount`/`downvoteCount`;
they just weren't displayed. The category line was reduced to just the category name
(votes moved into the stats row).

```css
.cx-drop-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 4px; }
.cx-drop-stat  { display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem;
                 font-weight: 700; color: var(--ig-text); font-variant-numeric: tabular-nums; line-height: 1; }
.cx-drop-stat-icon  { font-size: 0.82rem; line-height: 1; }
.cx-drop-stat-label { font-weight: 600; color: var(--ig-muted); }   /* the " votes" word */
```

Counts of 0 still render (so "no comments yet" is visible as `💬 0`).

---

## 2. "Voted" tab + All / Anonymous filter

A third profile content tab, **🗳️ Voted**, listing posts the current user has voted on,
with a segmented **All votes / 👻 Anonymous** filter.

### Backend (NEW query)
- **`myVotedPosts(anonymousOnly: Boolean): [PostGql!]!`** (auth-guarded).
- `PostsService.listVotedPosts(userId, anonymousOnly, limit=100)` → calls
  `VotesService.listVotedPostIds(userId, anonymousOnly)` (queries the votes
  collection for this user, `sort updatedAt desc`, adds `anonymous: true` when
  `anonymousOnly`), then loads those posts **preserving the vote order** (same
  pattern as `listSavedPosts`). One vote per (user, post) → ids are unique.

```ts
// votes.service.ts
async listVotedPostIds(userId, anonymousOnly = false) {
  const query = { userId: new Types.ObjectId(userId) };
  if (anonymousOnly) query.anonymous = true;
  const votes = await this.voteModel.find(query, { postId: 1 }).sort({ updatedAt: -1 }).lean().exec();
  return votes.map(v => v.postId);
}
```

### Frontend
- `MY_VOTED_POSTS` query (same field selection as `USER_POSTS`).
- `votedFilter` state (`"all" | "anonymous"`) drives `variables.anonymousOnly`; the
  query refetches when the toggle flips (cache-and-network).
- Rows now use **`ProfileCompareCard`** in the Kept-style grid — see
  **`2026-06-01_profile-drops-grid-and-search-thumbs.md`** for the complete card
  design (grid, media strip, footer stats, **Live under icons bottom-left**, status
  pills, edit placement). Voted tab: same stats + status, **no Edit** (posts may be
  other users).
- Empty states differentiate: "You haven't voted anonymously on any posts yet." vs
  "You haven't voted on any posts yet."

```css
/* All / Anonymous segmented control */
.cx-voted-filter { display: inline-flex; gap: 4px; margin-bottom: 12px; padding: 4px;
                   background: rgb(var(--cx-ink-rgb) / 0.05); border-radius: 999px; }
.cx-voted-filter-btn { border: none; background: transparent; color: var(--ig-muted);
                       font-size: 0.78rem; font-weight: 700; padding: 6px 15px; border-radius: 999px;
                       transition: background .18s var(--cx-ease-out), color .18s var(--cx-ease-out); }
.cx-voted-filter-btn--active { background: var(--ig-card); color: var(--cx-accent-deep);
                               box-shadow: 0 1px 3px rgb(var(--cx-ink-rgb) / 0.14); }
:root[data-theme="dark"] .cx-voted-filter { background: rgb(255 255 255 / 0.05); }
:root[data-theme="dark"] .cx-voted-filter-btn--active { background: rgb(255 255 255 / 0.1); color: var(--cx-accent); }
```

---

## 3. Compact single-post view

The single-post page (`/post/:id`, `PostDetailPage` → `FeedPostCard`) used the same
card as the feed but, standalone, a tall compare image dominated the page. Capped the
media height so it reads with feed-card weight:

```css
.ig-post-detail .ig-post-media-wrap,
.ig-post-detail .ig-post-media-wrap--compare,
.ig-post-detail .ig-post-media-wrap--compare-grid { max-height: 58vh; }
.ig-post-detail .ig-post-media-wrap img,
.ig-post-detail .ig-compare-cell img { object-fit: cover; }
```

---

## Mobile implementation instructions (React Native)

1. **Drop stats row** — render a `View` row of `Text` items (icon + number). Use the
   counts already on the post object (`commentCount`, `hypeCount`, `saveCount`,
   `totalVotes`). `flexWrap:'wrap'`, tabular numbers, muted label for "votes".
2. **Voted tab** — add a third tab. Call the new **`myVotedPosts(anonymousOnly)`**
   query (shared backend). A segmented control sets `anonymousOnly`; refetch on change.
   Reuse the same drop-row component as "Your drops" but pass a `canEdit={false}` /
   view-only flag.
3. **Anonymous filter** — pure server-side via `anonymousOnly`; no client filtering.
4. **Compact post view** — RN has no `vh`; use `Dimensions.get('window').height * 0.58`
   (or `useWindowDimensions`) as the media `maxHeight` on the single-post screen, with
   `resizeMode="cover"`. The feed list item can keep its normal aspect ratio.

## Notes / gotchas

- `myVotedPosts` returns full `PostGql`, so the stats/labels come for free.
- Order is **most-recently-voted first** (vote `updatedAt`), not post creation order.
- Voted posts are not necessarily the viewer's own posts → **no Edit affordance**, only
  "view".
- The 58vh cap is single-post-screen only; don't apply it to feed cards.
