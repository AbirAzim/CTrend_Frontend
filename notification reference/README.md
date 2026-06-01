# Message notification references (Android)

Visual targets for Notifee `AndroidStyle.MESSAGING` on Ke Jitbe mobile.

| File | What it shows |
|------|----------------|
| `whatsapp-notification-reference.png` | **Target (simple DM)** — sender avatar (left), name + message, action buttons (Reply / Mark as read / Mute). |
| `messenger-notification-reference.png` | **Target (rich thread)** — avatar with app badge, sender name, multi-line message body, Like / Reply actions. |
| `ke-jitbe-notification-current.png` | **Current app behavior** — app name in header instead of conversation title; avatar placement differs from WhatsApp/Messenger. |

## Implementation notes (`mobile/lib/messageNotifications.ts`)

- Use stable notification id per conversation: `msg_${conversationId}` (update, don’t stack duplicates).
- `AndroidStyle.MESSAGING`: `person` (name + HTTPS avatar), `messages[]` with timestamps.
- Header should read like a conversation (sender / thread), not only “Ke Jitbe”.
- Optional later: Reply action with `RemoteInput`, Mark read / Mute actions (WhatsApp-style).
