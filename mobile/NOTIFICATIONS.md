# Push Notifications — chat Reply / 👍 Like actions

## How chat notifications are rendered

| App state | Renderer | Action buttons (Reply / 👍 Like) |
|---|---|---|
| **Foreground** (open, not viewing that chat) | Notifee, via the GraphQL `messageReceived` subscription (`GlobalMessageSubscription` in `app/_layout.tsx`) → `postOrUpdateMessageNotification` | ✅ |
| **Background / terminated** | Notifee, via the background notification task (`expo-task-manager` + `Notifications.registerTaskAsync`, task id `ctrend-background-notification` in `app/_layout.tsx`) → `displayMessageNotificationFromData` → `postOrUpdateMessageNotification` | ✅ **only if the push is DATA-ONLY (see below)** |

Action handling (tapping Reply/Like) is done by `notifee.onBackgroundEvent` / `onForegroundEvent`:
- **Reply** → `handleInlineReply` → `SEND_MESSAGE`
- **👍 Like** → `handleLikeAction` → `REACT_MESSAGE` with emoji `👍` (needs `messageId`)

## ⚠️ Backend requirement for background/killed notifications

The background task only runs for **DATA-ONLY** FCM messages (Android "headless" delivery).
A push that includes a top-level `notification` object is displayed by the OS directly and
**bypasses all app code**, so no action buttons can be added.

### Required FCM payload for chat messages

```jsonc
{
  "token": "<device FCM token>",          // registered via getDevicePushTokenAsync()
  "data": {                                // ✅ data-only — NO top-level "notification"
    "type": "MESSAGE",
    "conversationId": "<conversationId>",
    "messageId": "<messageId>",            // required for 👍 Like to target the message
    "senderName": "<sender display name>",
    "senderAvatar": "<https avatar url or empty string>",
    "body": "<message text>"               // "text" or "message" also accepted
  },
  "android": { "priority": "high" }        // required for prompt headless delivery
}
```

Rules:
- **No `notification` field** anywhere in the message — its presence makes Android auto-display it and skip the app.
- All FCM data values must be **strings** (FCM requirement).
- The app also accepts the same fields packed as a JSON string under `data.dataString`.

Non-chat ("bell") notifications (likes, comments, follows, votes) can stay as
`notification`-type messages — they don't use action buttons.

## Field reference (consumed by `displayMessageNotificationFromData`)

| Field | Required | Purpose |
|---|---|---|
| `type` | yes (`"MESSAGE"`) | discriminator; task ignores anything else |
| `conversationId` | yes | notification grouping + tap navigation + Reply target |
| `messageId` | for Like | target message for the 👍 reaction |
| `senderName` | recommended | notification title (falls back to `title`, then "New message") |
| `senderAvatar` | optional | large icon (https only) |
| `body` | recommended | notification text (falls back to `text` / `message`) |
