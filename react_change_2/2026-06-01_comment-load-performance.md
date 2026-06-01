# Comment load performance (N+1 fix)

**Date:** 2026-06-01  

**Backend (CTrend):**
- `src/comments/comments.service.ts` — `hydrateCommentsToGql`, `batchReactionCountsMap`, `batchViewerReactionsMap`; `listByPost` ~4 queries total
- `src/users/users.service.ts` — `findByIds()`
- `src/comments/comment.schema.ts` — indexes `{ postId, createdAt }`, partial top-level, `{ parentId, createdAt }`

**Frontend:**
- `src/components/PostCommentsPanel.tsx` — `cache-and-network` / `cache-first` (was `network-only`)

---

## Problem

`commentsByPost` did per-comment lookups for author, reactions, and viewer reaction → **O(n)** round-trips.

## Solution

1. Load comments for post (sorted).
2. Batch load authors by id set.
3. Batch reaction counts + viewer reactions.
4. Map to GQL in memory.

## Indexes

Support filter/sort by `postId` + `createdAt` and reply threads by `parentId`.

---

## Mobile

- Use same fetch policy on `COMMENTS_BY_POST` in post detail / discuss sheet.
- No mobile-specific backend changes required.

---

## QA

- Open Discuss on post with 50+ comments: single network burst, not dozens of parallel author fetches in Network tab.
