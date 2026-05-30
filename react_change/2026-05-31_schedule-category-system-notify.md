# Scheduled Post Fix, DateTimePicker Theme Polish, Category UX, System Post Notifications

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/CreatePostPage.tsx`
- `src/index.css`

**Backend files changed:**
- `src/feed/feed.service.ts`
- `src/posts/posts.service.ts`

## What changed

### 1. Scheduled posts no longer leak into the feed
The bug: my OWN scheduled posts showed up immediately in my feed because the feed filter for own posts had no status restriction. Also: admins saw EVERY post (including scheduled) because the admin branch returned `{}` (no filter).

**Fix** in `feed/feed.service.ts`:
- Admin branch now returns `notScheduled` instead of `{}` — admins still see all posts, just not the unpublished ones.
- Own-posts branch now spreads `...notScheduled`. Scheduled posts only live in `/profile/scheduled`.

### 2. System (admin) posts now notify all users
The bug: `publishNewPost` had an explicit `if (post.type === PostType.SYSTEM) return;` short-circuit, so creating a campaign/admin post never fired notifications to anyone.

**Fix** in `posts/posts.service.ts`:
- Removed the SYSTEM short-circuit.
- New branch in `publishNewPost`: when `post.type === SYSTEM`, fan-out an `ANNOUNCEMENT` notification to every user via `usersService.findAllIds()`. Author is excluded from recipients. Admins who hold the `user` role automatically receive the notification because they're in the all-users list.
- Notification body uses the post caption truncated to 120 chars or a default "A new campaign is live — tap to view." string.
- Title is `📢 {authorName} posted a campaign`. `referenceType=Post`, `referenceId=postId` → clicking the notification jumps to `/post/:id`.
- USER posts still notify only the author's friends (`NEW_POST_FRIEND`), unchanged.

### 3. DateTimePicker — fully theme-aware professional redesign
The popover was hard-coded `--cx-surface, #fff` fallback which broke in dark mode. The trigger looked flat and the time selects were tiny.

**Light mode improvements:**
- Trigger now uses `var(--ig-card)` background + `var(--ig-border)` border, with an accent-tinted focus ring on hover/open.
- Popover uses `var(--ig-card)` + soft 0.5px outline + 40px blur shadow → reads as a proper floating card.
- Calendar days are now circular (`border-radius: 50%`), with a gradient selected state (`--cx-accent-deep → --cx-accent-bright`) and a ring/bold treatment for "today".
- Time selects: larger (font 0.88rem, padding 8px×6px), `appearance: none` with proper centered alignment, accent-tinted focus ring.
- Done button: gradient + shadow, "active" scale animation.
- Clear button hovers to a subtle rose to signal destructive intent.

**Dark mode overrides** (in a dedicated `:root[data-theme="dark"]` block):
- Trigger and category select: `rgb(15 23 42 / 0.6)` slate background, `#e7e9f2` text.
- Popover: solid `#1a1f32` with subtle slate border, 50px deep shadow.
- Time selects: matching slate background, day cells and dropdown `<option>` elements explicitly themed (browser would otherwise show white system menu).

### 4. Category selector — now actually visible
Previously: `border: none; background: transparent; text-align: right;` — essentially invisible against the settings card.

**New design:**
- Category row converted from inline `--col` so the label sits above the control.
- Label gets a **REQUIRED** badge (rose-tinted, uppercase).
- New `cx-cat-select-wrap` + `cx-cat-select` with `appearance: none`, custom chevron, 12px padding, gradient focus ring matching the DateTimePicker trigger.
- Reads as a proper modern dropdown — visible and clickable at a glance.

## Mobile implementation instructions

### Schedule + system notification fixes
Backend-only. Mobile inherits both fixes automatically with no client change.

### DateTimePicker + Category UX
Mobile's native date/time pickers handle theme automatically — no port needed for the picker UI itself. For the category dropdown:
1. Use `Picker` (or `react-native-picker-select` for nicer styling).
2. Apply the same visual treatment: card-style background, border, chevron icon, REQUIRED badge.
3. Show theme-appropriate `backgroundColor` via the theme context.

## Notes / gotchas
- **Backend type-checks clean** with `npx tsc --noEmit`.
- **Existing scheduled posts** that were leaking into the feed will now disappear from the main feed automatically. They're still accessible via `/profile/scheduled`.
- **The system-post notification fan-out** uses `Promise.all` to parallel-fire individual `notificationsService.create()` calls. On a platform with thousands of users this could be optimized to bulk-insert, but for now this matches the existing `sendAdminBroadcast` pattern (which `ANNOUNCEMENT` notifications already use). Same code path → same scaling characteristics.
- **Categories require the user to pick one** (was true before — backend rejects without `categoryId`). The new "REQUIRED" badge just makes it visible.
