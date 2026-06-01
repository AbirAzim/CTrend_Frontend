# Admin — Post management (platform-wide SYSTEM posts)

**Date:** 2026-06-01  
**Web files:**
- `src/pages/AdminPage.tsx` — admin nav tab **Post management**, `PostsTab`, `AdminPersonLink`
- `src/graphql/admin.ts` — `ADMIN_PLATFORM_POSTS`, `ADMIN_PLATFORM_POSTS_COUNT`, `CREATE_SYSTEM_POST` (**web only**; not in `packages/shared`)
- `src/pages/CreatePostPage.tsx` — linked via **New platform post** CTA; admin **Platform-wide** radio uses `CREATE_SYSTEM_POST`
- `src/index.css` — `.admin-table--posts`, `.admin-person-link`, `.admin-table-num`, toolbar (reuse global `.admin-toolbar`)
- `src/components/EditPostModal.tsx` (reused for inline edit)
- `src/index.css` — `.admin-table--posts`, `.admin-person-link`, `.admin-table-num`, …

**Backend (CTrend repo):**
- `src/posts/post.schema.ts` — `editedByIds[]`, `lastEditedById`
- `src/posts/posts.service.ts` — `listPlatformPostsAdmin`, `countPlatformPostsAdmin`, admin `updatePost`
- `src/posts/posts.resolver.ts` — filter/sort args on admin queries
- `src/posts/dto/admin-platform-posts.input.ts`
- `src/posts/graphql/post.types.ts` — `editedBy`, `lastEditedBy`, `updatedAt`

---

## What changed on web

### UX layout

**Toolbar** matches other admin tabs: search on top, filters in `admin-toolbar-controls` row (not stacked full-width selects).

**Table** (`admin-table--posts`) with horizontal scroll on narrow screens:

| Column | Content |
|--------|---------|
| Post | Thumb + caption + short ID — row click opens post |
| Compare | Mini thumbs + labels (horizontal scroll in cell) |
| Created by | `AdminPersonLink` → profile |
| Category | Category name |
| Votes | `totalVotes` (or up+down fallback) |
| Comments | `commentCount` — `.admin-table-num` |
| Hype | `hypeCount` — `.admin-table-num` |
| Saves | `saveCount` — `.admin-table-num` |
| Status | published/scheduled + live/closed + ends relative time |
| Edited by | Stacked `AdminPersonLink` chips (all admins in `editedByIds`) |
| Last edited | `lastEditedBy` link + `updatedAt` relative time |
| Created | `createdAt` (+ scheduled badge if applicable) |
| Actions | View · Edit (`EditPostModal`) |

**`AdminPersonLink`**
- Avatar: `profileImageUrl` → Gmail fallback (same as Users tab)
- Initials fallback on image error
- `onClick` stops propagation so profile navigation doesn’t open the post
- Admin editors use `adminStyle` (purple tint on fallback avatar)

### Toolbar (search · filter · sort)

- **Search:** caption + option labels (server regex)
- **Filter:** status (`PUBLISHED` / `SCHEDULED`), voting (`live` / `closed`), category
- **Sort:** `createdAt` \| `updatedAt` \| `votes` \| `caption` × `asc` \| `desc`
- **Reset filters** when any non-default active
- Pagination: `PAGE_SIZE` (20), count query uses same filter (no sort)

### Edit + audit trail

- Any **admin** can edit **system** posts via `updatePost` (backend allows; author-only rule waived for `PostType.SYSTEM`).
- On admin save: append admin to `editedByIds` (deduped), set `lastEditedById`.
- GraphQL returns `editedBy[]` and `lastEditedBy` as `UserGql` snippets.

### Removed (feed + admin)

- Ke Jitbe **banner block** above the feed list (`cx-platform-feed` wrapper).
- Bengali tagline **「কে জিবে কে জিতবে」** (`PLATFORM_BRAND_TAGLINE` constant).
- Brief **card-list** experiment for admin (reverted) — final UI is **table only**.

### UX iteration log

1. First pass: wide 11-column table (cramped).
2. Second pass: card list (toolbar broke — filters stacked full height).
3. **Final:** Users-tab toolbar + scrollable table + `AdminPersonLink` avatars + dedicated **Comments / Hype / Saves** numeric columns.

---

## Design spec (wireframe)

```
┌─ Post management ─────────────────────── [+ New platform post] ─┐
│ [Search……………………………………………………………………………………………]                      │
│ [Status▾] [Voting▾] [Category▾] [Sort▾] [Order▾]  [Reset]         │
├──────────────────────────────────────────────────────────────────┤
│ Post │Cmp│By│Cat│Votes│Cmt│Hype│Save│Status│Edited│Last│Created│Act│
│  →scroll horizontal on narrow screens────────────────────────────│
└──────────────────────────────────────────────────────────────────┘
```

### Design suggestions (future)

1. **Sticky toolbar** on scroll for long lists.
2. **Bulk actions** — extend voting / archive (needs backend).
3. **Inline status toggle** on row (publish / close voting) without edit modal.
4. **Editor tooltips** — hover chip shows email + edit count if we add `editCount` later.
5. **Sortable column headers** — client-side or server `sortBy` on Comments/Hype.
6. **Mobile admin** — horizontal `FlatList` table or card fallback; port `AdminPersonLink` as `Pressable` + `router.push(/profile/)`.

---

## Mobile implementation instructions

1. Add **Admin → Posts** screen mirroring **table** + toolbar pattern (not full-height stacked filters).
2. Reuse `@ctrend/shared/graphql/admin` queries; pass `query` + `filter` variables.
3. **Person row:** `Image` + `Text` + `router.push(/profile/${id})`.
4. **Edit:** navigate to `edit-post` with `postId` or modal with same fields as `EditPostModal`.
5. **Open post:** `router.push(/post/${id})`.

---

## GraphQL (admin list)

```graphql
query AdminPlatformPosts($query: AdminPlatformPostsQueryInput, $skip: Int, $take: Int) {
  adminPlatformPosts(query: $query, skip: $skip, take: $take) {
    id
    caption
    imageUrls
    authorId
    authorUsername
    authorDisplayName
    authorEmail
    authorProfileImageUrl
    options { label imageUrl }
    commentCount
    hypeCount
    saveCount
    totalVotes
    editedBy { id displayName username email profileImageUrl }
    lastEditedBy { id displayName username email profileImageUrl }
    # … status, votingEndsAt, isVotingOpen, createdAt, updatedAt
  }
}
```

---

## Notes / gotchas

- Filter **status** must be GraphQL enum `PUBLISHED` / `SCHEDULED`, not lowercase `published`.
- Row click opens post; person links and action buttons use `stopPropagation`.
- Backend must be restarted after schema changes for `editedBy` fields.
- Only **`type: system`** posts appear in this tab (platform-wide polls).
- **Mobile:** no Admin Posts screen yet — queries live in `src/graphql/admin.ts` only.

---

## Related docs

- Create flow + feed visibility: [platform-posts-ke-jitbe-branding.md](./2026-06-01_platform-posts-ke-jitbe-branding.md)
- Full session checklist: [session-audit-checklist.md](./2026-06-01_session-audit-checklist.md)
