# Vote notifications (POST_VOTE) + anonymous privacy

**Date:** 2026-06-01  

**Frontend:**
- `src/components/NotificationBell.tsx` — hide actor avatar for anonymous votes

**Backend (CTrend):**
- `src/votes/votes.service.ts` — `notifyPostAuthorOfVote`, admin DI `forwardRef`
- `src/votes/votes.module.ts`
- `src/notifications/notifications.service.ts` — optional `actorId`, grouped anonymous handling
- `src/notifications/notifications.resolver.ts` — `resolveActorAvatar` privacy guard
- `src/notifications/notification.schema.ts` — `POST_VOTE` type

---

## Product rules

| Case | Notification |
|------|----------------|
| New vote (not option change / unvote) | Notify post author |
| Self-vote | Skip |
| Anonymous vote | Body uses **"Someone"**; **no** `actorId`; **no** avatar in bell or push |
| Public vote | Actor name + avatar (if profile image exists) |
| Re-vote / change option | No new notification |

---

## Backend details

- `actorId: anonymous ? undefined : voterUserId`
- Grouped notifications: anonymous voters don’t dedupe by id (each counts as distinct for `actorCount`); `latestActorId` cleared when latest voter is anonymous
- `resolveActorAvatar` returns `null` for `POST_VOTE` when no id or name is `Someone`
- Notify is **fire-and-forget** (`void`) so vote latency isn’t blocked

---

## Mobile

- `mobile/app/notifications/index.tsx` — already uses emoji for `POST_VOTE`; ensure no avatar URL used when `latestActorId` is null
- `InAppNotificationBanner` — same icon map

---

## QA

1. User A votes anonymously on User B’s post → B sees “Someone voted on your post”, 🗳️ icon only.
2. User A votes publicly → B sees name + avatar.
3. Platform post vote → author notification still respects anonymous flag.
