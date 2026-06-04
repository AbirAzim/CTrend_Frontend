# React Change Log 4 — Chat reply system

Continuation of `react_change_3/`. Tracks **Messenger-style reply (quote)** support
across the user chat and the admin moderator chat (web + backend).

Overall plan: [`../PHASES.md`](../PHASES.md).

## Workflow

1. Implement + verify on **web** and **CTrend backend**.
2. Add a dated entry here (use [`TEMPLATE.md`](./TEMPLATE.md)).
3. Deploy backend before frontend (new GraphQL field + mutation arg).

## Index — 2026-06-04

| Doc | Topic |
|-----|--------|
| [chat-reply-system.md](./2026-06-04_chat-reply-system.md) | Reply to a specific message (quote snippet, reply bar, jump-to-original) in user DMs + admin moderator chat |

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
