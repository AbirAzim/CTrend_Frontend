# Session audit — code vs `react_change_2` coverage

**Date:** 2026-06-01  
Use this checklist to confirm nothing was missed when porting to mobile or reviewing with backend.

---

## Covered (has a dedicated `.md`)

| Change | Doc |
|--------|-----|
| Discuss inline panel, show more, scroll, Hide toggle | [discuss-panel-ux-overhaul.md](./2026-06-01_discuss-panel-ux-overhaul.md) |
| Discuss CSS class map | [discuss-panel-index-css.md](./2026-06-01_discuss-panel-index-css.md) |
| Ordered port list (this session) | [web-session-porting-guide.md](./2026-06-01_web-session-porting-guide.md) |
| Enter-to-post, newest-first (older scope) | [phase2-comment-ux.md](./2026-06-01_phase2-comment-ux.md) |
| Comment N+1 + Apollo cache policy | [comment-load-performance.md](./2026-06-01_comment-load-performance.md) |
| POST_VOTE + anonymous privacy | [vote-notifications-anonymous-privacy.md](./2026-06-01_vote-notifications-anonymous-privacy.md) |
| votes.service DI / notify hardening | [votes-service-backend-fixes.md](./2026-06-01_votes-service-backend-fixes.md) |
| Ke Jitbe per-post branding, no feed banner, no Bengali tagline | [platform-posts-ke-jitbe-branding.md](./2026-06-01_platform-posts-ke-jitbe-branding.md) |
| Admin Post management table, filters, edit audit, avatars | [admin-post-management.md](./2026-06-01_admin-post-management.md) |
| Voters modal, action bar, dark mode (earlier batch) | phase1 / phase2b docs |
| Notifications phase 4 (earlier batch) | [phase4-notifications.md](./2026-06-01_phase4-notifications.md) |
| Profile grid / voted tab (earlier batch) | profile docs |

---

## Documented in this audit (were thin or split across files)

### Web — platform posts

| File | Change | Also in |
|------|--------|---------|
| `src/pages/FeedPage.tsx` | Single `visiblePosts` list (no `cx-platform-feed` section); empty-state copy mentions Ke Jitbe | platform-posts doc |
| `src/graphql/feed.ts` | `type` on `feedPosts` / `getPostById` | platform-posts (add explicit web path) |
| `src/lib/mapGqlPostToFeedView.ts` | `postType` via `type?.toLowerCase()` | platform-posts (web-only duplicate of shared mapper) |
| `src/pages/CreatePostPage.tsx` | Admin **Platform-wide** radio → `createSystemPost` mutation | **admin-post-management** (create flow) |
| `src/types/feed.ts` | `FeedPostType`, `postType?` on `FeedPostView` | platform-posts |

### Web — admin

| File | Change | Also in |
|------|--------|---------|
| `src/pages/AdminPage.tsx` | New admin tab **Post management** (`activeTab === "posts"`) | admin-post-management |
| `src/pages/AdminPage.tsx` | `PostsTab`, `AdminPersonLink`, table columns Comments/Hype/Saves | admin-post-management |
| `src/graphql/admin.ts` | `ADMIN_PLATFORM_POSTS` + `query`/`filter` args; author + editor avatars | admin-post-management |
| `src/components/EditPostModal.tsx` | Reused for admin inline edit | admin-post-management |

### Web — discuss (extra detail)

| File | Change | Also in |
|------|--------|---------|
| `PostCommentsPanel.tsx` | `DiscussMoreButton` component | discuss doc (add name) |
| `FeedPostCard.tsx` | `cx-discuss-slot`, chip **Hide** when open, panel in `cx-post-footer` | discuss doc |
| `src/index.css` | `cx-discuss-*`, `ig-post--platform`, `admin-table--posts` | discuss-index-css / platform / admin docs |

### Backend (CTrend)

| File | Change | Also in |
|------|--------|---------|
| `posts.service.ts` | `createSystemPost`, SYSTEM posts in feed, fan-out notifications to all users | **platform-posts** (backend section) |
| `posts.service.ts` | `listPlatformPostsAdmin`, `countPlatformPostsAdmin`, filters | admin-post-management |
| `posts.service.ts` | `updatePost` admin + `editedByIds` / `lastEditedById` | admin-post-management |
| `posts.resolver.ts` | `adminPlatformPosts`, `adminPlatformPostsCount` | admin-post-management |
| `votes.module.ts` | `forwardRef(NotificationsModule)` | votes-service |
| `notifications.service.ts` | `createOrUpdateGrouped` optional `actorId`, anonymous grouping | vote-notifications |

### Shared + mobile (platform branding)

| File | Change | Also in |
|------|--------|---------|
| `packages/shared/src/types/feed.ts` | `FeedPostType`, `postType?` | platform-posts |
| `packages/shared/src/lib/mapGqlPostToFeedView.ts` | Maps `type` → `postType` | platform-posts |
| `packages/shared/src/graphql/feed.ts` | `type` on feed queries | platform-posts |
| `packages/shared/src/lib/moderatorBrand.ts` | `MODERATOR_PLATFORM_NAME` (no Bengali tagline) | platform-posts |
| `mobile/components/FeedPostCard.tsx` | Ke Jitbe header + logo + Platform badge | platform-posts |
| `mobile/app/post/[id].tsx` | Same on post detail | platform-posts |

---

## Not in `react_change_2` (by design or not done)

| Item | Notes |
|------|--------|
| **`packages/shared/src/graphql/admin.ts`** | Does **not** include `ADMIN_PLATFORM_POSTS` — admin post table is **web-only** (`src/graphql/admin.ts`). Mobile admin has no Posts tab yet. |
| **Mobile admin Post management** | Not implemented — port after web QA. |
| **`PHASES.md`** | **Interstitial** block for this session; **Phase 5** = message reactions (later). |
| **`admin_level.md`** | Product spec (pre-existing); not duplicated into `react_change_2`. |
| **Message reactions (#8)** | `PHASES.md` Phase 5 — no `react_change_2` doc yet (user will do later). |
| **In-app banner (`InAppNotificationBanner`)** | Mentioned in vote-notifications; no separate doc. |

---

## Entry point

**[web-session-porting-guide.md](./2026-06-01_web-session-porting-guide.md)** — read first; Phase 5 message reactions is **out of scope** (see `PHASES.md`).

---

## Quick QA matrix (whole session)

| # | Test |
|---|------|
| 1 | Discuss: Enter posts, newest on top, show more scrolls, Hide doesn’t duplicate |
| 2 | Comments load: one burst, not N+1 in Network tab |
| 3 | Anonymous vote → “Someone”, no avatar in bell |
| 4 | Platform post in feed: Ke Jitbe + logo, no big banner section |
| 5 | Admin → Post management: toolbar one row, table scrolls, Comments/Hype/Saves columns |
| 6 | Click creator/editor avatar → profile; row click → post |
| 7 | Admin Edit → saves, `editedBy` updates on backend restart |
