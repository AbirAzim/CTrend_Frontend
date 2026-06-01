# React Change Log 2 — Web → Mobile Sync (Issue Batch 2)

Continuation of `react_change/`. Tracks the **second batch** of web changes so
equivalent work can be ported to the React Native app.

Overall plan: [`../PHASES.md`](../PHASES.md).

## Workflow

1. Implement + verify on **web**.
2. Add a dated entry here (use [`TEMPLATE.md`](./TEMPLATE.md)).
3. Link related entries when one feature spans web + backend.

---

## Phase 5 — message reactions ☑

**[phase5-message-reactions.md](./2026-06-01_phase5-message-reactions.md)** — Messenger bubble reactions (web done).

Interstitial session (Discuss, admin, platform): **[web-session-porting-guide.md](./2026-06-01_web-session-porting-guide.md)**.

---

## Index — 2026-06-01 interstitial session (web done)

Use this table when porting the **current web work** to mobile or reviewing with backend.

| Doc | Topic |
|-----|--------|
| [phase1-voters-modal-redesign.md](./2026-06-01_phase1-voters-modal-redesign.md) | Voters modal UI |
| [phase2-vote-bar-layout-and-unvote.md](./2026-06-01_phase2-vote-bar-layout-and-unvote.md) | Vote bar + unvote |
| [phase2b-two-zone-action-bar-redesign.md](./2026-06-01_phase2b-two-zone-action-bar-redesign.md) | Two-zone action bar |
| [phase2-comment-ux.md](./2026-06-01_phase2-comment-ux.md) | Enter-to-post, newest comment on top |
| [**discuss-panel-ux-overhaul.md**](./2026-06-01_discuss-panel-ux-overhaul.md) | Discuss inline panel, show more, scroll |
| [**comment-load-performance.md**](./2026-06-01_comment-load-performance.md) | Backend N+1 fix + Apollo cache policy |
| [**vote-notifications-anonymous-privacy.md**](./2026-06-01_vote-notifications-anonymous-privacy.md) | POST_VOTE + anonymous privacy |
| [**votes-service-backend-fixes.md**](./2026-06-01_votes-service-backend-fixes.md) | votes.service DI + notify |
| [**platform-posts-ke-jitbe-branding.md**](./2026-06-01_platform-posts-ke-jitbe-branding.md) | Ke Jitbe per-card branding, no feed banner |
| [**admin-post-management.md**](./2026-06-01_admin-post-management.md) | Admin posts tab: table, search/filter/sort, edit audit, avatars |
| [**web-session-porting-guide.md**](./2026-06-01_web-session-porting-guide.md) | **Start here** — ordered port list for this session |
| [**session-audit-checklist.md**](./2026-06-01_session-audit-checklist.md) | File ↔ doc matrix, QA |
| [discuss-panel-index-css.md](./2026-06-01_discuss-panel-index-css.md) | Discuss CSS class map (`index.css`) |
| [phase4-notifications.md](./2026-06-01_phase4-notifications.md) | Notification bell avatars, grouped (earlier) |
| [profile-drops-grid-and-search-thumbs.md](./2026-06-01_profile-drops-grid-and-search-thumbs.md) | Profile grid + search thumbs |
| [profile-stats-voted-tab-compact-post.md](./2026-06-01_profile-stats-voted-tab-compact-post.md) | Profile voted tab |
| [phase1-action-bar-and-notification-darkmode.md](./2026-06-01_phase1-action-bar-and-notification-darkmode.md) | Action bar + dark mode |

**Bold** = this interstitial session (web done, port to mobile when ready).

Earlier phases (1–4, profile): see rows without bold in the table above.

---

## Quick reference — files touched (web)

| Area | Primary files |
|------|-----------------|
| Discuss | `PostCommentsPanel.tsx`, `FeedPostCard.tsx`, `index.css` |
| Platform posts | `FeedPage.tsx`, `FeedPostCard.tsx`, `moderatorBrand.ts`, shared `mapGqlPostToFeedView` |
| Admin posts | `AdminPage.tsx` (`PostsTab`), `graphql/admin.ts`, `EditPostModal.tsx` |
| Notifications | `NotificationBell.tsx` |
| GraphQL feed | `graphql/feed.ts` (`type` on posts) |

**Backend (separate repo `CTrend`):** `comments.service.ts`, `votes.service.ts`, `notifications/*`, `posts.service.ts`, `post.schema.ts`.

---

## Recent highlight

**Admin Post management** uses a **scrollable table** + compact toolbar (same pattern as Users tab), with **clickable avatars** for creator and editors → profile. See [admin-post-management.md](./2026-06-01_admin-post-management.md).
