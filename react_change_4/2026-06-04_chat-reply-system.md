# Messenger-style reply (quote) in user chat & admin moderator chat

**Date:** 2026-06-04
**Web files changed:**
- `src/graphql/messages.ts` — `replyTo` selection on message ops + `$replyToId` on `SEND_MESSAGE`
- `src/graphql/admin.ts` — `replyTo` on thread/subscription messages + `$replyToId` on `SEND_MODERATOR_MESSAGES`
- `src/context/MessengerContext.tsx` — `ReplyPreview` type, `replyTo` on `Message`, `sendMessage(..., replyToId)`
- `src/components/MessengerPanel.tsx` — standalone reply action beside each bubble (`cw-bubble-line` row), quoted bubble preview, composer reply bar, jump-to-original
- `src/pages/AdminMessagesTab.tsx` — same reply UX for the admin moderator chat (per-row hover reply button)
- `src/index.css` — `cw-bubble-line` / `cw-reply-action` (side reply arrow) + `cw-quoted` / `cw-reply-bar` / `admin-mod-quoted` / `admin-mod-reply-bar` styles + flash highlight

**Backend files changed (CTrend):**
- `src/messages/message.schema.ts` — `ReplyPreview` embedded doc + `replyTo` prop on `Message`
- `src/messages/graphql/message.types.ts` — `MessageReplyPreviewGql` + `replyTo` field on `MessageGql`
- `src/messages/messages.service.ts` — `buildReplySnapshot`, `replyPreviewToGql`, `replyToId` threaded through `sendMessage` / `sendModeratorMessage(s)`, `replyTo` mapped in `messageToGql`
- `src/messages/messages.resolver.ts` — `replyToId` arg on `sendMessage` / `sendModeratorMessage` / `sendModeratorMessages`

## What changed

Users (and admins as the moderator brand) can now **reply to a specific message**,
Messenger-style:

- Hover any message → a standalone **reply** (↩) arrow appears **beside the bubble**
  (separate from the emoji reaction tray), Messenger-style — on the inner side
  (left of your own bubbles, right of theirs). On touch it reveals with the
  long-press action tray. The admin chat shows a reply button on each row hover.
- Picking a message opens a **reply preview bar** above the composer ("Replying to
  …") with a cancel button; the composer auto-focuses.
- The sent message renders a **quoted snippet** (sender name + text/📷 thumbnail)
  inside the bubble.
- Tapping a quoted snippet **scrolls to the original** message and flashes it.

The quoted message is stored as a **denormalised snapshot** (`replyTo`) on the new
message at send time, so the preview is cheap to render and stays stable if the
original is later removed. Moderator parents quote as `Ke Jitbe Moderator`
(`senderId: "moderator"`); user parents resolve the user's display name.

A quoted reply is only applied to a **single-thread** send — multi-recipient
moderator broadcasts drop `replyToId` (frontend guard + backend guard in
`sendModeratorMessages`) so a quote can never leak into a stranger's conversation.
`buildReplySnapshot` validates the parent belongs to the same conversation.

## GraphQL

New nullable field on `MessageGql`:

```graphql
type MessageReplyPreview {
  messageId: ID!
  senderId: ID!     # "moderator" or user hex
  senderName: String!
  text: String!
  imageUrl: String
}

type Message {
  # …existing fields…
  replyTo: MessageReplyPreview
}
```

New optional arg on the send mutations:

```graphql
sendMessage(conversationId: ID!, text: String!, imageUrl: String, replyToId: ID): Message!
sendModeratorMessage(userId: ID!, text: String!, imageUrl: String, replyToId: ID): ModeratorMessageAdmin!
sendModeratorMessages(userIds: [ID!]!, text: String!, imageUrl: String, replyToId: ID): [ModeratorMessageAdmin!]!
```

Backward compatible: `replyToId` omitted → `replyTo` is `null` (plain message).

## Manual test

1. **User ↔ user:** open a DM, hover a message, click reply, send → quoted snippet
   shows above the new bubble; tap it → scrolls/flashes the original.
2. **Reply to image / image reply:** quote shows "📷 Photo" + thumbnail; attach an
   image with a reply set → reply context survives the upload.
3. **Cancel reply:** the × on the reply bar clears it; switching threads clears it.
4. **Moderator thread (user side):** reply to an official message → admin receives it
   via `adminModeratorUserMessage` with `replyTo` populated.
5. **Admin chat:** open a thread, hover a bubble → reply, send → reply quote renders;
   verify a multi-recipient broadcast ignores any reply target.
6. `npm run lint` (0 errors), `npm run build`, and backend `npm run build` all pass.

## Mobile app

<!-- Native UI may differ; port data model + API first. -->
Data model + API are ready: the native client should request `replyTo { messageId
senderId senderName text imageUrl }` on messages and pass `replyToId` to
`sendMessage`. UI: long-press a bubble → "Reply" → quoted preview above the keyboard,
mirroring this web build.
