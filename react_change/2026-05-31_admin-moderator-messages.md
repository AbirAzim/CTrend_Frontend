# Admin Moderator Messages

**Date:** 2026-05-31  
**Web files changed:**
- `src/pages/AdminPage.tsx` — Admins tab filters; Admin Messages tab entry
- `src/pages/AdminMessagesTab.tsx` — new chat-style moderator messaging UI
- `src/graphql/admin.ts` — moderator queries/mutations
- `src/components/NotificationBell.tsx` — open Moderator chat from bell
- `src/components/MessengerPanel.tsx` — pinned Moderator thread for users
- `src/context/MessengerContext.tsx` — refetch on new moderator message
- `src/index.css` — admin messages + moderator messenger styles

**Backend (CTrend repo):**
- `src/messages/messages.service.ts` — moderator threads, bulk send, images, bell notifications
- `src/messages/messages.resolver.ts` — admin GraphQL API
- `src/messages/message.schema.ts` — `sentByAdminId`, `isModeratorMessage`
- `src/messages/conversation.schema.ts` — `moderator` conversation type
- `src/messages/moderator.constants.ts` — virtual Moderator identity (no dummy User row)

## What changed on web

Admins send platform messages as **Moderator** (app logo + name). Users never see the admin's personal account. Admins see who sent each message on hover (`via Admin Name`).

### Admin Messages tab
- **Chat layout:** thread list (left) + live conversation (right)
- **Multi-recipient:** checkbox user picker + chips; one send → many users
- **Images:** attach via 📷 (same `/uploads/image` flow as posts/messenger)
- **Realtime:** thread list polls every 4s; active chat polls every 2.5s
- **Message log:** optional collapsible audit table with admin attribution

### Admin Management tab
- Same toolbar as Users: search, search-in, status, sort, order, reset
- Status + Joined columns added

### User experience
- Messenger shows pinned **Moderator** thread with logo
- Bell notification (`MESSAGE` type) when Moderator messages user — tap opens chat

## Mobile implementation instructions

1. Add GraphQL operations: `sendModeratorMessages`, `adminModeratorThreads`, `adminModeratorThreadMessages`, `adminModeratorMessages`.
2. Admin screen: two-pane layout (thread list + chat composer with image picker + multi-select recipients).
3. User messenger: show `type === "moderator"` conversation with app logo avatar and title "Moderator".
4. Notifications: handle `referenceType === "moderator_conversation"` → navigate to chat screen with `referenceId` as conversation id.
5. Do **not** create a dummy Moderator user in Mongo — use virtual sender id `"moderator"` from API.

## Relevant web mutations

```graphql
mutation SendModeratorMessages($userIds: [ID!]!, $text: String!, $imageUrl: String) {
  sendModeratorMessages(userIds: $userIds, text: $text, imageUrl: $imageUrl) {
    id
    recipientUserId
    sentByAdminName
    imageUrl
  }
}
```

## Notes / gotchas

- Backend must be restarted after pulling message schema changes.
- Moderator sender uses sentinel ObjectId `000000000000000000000001` in DB — not a User document.
- Admin personal DM from user rows was replaced: message icon opens **Admin Messages** tab with user pre-selected.
- User replies in moderator thread use normal `sendMessage`; admin sees them via thread polling (admin is not a conversation participant).
