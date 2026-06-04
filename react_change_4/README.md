# React Change Log 4 — Chat reply system & fixes

Continuation of `react_change_3/`. Tracks **Messenger-style reply (quote)** support
across the user chat and the admin moderator chat, plus follow-up bug fixes
(notification delivery, vote-tie rendering) — web + backend.

Overall plan: [`../PHASES.md`](../PHASES.md).

## Workflow

1. Implement + verify on **web** and **CTrend backend**.
2. Add a dated entry here (use [`TEMPLATE.md`](./TEMPLATE.md)).
3. Deploy backend before frontend (new GraphQL field + mutation arg).

## Index — 2026-06-04

| Doc | Topic |
|-----|--------|
| [chat-reply-system.md](./2026-06-04_chat-reply-system.md) | Reply to a specific message (quote snippet, reply bar, jump-to-original) in user DMs + admin moderator chat |

## Index — 2026-06-05

| Doc | Topic |
|-----|--------|
| [notification-ws-resilience.md](./2026-06-05_notification-ws-resilience.md) | Fix bell notifications (hype/comment/vote) "sometimes not coming" — WS reconnect + refetch on (re)connect/visibility |
| [vote-tie-no-dim.md](./2026-06-05_vote-tie-no-dim.md) | Don't dim compare options on a tie — tie-aware winner predicates (both share top = both win) |

## Backend (CTrend repo)

- `messages/message.schema.ts` — `ReplyPreview` embedded doc + `replyTo` on `Message`
- `messages/graphql/message.types.ts` — `MessageReplyPreviewGql` + `replyTo` on `MessageGql`
- `messages/messages.service.ts` — `buildReplySnapshot`, `replyPreviewToGql`, `replyToId` through `sendMessage` / `sendModeratorMessage(s)`, `replyTo` in `messageToGql`
- `messages/messages.resolver.ts` — `replyToId` arg on the three send mutations

## Web (this repo)

- `graphql/messages.ts` — `replyTo` selection + `$replyToId` on `SEND_MESSAGE`
- `graphql/admin.ts` — `replyTo` on thread/subscription messages + `$replyToId` on `SEND_MODERATOR_MESSAGES`
- `context/MessengerContext.tsx` — `ReplyPreview` type, `replyTo` on `Message`, `sendMessage(..., replyToId)`
- `components/MessengerPanel.tsx` — standalone reply arrow beside each bubble (not in the emoji tray), quoted bubble, composer reply bar, jump-to-original
- `pages/AdminMessagesTab.tsx` — reply UX for admin moderator chat (per-row hover reply button)
- `index.css` — side reply action (`cw-bubble-line` / `cw-reply-action`), quoted snippet, reply bar, and flash-highlight styles (`cw-*` + `admin-mod-*`)
- `context/NotificationContext.tsx` — WS reconnect + refetch-on-(re)connect/visibility so the bell doesn't miss real-time hype/comment/vote notifications
- `components/FeedPostCard.tsx` — tie-aware winner predicates so equal-percentage compare options don't dim on a tie
