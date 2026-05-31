# Mobile UX/UI adoption guide (from current web screenshots)

**Date:** 2026-05-31  
**Reference screens:** Home feed, post card (open + closed), profile, People, Admin (Users / Admin Management / Invitations / Messages)  
**Web reference files:**
- `src/components/FeedPostCard.tsx`
- `src/layouts/AppShell.tsx`
- `src/pages/ProfilePage.tsx`
- `src/pages/FriendsPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/AdminMessagesTab.tsx`
- `src/index.css` (`cx-*`, `ig-*`, `admin-*` classes)

This doc captures **patterns visible in the current web UI** that mobile should adopt for parity — not a full redesign brief.

---

## 1. Global chrome & navigation

### Bottom nav (floating pill)
| Item | Web behaviour | Mobile adopt |
|------|---------------|--------------|
| Home | Active = purple filled circle | Same — one primary tab highlighted |
| Create | Center `+` in square | Same placement (thumb zone) |
| Kept | Bookmark + **badge count** (e.g. `3`) | Show save count badge on tab icon |
| Profile | Person icon | Same |
| Admin | Shield icon + dot when admin | Only render for admin/dual-role; dot = unread admin work |

**Suggestion:** On mobile, keep the nav **floating** with safe-area inset — do not pin flush to the physical bottom edge (matches web `AppShell` feel).

### Top bar
- Logo + tagline **Compare · Vote · Vibe** on home only (or collapsed on scroll).
- Global search pill: *“Search people, posts…”* — one entry point, not separate per screen.
- Right cluster: theme toggle → bell → logout/profile — **consistent order** everywhere.

### Wide vs narrow layout (screenshot 1)
Web uses **3 columns** on desktop: Suggestions | Feed | Friends.  
**Mobile:** Do **not** squeeze columns — map to separate routes/tabs:
- Home feed = center column only
- Suggestions + Friends = reachable from People page or home drawer chips (*View all* links)

---

## 2. Feed post card (open voting)

### Visual hierarchy (top → bottom)
1. Header — avatar, display name, relative time, overflow menu (⋯)
2. Caption / question
3. Compare media (binary side-by-side or grid for 3+)
4. Vote feedback bar — green *“✓ Vote recorded — tap to change”*
5. **Vote anonymously** toggle row (ghost icon + pill switch) — always visible while voting open
6. Status row — `VOTING OPEN` (green pill) + `SEE DETAILS` (purple outline)
7. **Action chip rail** — horizontal scroll on narrow screens
8. Comments panel — **only after Discuss tap** (lazy load)
9. Timestamp footer (*YESTERDAY*)

### Compare media overlays
| State | Treatment |
|-------|-----------|
| Open + not voted | Percent bars at bottom of each option (after votes exist) |
| Open + voted | **VOTED** chip + heart pin on selected cell; other cell still shows % |
| Closed | See §3 |

### Action chip rail (adopt exactly)
Use **outlined pills** with icon + label + optional count:

| Chip | Label pattern | Notes |
|------|---------------|-------|
| Discuss | `Discuss {commentCount}` | Opens comment sheet; **do not** prefetch comments |
| Share | `Share` | Native share sheet / copy link |
| Full page | `Full page` | Only in feed context |
| Hype | `Hype {count}` | Filled heart + accent when active |
| Keep | `Keep {count}` | Bookmark filled when saved |
| Voters | `Voters` | Opens voter list modal |

**UX suggestion:** Keep chip height ≥ 44pt; allow horizontal scroll rather than wrapping to two lines.

### See Details drawer
- Breakdown / pulse cards / extra stats live **inside** expanded details — not above the fold (see `2026-05-30_multi-compare-grid-ux.md`).

---

## 3. Feed post card (closed / final results)

Screenshot: *“Brazil or Argentina”* — FINAL state.

### Banner
- Top strip on media: **FINAL · RESULTS ARE IN 🔒** (warm/brown tone, trophy icon)
- Non-winner side → **grayscale + dim overlay**
- Winner side → **full colour** + stronger % bar

