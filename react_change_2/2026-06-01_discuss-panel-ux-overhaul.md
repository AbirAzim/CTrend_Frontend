# Discuss panel UX overhaul (inline comments)

**Date:** 2026-06-01  
**Web files:**
- `src/components/PostCommentsPanel.tsx`
- `src/components/FeedPostCard.tsx` — Discuss toggle, panel placement
- `src/index.css` — discuss / thread / composer styles (see [discuss-panel-index-css.md](./2026-06-01_discuss-panel-index-css.md))

---

## What changed

### Layout & chrome

- Discuss opens **inline** under the post action rail (inside `cx-post-footer`), not as a heavy modal stack.
- **Removed** duplicate “Hide discussion” bar above composer; single control via:
  - Discuss chip: shows **Hide** when open
  - Sticky panel header: “Hide discussion”
- Composer pinned at **bottom** of panel; thread scrolls above.

### Thread behavior

- `DiscussMoreButton` — **Show N more comments** / **Show less** with chevron (replaces generic ghost button).
- `PREVIEW_THREAD_COUNT = 5` — preview newest 5, then expand via button above.
- On expand: scroll thread to bottom + `scrollIntoView` on anchor (`discussListRef`, `discussFeedEndRef`, `pendingScrollAfterExpandRef`).
- `userDismissedDiscussRef` — user closing Discuss isn’t overridden by `highlightCommentId` / remounts.

### Visual style

- Lighter comment rows (less bordered “bubble” look).
- Pill actions → text links where applicable.
- **Enter-to-post / newest-first:** [phase2-comment-ux.md](./2026-06-01_phase2-comment-ux.md) (same panel; read both when porting).

### Performance (paired change)

See `2026-06-01_comment-load-performance.md` — `cache-and-network` / `cache-first` on panel query; backend batch hydration.

---

## Design suggestions

1. **Skeleton** rows while `commentsByPost` loads.
2. **Reaction bar** collapse on narrow widths.
3. Mobile: full-screen Discuss sheet optional for small phones.

---

## Mobile port

- Match toggle label (Discuss / Hide).
- FlatList inverted vs sorted data — align with web newest-first top-level rule (`phase2-comment-ux.md`).
