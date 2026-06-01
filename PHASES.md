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

## Phase 3 — Mobile zoom / UX (frontend) ☐

- ☐ **#3 Mobile browser zooms in (esp. message input), hard to use** — root cause is
  iOS Safari auto-zoom when focusing inputs with font-size < 16px. Set all
  text inputs/textareas to ≥16px on mobile (chat input `.cw-input`, comment
  `.ig-post-comments-input`, search inputs, auth fields). Audit other mobile UX
  rough edges flagged while testing.

**Files:** `src/index.css`, `index.html` (viewport already has `viewport-fit=cover`)

---

## Phase 4 — Notifications (frontend + backend) ☐

- ☐ **#10 Show actor's user image on the notification** — backend
  `myNotifications` / `newNotification` need a `latestActorAvatarUrl` (or
  actor object) field; frontend renders avatar instead of emoji where available.
- ☐ **#1 Updated notification re-surfaces as new with new time** — when a grouped
  notification (new hype/comment) updates, backend should bump `createdAt` and
  set `read=false`; frontend already moves it to top — verify unread + time refresh.
- ☐ **#6 Friend-request accept/reject shows status instantly** — after pressing
  Accept/Reject, the row should immediately read "Accepted ✓" / "Rejected"
  instead of just hiding/spinning. Local optimistic state in `NotificationBell`.
- ☐ **#7 Comment notification deep-links to the exact comment** — notification must
  carry the comment id; clicking navigates to `/post/:postId#comment-:commentId`,
  the post page scrolls to & highlights that comment. Needs backend to expose
  comment id on POST_COMMENT/COMMENT_REPLY/COMMENT_REACTION notifications +
  `PostDetailPage`/`PostCommentsPanel` scroll-to logic.

**Files (frontend):** `src/graphql/notifications.ts`, `src/context/NotificationContext.tsx`,
`src/components/NotificationBell.tsx`, `src/components/PostCommentsPanel.tsx`,
`src/pages/PostDetailPage.tsx`
**Files (backend):** notification resolvers/schema + emit sites in `~/documents/code/CTrend`

---

## Phase 5 — Message reactions like Messenger (frontend + backend) ☐

- ☐ **#8 React to a message** — long-press / hover a message bubble → emoji picker
  → reaction shows on the bubble (Messenger-style), persisted and pushed live to
  the other participant.
  - Backend: add `reactions` to Message model + `reactMessage(messageId, emoji)`
    mutation + broadcast over `messageReceived`/a new `messageReactionChanged` sub.
  - Frontend: reaction UI on `cw-bubble`, optimistic update in
    `MessengerContext`, wire the new mutation + subscription.

**Files (frontend):** `src/graphql/messages.ts`, `src/context/MessengerContext.tsx`,
`src/components/MessengerPanel.tsx`, `src/index.css`
**Files (backend):** messages schema/resolvers + subscription in `~/documents/code/CTrend`

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