### Footer status (replaces VOTING OPEN)
- Gold **RESULT** pill + one-line summary: *“Argentina won · 56% (5 votes)”*
- `SEE DETAILS` stays for breakdown
- Action chip rail **unchanged** (Discuss count still visible; comments still lazy)

**Mobile adopt:** Use the same winner/loser visual language — don’t only change text; the grayscale/colour split is the primary “poll ended” signal.

---

## 4. Profile screen

### Header block
- Large avatar with soft purple ring
- Name + **Online** green dot (presence)
- `@username` + role badge (**ADMIN** purple pill for dual-role)
- Email (secondary, muted)
- **Edit profile** ghost button

### Stats row — 5 equal cards
`Compares` · `Images` · `Votes` · `Open` · `Kept`  
→ Use a horizontal scroll or 2+3 grid on very small phones; keep **number bold, label small caps**.

### Admin strip (dual-role only)
Purple bar: **ADMIN** label + `Dashboard →` + `Scheduled →`  
Mobile: same strip below stats, above tabs — don’t hide admin entry inside settings.

### Content tabs
- **Your drops (n)** — sparkle icon, default active
- **Kept (n)** — pin icon

### Drop list row
- Two thumbnails + title + category + vote count + option tags + **Open** / closed dot
- Trailing **edit** + **view** icon buttons (not text buttons — saves width)

**Suggestion:** Pull-to-refresh on drops list; skeleton rows while profile cache loads (see `2026-05-31_profile-cache-skeleton.md`).

---

## 5. People / Friends screen

### Structure
- Page title **People**
- Single search: *“Search by name, username or email…”*
- Tabs: **Friends (count)** | Requests | Suggestions — underline active tab in brand purple

### Friends row
- Avatar + name (tap → profile)
- **Chat** — purple square icon button (not text)
- **Unfriend** — ghost text button

### Requests tab
- **Requested me** — Accept / Decline or empty state
- **Requested by me** — **PENDING** amber badge + **Cancel**

**Mobile adopt:** Use **bottom sheet** for friend actions on long-press instead of cramming two buttons on very narrow rows.

---

## 6. Admin — shared table/filter pattern

All admin tabs (Users, Admin Management, Invitations) share one filter **card** pattern:

```
┌─ Search ─────────────────────────────┐
│  🔍 Search users…                    │
├─ SEARCH IN │ STATUS │ SORT BY │ ORDER│
│  dropdowns   dropdowns …             │
└──────────────────────────────────────┘
┌─ Table ──────────────────────────────┐
│  Name | Email | Status | Joined | …  │
└──────────────────────────────────────┘
← Previous   Showing 1–50 of N   Next →
```

### Adopt on mobile
1. **Filters in a collapsible “Filters” sheet** — don’t show four dropdowns inline on phone.
2. **Search debounced** (300ms) — server-side, not client filter.
3. **Status badges:** Verified = green pill, Unverified = amber pill.
4. **Joined column:** date + relative time on second line (muted).
5. **Role badges:** one pill per role (`USER`, `ADMIN`, `SYSTEM`) — dual-role shows **both** pills (see Admin Management screenshot).
6. **Actions column:** icon message button + text actions; on mobile use **⋯ menu** per row: View profile · Message · Remove/Revoke.

### Users tab vs Admin Management tab
| Tab | `listUsers` role | Role column |
|-----|------------------|-------------|
| Users | `user` (pure users only) | USER only |
| Admin Management | `admin` | ADMIN + USER pills for dual-role |

**Do not** merge these tabs on mobile — same separation as web.

### Invitations tab
- Two search fields: email + invited by
- **Role** toggle pills: User | Admin
- **Status** toggle pills: Pending | Accepted | Expired
- Table columns: Email, Role badge, Invited by, Sent, Expires, Status badge

**Suggestion:** On mobile, replace table with **card list**; each card shows email + role + status badge; tap for full detail.

---

