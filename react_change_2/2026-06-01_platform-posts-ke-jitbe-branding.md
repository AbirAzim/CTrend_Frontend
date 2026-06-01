# Platform-wide posts — Ke Jitbe branding (feed + cards)

**Date:** 2026-06-01  
**Web files:**
- `src/components/FeedPostCard.tsx`
- `src/pages/FeedPage.tsx`
- `src/graphql/feed.ts` — `type` on `feedPosts` / `getPostById`
- `src/lib/mapGqlPostToFeedView.ts` — `postType` (`type?.toLowerCase()`)
- `src/types/feed.ts` — `FeedPostType`
- `src/lib/moderatorBrand.ts`
- `src/pages/CreatePostPage.tsx` — admin **Platform-wide** → `createSystemPost`
- `packages/shared/src/lib/moderatorBrand.ts`
- `packages/shared/src/lib/mapGqlPostToFeedView.ts` — `postType` from `type`
- `packages/shared/src/graphql/feed.ts` — `type` field
- `mobile/components/FeedPostCard.tsx`
- `mobile/app/post/[id].tsx`
- `src/index.css` — `.ig-post--platform`, `.cx-platform-post-badge`, …

**Backend (CTrend):**
- Posts with `PostType.SYSTEM` (`type: "system"` in API).
- `createSystemPost` — sets `type: SYSTEM`, high `feedPriority`.
- New SYSTEM posts can fan out **notifications** to all users (see `posts.service.ts` publish path).
- Included in normal **feed** queries for all users (not friends-only).

---

## What changed

### Feed layout

1. **Removed** the large **Ke Jitbe section wrapper** (`cx-platform-feed` banner: logo, title, hint, nested box).
2. **Single feed list** — platform posts mixed in API order with community posts (`visiblePosts.map`).
3. **Removed** Bengali tagline **「কে জিবে কে জিতবে」** everywhere (`PLATFORM_BRAND_TAGLINE` constant deleted).

### Per-post distinction (subtle, not wrapped)

When `post.postType === "system"`:

| Element | Behavior |
|---------|----------|
| Card | `.ig-post--platform` — light accent gradient, accent border, left stripe always partly visible |
| Header | Logo `/logo.png`, name **Ke Jitbe** (`MODERATOR_PLATFORM_NAME`), **Platform** pill badge |
| Meta | Time only (no “Platform poll ·” prefix after badge added) |
| Profile link | None (not a user post) |

### Mobile

- Same rules in `FeedPostCard` + post detail header.
- `postType` mapped from GraphQL `type` in shared package.

### Admin create

- Platform posts must be created with **Platform-wide** / `createSystemPost` so `type` is `system`. Regular admin posts still show the author’s name.

---

## Design suggestions

1. Optional **pin** platform post to top of feed (backend `feedPriority` already exists).
2. **Sound/haptic** on vote for platform posts (brand moment).
3. Dark mode: verify `.ig-post--platform` gradient in `[data-theme="dark"]` (partial rule exists).

---

## Mobile port checklist

- [ ] `mapGqlPostToFeedView` includes `postType`
- [ ] Header: logo asset + Ke Jitbe + Platform chip
- [ ] No `cx-platform-feed` section clone on mobile home
