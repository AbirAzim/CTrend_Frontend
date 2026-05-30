# Profile: Drops+Kept Tabs, Edit Post Modal, Profile Header & Edit Form Redesign

**Date:** 2026-05-30
**Web files changed:**
- `src/pages/ProfilePage.tsx`
- `src/components/EditPostModal.tsx` (new)
- `src/graphql/feed.ts`
- `src/graphql/profile.ts`
- `src/index.css`
**Backend files changed:**
- `src/posts/posts.resolver.ts`
- `src/posts/posts.service.ts`
- `src/posts/dto/update-post.input.ts` (new)
- `src/posts/graphql/post.types.ts`

## What changed on web

### Bug fix: `authorProfileImageUrl` missing from `PostGql`
Added `authorProfileImageUrl` field to `PostGql` type and `toGql()` mapper. This was causing `USER_POSTS` query failures (silent blank drops tab).

### Backend: `updatePost` mutation
New `updatePost(postId: ID!, input: UpdatePostInput!): PostGql` mutation. `UpdatePostInput` has optional `caption`, `imageUrls`, `options`, `categoryId`. Validates ownership (ForbiddenException if not author).

### Edit Post Modal (`EditPostModal.tsx`)
- Per-item rows: thumbnail preview + image URL input + 📁 upload + label input
- Add / remove items (min 2, max 10)
- Category select (from CATEGORIES query)
- Caption textarea
- Opened from ✏️ icon button on each drop card

### Redesigned drop cards (Your drops tab)
- Single-column `cx-drop-list` instead of 2-col grid
- Each row: [thumbnail strip] → [title / meta / option chips / status] → [✏️ 👁 ⏱ icon buttons]
- Extend deadline collapses behind ⏱ button (hidden by default)

### Kept tab shows full FeedPostCard
Full voting UI, comments, share etc. for each saved post instead of just thumbnails.

### Profile header improvements
- Interests shown as `#tag` pills below bio
- Email moved above username for better hierarchy
- Edit button shows ✏️ emoji
- `interests` derived from `me?.interests` (ME query)

### Profile edit form redesign
- Card with `cx-profile-edit-head` (title + close button) + `cx-profile-edit-form` (fields) + `cx-profile-edit-footer` (buttons)
- Uses `cx-edit-input`, `cx-edit-textarea`, `cx-edit-label`, `cx-edit-hint` from the modal design system
- Save/Cancel use `cx-conn-btn` pill buttons

### Visual: profile content card accent
`cx-profile-content-card` now has a 3px purple top border to distinguish it from the page background in light mode.

## Mobile implementation instructions

### `authorProfileImageUrl`
Already returned by all feed queries. No backend change needed for mobile.

### `updatePost` mutation
1. Add `UpdatePostInput` with optional fields
2. Screen: `EditPostScreen` with `ScrollView` containing caption, category picker, per-item rows
3. Per-item: `Image` thumbnail + `TextInput` URL + upload button + label input
4. Min 2 items enforcement, max 10

### Kept tab
Render the full `FeedPostCard` (or mobile equivalent) for each saved post in the kept tab.

### Profile header interests
Display interests as horizontal tag chips below bio using `FlatList` or `ScrollView` with `flexWrap: "wrap"`.

### Edit form
Use `TextInput` for display name, `TextInput` multiline for bio, `TextInput` for interests (comma-separated), all styled with `borderRadius: 8, borderWidth: 1` etc.

## Notes / gotchas
- `USER_POSTS` was failing silently because `authorProfileImageUrl` was not in `PostGql` — fixed by adding the field and mapping it in `toGql()`
- The `gridPosts` type in `ProfilePage` doesn't include `authorId`/`authorProfileImageUrl` in its TypeScript definition — they come from the API but the type narrowing is done later when passed to `EditPostModal`
- `interests` are only available via the `ME` query, not the localStorage `user` object from AuthContext