## 7. Admin Messages (Ke Jitbe Moderator)

### Layout
Web: **sidebar | chat** split.  
Mobile adopt:
- **Screen 1:** Thread list + search + “Show message log”
- **Screen 2:** Chat with selected user
- **Screen 3 (modal):** Add recipients picker

### Branding (non-negotiable)
- Platform name: **Ke Jitbe Moderator** (`src/lib/moderatorBrand.ts`)
- Users never see admin personal account in this flow
- Admin sees *“via [admin name]”* on hover/web; mobile: long-press or subtitle under bubble

### Add recipients
- Hint text: *“All accounts with user role — regular users and admin+user dual-role members.”*
- `listUsers(role: "member")` — not `"user"`
- Checkbox list: avatar + name + email
- Search debounced, `take: 50`

### Chat input bar
- 📷 image attach (left)
- Text field — *“Type a moderator message…”*
- Purple **Send** (disabled when empty)

### Thread list row
- Avatar + name + last message preview + relative time
- Purple unread badge when user replied

**Mobile adopt:** Amber/gold bubble styling for moderator messages on **user** app (see `2026-05-31_admin-moderator-messages.md`).

---

## 8. Campaign / promo banner (feed top)

Screenshot: **World Cup Fever 2026** dark banner with CTA + hero image.

| Element | Adopt |
|---------|-------|
| Full-width card above first post | Yes |
| Badge (*Win 100 BDT*) + headline + subcopy | Yes |
| Trailing CTA chip (*World Cup 2026*) | Navigates to campaign route |
| Dismiss | Optional — web doesn’t show dismiss; mobile can add “hide for today” |

---

## 9. Cross-cutting design tokens

Extract from web CSS for RN theme:

| Token | Web usage | Suggested RN value |
|-------|-----------|-------------------|
| Brand purple | Active nav, primary buttons, links | `#8b5cf6` area |
| Success green | VOTING OPEN, vote recorded, Verified | Green pill badges |
| Warning amber | PENDING, moderator/user official msgs | `#f59e0b` area |
| Danger red | Remove actions | Text only, not fill |
| Card radius | Posts, admin cards | ~16–20 |
| Chip radius | Action rail, badges | Full pill (`9999`) |
| Muted text | Email, timestamps, hints | Gray 500–600 |

### Typography
- Section labels: **small caps** (`ADMIN`, `REQUESTED ME`)
- Counts in tabs/buttons: parentheses — `Your drops (4)`
- Relative time: always secondary line or footer, never competing with title

### Empty states
Every list needs one line of muted copy — e.g. *“No users match.”*, *“No incoming requests.”*, *“Pick a conversation on the left…”* — match web strings for i18n parity.

---

## 10. Priority checklist for mobile port

**P0 — user-facing parity**
- [ ] Post card action chip rail with Discuss lazy comments
- [ ] Anonymous vote toggle (persistent while open)
- [ ] Closed poll winner/loser visual treatment
- [ ] Bottom nav with Kept badge
- [ ] Ke Jitbe Moderator chat styling (user side)

**P1 — admin parity**
- [ ] Admin Users vs Admin Management separate lists + filters
- [ ] Admin Messages thread + recipient picker (`role: member`)
- [ ] Invitations filter pills + card layout on mobile

**P2 — polish**
- [ ] Profile stats row + admin strip
- [ ] People tabbed layout + chat icon pattern
- [ ] Campaign banner slot on feed
- [ ] Filter sheet pattern for admin tables

---

## Notes / gotchas

- **Discuss count without comments:** GraphQL returns `commentCount` only; `recentComments` is always `[]` on web — mobile must not render inline comment previews on the feed.
- **Dual-role users:** Show both badges in Admin Management; exclude from pure Users tab; **include** in moderator recipient picker (`member` filter).
- **Desktop 3-column home** is a layout convenience — mobile should not duplicate sidebars on the feed; use navigation instead.
- Reference screenshots saved in workspace assets (2026-05-31 session) for visual QA when implementing RN screens.
