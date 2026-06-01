# CTrend — Issue Batch 2 (Phases)

This is the **web** change plan (lives in the repo root). It tracks the second
batch of fixes (notifications, comments, voters dark mode, mobile zoom, and
message reactions), solved **one phase at a time**.

**After each phase is finished on web**, we add a dated `.md` entry to
`react_change_2/` describing the web change + how to port it to the React Native
mobile app — same convention as `react_change/`. So: implement + verify on web
first, then write the mobile-porting doc for that phase.

**Decisions locked in:**
- Message reactions (issue 8): **full backend + realtime** (persist + subscription).
- Mobile zoom (issue 3): **prevent iOS auto-zoom only** (16px inputs; pinch-zoom stays usable).
- Backend lives at `~/documents/code/CTrend` — edited directly when an issue needs it.

Legend: ☐ not started · ◐ in progress · ☑ done

---

## Phase 1 — Voters modal, action bar & dark-mode fixes ☑ (confirmed 2026-06-01)

Grew well beyond the original scope. Confirmed working on web.

- ☑ **#2 "See all voters" — full redesign** — floating, **centered, non-blocking**
  modal (page stays scrollable; sits under the nav at `z-index: 49`), per-voter
  **avatar** + profile link + relative time + color-coded "chose X" tag,
  **server-side search**, **infinite scroll (10 at a time)**, internal list scroll
  that hands off to the page at top/bottom, loading/empty/end states, dark theming.
  Backend `votersByPost` gained `search`, `skip`, `take` args + `profileImageUrl`.
- ☑ **#5 Notification dropdown hover in dark mode** — `.nb-item:hover` /
  `.nb-btn:hover` fell back to light `#f7f7f7` (undefined `--ig-surface-2`); added
  dark hover overrides.
- ☑ **Action bar redesign** (emerged during testing) — **icon-only** chips (no text
  labels; new `IconUsers` for Voters), **count badges** (color-matched pills,
  shown when > 0), bar **wraps** instead of scrolling sideways.

**Files (frontend):** `src/index.css`, `src/components/FeedPostCard.tsx`,
`src/components/IgIcons.tsx`, `src/graphql/feed.ts`
**Files (backend):** `src/votes/votes.resolver.ts`, `src/votes/votes.service.ts`,
`src/users/users.service.ts`, `src/schema.gql`
**Mobile docs:**
- `react_change_2/2026-06-01_phase1-voters-modal-redesign.md`
- `react_change_2/2026-06-01_phase1-action-bar-and-notification-darkmode.md`

---

## Phase 2 — Comment UX + vote-bar layout + single-tap unvote ☑ (confirmed 2026-06-01)

Original scope was the two comment items; grew to include a vote-bar layout
redesign and a full single-tap unvote (frontend + backend) during testing.

- ☑ **#4 Enter to post a comment** — Enter posts, Shift+Enter = newline, on both the
  comment box and the reply box.
- ☑ **#9 Newest comment on top** — top-level comments sorted newest-first; replies
  stay oldest-first (chronological).
- ☑ **Action bar / voting-status layout** — iterated to a **two-zone action bar**:
  zone 1 = flat, evenly-spaced action icons (count badges kept); divider; zone 2 =
  result summary (🏆 closed) / countdown (⏳ open) on the left + "See details ›" on
  the right. Redundant status badge removed (image banner covers it); "Vote
  anonymously" row reverted to just the toggle. Full design spec in the mobile doc.
- ☑ **Single-tap unvote (withdraw)** — tapping the option you already chose now
  withdraws your vote (was a no-op in API mode). New backend `removeVote` mutation
  (publishes the same real-time events as voting); frontend optimistic clear.
- ☑ **Seamless vote/unvote switching** — unified `processVoteIntent` engine so
  vote and unvote share one in-flight queue (`pendingVoteRef`); rapid
  vote→unvote→vote-other always converges on the last tap. Fixed a `??`
  null-coalescing bug that hid the optimistic withdraw.

