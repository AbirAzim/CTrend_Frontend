# Anonymous vote persistence + admin profile link

**Date:** 2026-05-31

## Anonymous vote (user)

**Problem:** Toggling “Vote anonymously” before or after voting did not persist — checkbox reset on refresh; toggling after vote did not call API.

**Backend (`CTrend`):**
- `PostGql.myVoteAnonymous` — viewer’s saved anonymous flag for that post
- `VotesService.getMyVote()` — returns `{ selectedOptionIndex, anonymous }`
- Existing `votePost(anonymous:)` already updates anonymous without changing option

**Frontend:**
- `myVoteAnonymous` on `FEED_POSTS`, `GET_POST_BY_ID`, `MY_SAVED_POSTS`, `POST_VOTE_UPDATED`
- `FeedPostCard` initializes checkbox from `post.myVoteAnonymous`
- Toggle after vote → `votePost` with same `selectedOptionIndex` + new `anonymous`
- Vote first with checkbox on → passes `anonymous` in existing vote mutation

## Admin moderator — profile link

**Admin Messages tab:** `via {admin name}` and message-log “Sent by” chip link to `/profile/{sentByAdminId}` so admins can verify who sent a moderator message.

**Files:** `AdminMessagesTab.tsx`, `index.css` (`.admin-mod-sent-by-link`)

## Mobile port

1. Request `myVoteAnonymous` on post queries; bind anonymous toggle to `votePost`.
2. Admin chat: tap admin name → open profile by `sentByAdminId`.
