# Bell notifications "sometimes don't come" — WebSocket resilience

**Date:** 2026-06-05
**Web files changed:**
- `src/context/NotificationContext.tsx` — add WS reconnect + refetch-on-(re)connect + refetch-on-visibility

**Backend files changed (CTrend):**
- _None._ Investigated `notifications.service.ts`, `notifications.resolver.ts`, `pubsub.ts`, `posts.service.ts`, `comments.service.ts` — creation/publish path is correct. The fix is client-side delivery resilience. (See "Backend follow-ups" below for things to verify, not yet changed.)

## What changed

Hype / comment / comment-reply / comment-reaction / vote notifications are delivered
in real time only over the `newNotification` **WebSocket subscription**. The bell
context (`NotificationContext`) was missing the socket-resilience that
`MessengerContext` already has — which is why **messages/presence were reliable but
the bell intermittently missed events**.

Three gaps, all now closed by mirroring `MessengerContext`:

1. **Stale-auth socket** — if the WS connected before login (no/old token), the
   backend subscription filter `userId === payload.recipientId` reads an undefined
   user and **silently drops every notification** on that socket. → Now we call
   `reconnectWs()` on auth to force a fresh authenticated connection.
2. **Reconnect gap** — `graphql-ws` retries forever, but the in-process `PubSub`
   has no replay, so anything fired during a disconnect is **lost** (only the 25s
   poll recovered it, silently / no chime → felt like it never arrived). → Now we
   `refetch()` on every `onWsConnected`.
3. **Backgrounded tab** (mobile Safari especially) waited up to 25s. → Now we
   `refetch()` on `visibilitychange` → visible.

The 25s poll fallback stays as a safety net; these changes make recovery happen on
reconnect/foreground instead of up to 25s later (or never, in the stale-auth case).

## Code

`NotificationContext` now runs (when authenticated):

```ts
useEffect(() => {
  if (!isAuthenticated) return;
  reconnectWs();                                   // fresh authenticated WS
  const unsubWs = onWsConnected(() => void refetch()); // recover missed events
  const onVis = () => {
    if (document.visibilityState === "visible") void refetch();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => { unsubWs(); document.removeEventListener("visibilitychange", onVis); };
}, [isAuthenticated, refetch]);
```

`reconnectWs` / `onWsConnected` are the existing helpers from `src/lib/apolloClient.ts`.

## Manual test

1. Log in on tab A. From another account, hype a post / comment on a post owned by A
   → A's bell updates instantly with a chime.
2. Background tab A for a minute, trigger a hype/comment, refocus → bell refreshes
   immediately on focus, not after the poll.
3. Kill the network briefly (devtools offline → online) while a hype is sent → on
   reconnect the bell refetches and shows it.
4. `npm run lint` (0 errors) + `npm run build` pass.

## Backend follow-ups (verify — not changed)

- **Multiple backend instances:** `pubsub.ts` uses an in-process
  `graphql-subscriptions` PubSub. If the API runs clustered (PM2 cluster / multiple
  pods), a notification published on instance A never reaches a subscriber on
  instance B — intermittent loss the poll masks. Needs a shared transport
  (e.g. `graphql-redis-subscriptions`) if scaling horizontally.
- **Comment-notify swallows errors** (`comments.service.ts` `catch {}`) —
  intentional so a comment never fails, but a notification error there is invisible.

## Mobile app

<!-- Native UI may differ; port data model + API first. -->
The native client relies on FCM data pushes (`sendBellPush`) rather than the WS
subscription, so this web-only fix doesn't apply directly — but the same
"refetch on app foreground / socket reconnect" principle is worth confirming there.