**Files (frontend):** `src/components/PostCommentsPanel.tsx`,
`src/components/FeedPostCard.tsx`, `src/graphql/feed.ts`, `src/index.css`
**Files (backend):** `src/votes/votes.resolver.ts`, `src/votes/votes.service.ts`,
`src/schema.gql`
**Mobile docs:**
- `react_change_2/2026-06-01_phase2-comment-ux.md`
- `react_change_2/2026-06-01_phase2-vote-bar-layout-and-unvote.md`
- `react_change_2/2026-06-01_phase2b-two-zone-action-bar-redesign.md` (full design spec)

---

## Phase 3 — Mobile zoom / UX (frontend) ☑ (2026-06-01)

- ☑ **#3 Mobile browser zoom on focus (Safari + Chrome mobile)** — all text fields,
  textareas, and selects use **≥16px** on viewports ≤768px and on coarse-pointer
  touch devices (`.cw-input`, comments, search, auth, create/edit, admin, voters).
  Pinch-zoom unchanged (no `maximum-scale=1`).
- ☑ **Mobile web layout polish** — `interactive-widget=resizes-content` on viewport
  (keyboard resizes layout); `100dvh` on body; `text-size-adjust: 100%`; messenger
  composer 16px inside ≤640px sheet; modal/comment panel `dvh` caps; safe-area on
  global-search overlay; `touch-action: manipulation` on nav/icon taps;
  `overscroll-behavior` on modals where applicable.

**Files:** `src/index.css`, `index.html`
**Mobile doc:** _(web-only polish — not added to `react_change_2/` per product choice)_

---

## Phase 4 — Notifications (frontend + backend) ☑ (2026-06-01)

- ☑ **#10 Actor avatar** — `latestActorAvatar` field resolver; bell shows round
  avatar when available, emoji fallback otherwise.
- ☑ **#1 Grouped resurface** — backend bumps `createdAt`, sets `read=false`, updates
  body; comment types re-notify on same actor; subscription merge moves row to top.
- ☑ **#6 Friend request status** — Accept/Reject shows **Accepted ✓** / **Rejected**
  via local state (no refetch-hide).
- ☑ **#7 Comment deep-link** — `commentId` on schema + emit sites; navigate to
  `#comment-{id}`; post page opens comments, scrolls + highlights target.

**Files (frontend):** `src/graphql/notifications.ts`, `src/context/NotificationContext.tsx`,
`src/components/NotificationBell.tsx`, `src/components/PostCommentsPanel.tsx`,
`src/pages/PostDetailPage.tsx`, `src/components/FeedPostCard.tsx`, `src/index.css`
**Files (backend):** `notifications/*`, `comments/comments.service.ts`, `schema.gql`
**Mobile doc:** `react_change_2/2026-06-01_phase4-notifications.md`

---

## Interstitial — Platform posts, discuss perf & admin post management ☑ (2026-06-01)

**Not Phase 5.** This is extra web work done before starting issue **#8** (message
reactions). All porting notes live in `react_change_2/` — start at
[2026-06-01_web-session-porting-guide.md](./react_change_2/2026-06-01_web-session-porting-guide.md).

- ☑ **Discuss UX** — inline panel in post footer, Hide toggle, `DiscussMoreButton`,
  show-more scroll, `userDismissedDiscussRef`.
- ☑ **Comment load** — backend batch hydration (~4 queries); panel
  `cache-and-network` / `cache-first`.
- ☑ **POST_VOTE notifications** — new vote notify; anonymous → “Someone”, no
  `actorId`/avatar; `votes.service` + `forwardRef` notifications module.
- ☑ **Platform-wide posts (Ke Jitbe)** — no feed banner / no Bengali tagline;
  per-post `.ig-post--platform` + logo header; mixed feed list; mobile + shared
  `postType`.
