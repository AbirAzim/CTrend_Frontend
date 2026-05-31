# Admin Moderator Messages

**Date:** 2026-05-31  
**Web files changed:**
- `src/pages/AdminPage.tsx` — Admins tab filters; Admin Messages tab entry
- `src/pages/AdminMessagesTab.tsx` — chat-style moderator messaging UI; `role: "member"` recipient picker
- `src/graphql/admin.ts` — moderator queries/mutations/subscription
- `src/lib/moderatorBrand.ts` — **Ke Jitbe Moderator** display name constants
- `src/components/NotificationBell.tsx` — official admin message styling + open chat from bell
- `src/components/MessengerPanel.tsx` — pinned Ke Jitbe Moderator thread; amber official bubble styling
- `src/context/MessengerContext.tsx` — refetch + stub on new moderator message
- `src/index.css` — admin messages + moderator messenger + notification styles

**Backend (CTrend repo):**
- `src/messages/messages.service.ts` — moderator threads, bulk send, images, bell notifications, admin unread
- `src/messages/messages.resolver.ts` — admin GraphQL API + `adminModeratorUserMessage` subscription
- `src/messages/message.schema.ts` — `sentByAdminId`, `isModeratorMessage`
- `src/messages/conversation.schema.ts` — `moderator` conversation type
- `src/messages/moderator.constants.ts` — virtual identity; `MODERATOR_DISPLAY_NAME = "Ke Jitbe Moderator"`
- `src/users/users.service.ts` — `listUsers(role: "member")` for recipient picker

## What changed on web

Admins send platform messages as **Ke Jitbe Moderator** (app logo + name). Users never see the admin's personal account. Admins see who sent each message on hover (`via Admin Name`).

### Admin Messages tab
- **Recipients:** `listUsers(role: "member")` — anyone with **user** role (regular users + admin+user dual-role accounts). Pure-admin-only accounts are excluded.
- **Chat layout:** thread list (left) + live conversation (right)
- **Multi-recipient:** checkbox user picker + chips; one send → many users
- **Images:** attach via 📷 (same `/uploads/image` flow as posts/messenger)
- **Realtime:** `adminModeratorUserMessage` subscription; fallback polling 10–15s
- **Unread:** purple badge on threads when user replies; clears when admin opens thread
- **Message log:** optional collapsible audit table with admin attribution

### User experience
- Messenger shows pinned **Ke Jitbe Moderator** thread with logo + **Official** tag
- Moderator bubbles use **amber/gold** styling (not gray user DMs)
- Banner + label: `Official · Ke Jitbe Moderator`
- Bell: **Official admin message** with 🛡 icon, **Important** chip, amber highlight — tap opens chat

## Mobile implementation instructions

1. Add shared constant `MODERATOR_BRAND_NAME = "Ke Jitbe Moderator"`.
2. Admin recipient search: `listUsers(role: "member")` — not pure `"user"` (that excludes dual-role admins).
3. User messenger: `type === "moderator"` → logo avatar, amber bubbles, title **Ke Jitbe Moderator**.
4. Notifications: `referenceType === "moderator_conversation"` → navigate to chat; show **Official admin message** styling.
5. Do **not** create a dummy Moderator user in Mongo — virtual sender id `"moderator"` from API.

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

- Backend must be restarted after pulling message/user schema changes.
- Moderator sender uses sentinel ObjectId `000000000000000000000001` in DB — not a User document.
- `role: "user"` in listUsers = **pure users only** (excludes admin+user dual-role). Use `role: "member"` for moderator recipients.
- `listUsers(role: "member")` excludes **pure-admin-only** accounts; includes regular users + admin+user dual-role. Legacy promoted admins missing `user` in `roles[]` are auto-repaired on first member list fetch.
- `promoteToAdmin` must `$addToSet` both `user` and `admin` in `roles[]` so dual-role accounts appear in member picker.
- Admin personal DM from user rows opens **Admin Messages** tab with user pre-selected.
