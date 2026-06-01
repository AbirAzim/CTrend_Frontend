# Web session — porting guide (done on web, Phase 5 messages later)

**Date:** 2026-06-01  
**Status:** Web implemented · mobile port pending · **PHASES.md Phase 5 (message reactions) not started**

Use this as the **single entry point** for everything changed on web in this session.
Read docs **in order** when porting to React Native.

---

## 1. Discuss & comments

| Order | Doc | Web focus |
|-------|-----|-----------|
| 1a | [phase2-comment-ux.md](./2026-06-01_phase2-comment-ux.md) | Enter-to-post, newest top-level first |
| 1b | [discuss-panel-ux-overhaul.md](./2026-06-01_discuss-panel-ux-overhaul.md) | Inline Discuss panel, show more, scroll, Hide |
| 2 | [comment-load-performance.md](./2026-06-01_comment-load-performance.md) | Apollo cache + backend batch |

**CSS (web):** `src/index.css` — search `cx-discuss`, `cx-post-footer`, `cx-action-chip--discuss`.

---

## 2. Vote notifications

| Order | Doc | Web focus |
|-------|-----|-----------|
| 3a | [vote-notifications-anonymous-privacy.md](./2026-06-01_vote-notifications-anonymous-privacy.md) | POST_VOTE rules + bell avatar hide |
| 3b | [votes-service-backend-fixes.md](./2026-06-01_votes-service-backend-fixes.md) | Backend DI, fire-and-forget notify |

**Web:** `NotificationBell.tsx` — `hideVoteActor` for `POST_VOTE` + `Someone`.

---

## 3. Platform-wide posts (Ke Jitbe)

| Doc | Web focus |
|-----|-----------|
| [platform-posts-ke-jitbe-branding.md](./2026-06-01_platform-posts-ke-jitbe-branding.md) | Feed mix, per-post branding, no banner/tagline |

**Web files:** `FeedPage.tsx`, `FeedPostCard.tsx`, `graphql/feed.ts`, `mapGqlPostToFeedView.ts`, `moderatorBrand.ts`, `CreatePostPage.tsx` (platform-wide create).

**Shared/mobile:** `packages/shared/*`, `mobile/components/FeedPostCard.tsx`, `mobile/app/post/[id].tsx`.

**CSS:** `.ig-post--platform`, `.cx-platform-post-badge`, `.ig-post-username-row`.

---

## 4. Admin post management

| Doc | Web focus |
|-----|-----------|
| [admin-post-management.md](./2026-06-01_admin-post-management.md) | Table, filters, edit audit, avatars |

**Web-only GraphQL:** `src/graphql/admin.ts` — `ADMIN_PLATFORM_POSTS`, `ADMIN_PLATFORM_POSTS_COUNT`, `CREATE_SYSTEM_POST` (not in `packages/shared` yet).

**Web:** `AdminPage.tsx` — tab **Post management**, `PostsTab`, `AdminPersonLink`, `EditPostModal`.

**CSS:** `.admin-table--posts`, `.admin-person-link`, `.admin-table-num`.

**Backend:** `posts/post.schema.ts` (`editedByIds`, `lastEditedById`), `listPlatformPostsAdmin`, admin `updatePost`.

---

## 5. Audit & file matrix

| Doc | Purpose |
|-----|---------|
| [session-audit-checklist.md](./2026-06-01_session-audit-checklist.md) | Every file ↔ doc; gaps; QA matrix |

---

## Not in this bundle (do later)

| Item | Where |
|------|--------|
| Message reactions (#8) | `PHASES.md` **Phase 5** — no `react_change_2` doc yet |
| Phases 1–4, profile interstitial | Existing `react_change_2` phase1–4 / profile docs |

---

## Backend restart reminder

After pulling CTrend changes:

```bash
cd ~/Documents/code/CTrend && npm run build && npm run start:dev
```

Needed for: comment indexes, `POST_VOTE`, `editedBy` / `lastEditedBy`, admin post filters.