- ☑ **Admin Post management** — tab + table (Votes, Comments, Hype, Saves),
  search/filter/sort, `AdminPersonLink` avatars, admin edit + `editedBy` /
  `lastEditedBy` audit trail.

**Files (frontend):** `PostCommentsPanel.tsx`, `FeedPostCard.tsx`, `FeedPage.tsx`,
`NotificationBell.tsx`, `AdminPage.tsx`, `graphql/admin.ts`, `CreatePostPage.tsx`,
`mapGqlPostToFeedView.ts`, `moderatorBrand.ts`, `index.css`, `packages/shared/*`,
`mobile/*`
**Files (backend):** `comments/*`, `votes/*`, `notifications/*`, `posts/*`

---

## Phase 5 — Message reactions like Messenger (frontend + backend) ☑ (2026-06-01)

- ☑ **#8 React to a message** — hover quick-react bar (desktop), long-press /
  right-click on bubble; 6 emojis (👍 ❤️ 😂 😮 😢 🔥); toggle same emoji to remove;
  reaction strip under bubble; live sync via `messageReactionChanged` subscription.
  - Backend: `MessageReaction` collection, `reactMessage` mutation, batch counts on
    `messages` query, `messageReactionChanged` pubsub.
  - Frontend: `MessageBubble` in `MessengerPanel`, optimistic `reactMessage` in
    `MessengerContext`, GraphQL in `src/graphql/messages.ts` + `packages/shared`.

**Files (frontend):** `src/graphql/messages.ts`, `packages/shared/src/graphql/messages.ts`,
`src/context/MessengerContext.tsx`, `src/components/MessengerPanel.tsx`, `src/index.css`
**Files (backend):** `CTrend/src/messages/*` (`message-reaction.schema.ts`, service, resolver)
**Mobile doc:** `react_change_2/2026-06-01_phase5-message-reactions.md`

---

## Progress log

- **2026-06-01** — Created the phase plan.
- **2026-06-01** — Phase 1 **confirmed done** (web). Final scope: voters-modal
  redesign (floating/centered/non-blocking, avatars, server search, infinite
  scroll, nav z-index + edge scroll handoff), notification dark-mode hover, and an
  icon-only wrapping action bar with count badges. Backend `votersByPost` extended
  with `search`/`skip`/`take`. Mobile-porting docs written in `react_change_2/`.
- **2026-06-01** — Phase 2 **confirmed done** (web). Comment Enter-to-post +
  newest-on-top, vote-bar/status layout (status in the anonymous row), and
  single-tap unvote with a unified vote/unvote engine. Backend gained the
  `removeVote` mutation. Mobile-porting docs written in `react_change_2/`.
- **2026-06-01** — Phase 4 **done** (web). Notification avatars, grouped resurface,
  friend-request status labels, comment deep-links (`commentId` + hash scroll).
  Mobile doc: `react_change_2/2026-06-01_phase4-notifications.md`.
- **2026-06-01** — Phase 3 **done** (web). Mobile Safari + Chrome: 16px form controls,
  viewport `interactive-widget=resizes-content`, messenger/comment/search/auth inputs,
  dvh modal heights, safe-area overlays, touch-action on chrome controls.
- **2026-06-01** — Interstitial (pre-Phase-3) profile/post-view polish: two-zone
  action bar redesign, per-drop stats, new **Voted** tab + anonymous filter
  (backend `myVotedPosts`), and a compact single-post view. Mobile docs:
  `…_phase2b-two-zone-action-bar-redesign.md`,
  `…_profile-stats-voted-tab-compact-post.md`.
- **2026-06-01** — **Interstitial** platform posts, discuss performance, vote
  notifications, and admin post management (web + backend). Docs:
  `react_change_2/2026-06-01_web-session-porting-guide.md` (+ audit checklist).
  **Phase 5 (message reactions) done** — `react_change_2/2026-06-01_phase5-message-reactions.md`.
