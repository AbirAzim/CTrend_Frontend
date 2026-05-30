# Safari Sound, Voting-End Toggle, Typeable Time Inputs, Realtime Polling Fallback

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/CreatePostPage.tsx`
- `src/pages/FeedPage.tsx`
- `src/pages/ScheduledPostsPage.tsx`
- `src/context/NotificationContext.tsx`
- `src/lib/notificationSound.ts`
- `src/index.css`

## What changed

### 1. Safari sound — Web Audio rewritten for Safari quirks
Safari has two long-standing quirks that silently kill sounds generated with the existing code:

- **`exponentialRampToValueAtTime(0.001, ...)`** — Safari's WebKit implementation occasionally returns no audible output when the target value is near zero. This was used in 6 places across `playMessageSound`, `playNotificationChime`, and `playVoteSound`. Replaced all with `linearRampToValueAtTime(0, ...)`.
- **Strict AudioContext unlock** — Safari requires the AudioContext to be touched (not just created) inside a user gesture. The warm-up handler now plays a 10ms silent oscillator on the **first** user gesture per session (`_unlocked` flag). This fully unlocks the audio output so later subscription-triggered sounds play reliably.
- **`runningCtx()` race timeout** — On Safari, if `ctx.resume()` is called outside a gesture, it can hang indefinitely. The new code races `resume()` against a 200ms timeout so sounds never block the rendering loop, and returns `null` if the context still isn't running after that.

Both vote sound and notification chime now play reliably in Safari.

### 2. Voting deadline — optional toggle with required date when enabled
The deadline used to be just a date picker labeled "optional" but never enforced any rule. New UX:

- New `votingEndEnabled` state (default `false`) drives a polished iOS-style toggle pill (`ig-toggle-switch`).
- When OFF: no deadline sent, post stays "voting always open".
- When ON: the date picker reveals. Validation now requires the user to pick a date AND it must be in the future. Submission is blocked otherwise with a clear error.
- Toggling OFF clears the date so a stale value doesn't leak through.

CSS adds `.ig-voting-toggle`, `.ig-toggle-switch-wrap`, `.ig-toggle-switch` — pill background uses gradient when active and slides a white knob with a soft shadow.

### 3. Typeable hour/minute inputs in DateTimePicker
Replaced the scrolling `<select>` dropdowns (12 hour options, 60 minute options) with `<input type="text" inputMode="numeric">` fields:

- `maxLength={2}`, `pattern="[0-9]*"`, `inputMode="numeric"` — mobile keypads show numeric only
- `onFocus={(e) => e.target.select()}` — clicking the field selects the current value so the next keystroke replaces it
- Hour clamped to 1–12 on the fly; minute clamped to 0–59
- AM/PM is now a single toggle button (`.ig-dtp-ampm-btn`) instead of a select — one tap to flip
- Both inputs use `font-variant-numeric: tabular-nums` for clean fixed-width digit rendering
- Dark mode override included

### 4. Realtime fallback via polling
**Real cause**: `useSubscription` over WebSocket fails silently in several scenarios — Safari background tab kills idle WS, mobile network handoffs drop the connection, proxies / corporate firewalls block WS upgrades. The bell + feed + scheduled list looked "broken" but the subscription was simply not delivering.

**Fix**: added Apollo `pollInterval` fallbacks to the three queries that drive realtime feeling:

| Query | Before | After | Why |
|---|---|---|---|
| `FEED_POSTS` (feed) | no poll | 20 s | new posts always appear within 20 s even if WS fails |
| `MY_NOTIFICATIONS` (bell) | no poll | 25 s | new notifications always arrive within 25 s |
| `MY_SCHEDULED_POSTS` (/profile/scheduled) | 30 s | 10 s | publishing happens on the minute; tighter poll catches it fast |

The subscription handlers still fire instantly when WS works (chime sound, immediate render). Polling is the safety net.

## Mobile implementation instructions

### Sound
React Native's `expo-av` doesn't have the same Web Audio quirks, so the changes here are web-only. Mobile already uses `Audio.Sound.playAsync` with prebuilt asset files — no port needed.

### Voting-end toggle
Mirror the toggle pattern with a `<Switch>` and conditionally render the date picker. Backend already accepts `votingEndsAt` as optional.

### Typeable time inputs
React Native uses native time pickers, which are typeable by default. No port needed.

### Polling fallback
Add `pollInterval` to the same queries on mobile. Especially important on cellular networks where WS subscriptions are unreliable.

## Notes / gotchas
- **Scheduled post "showed me nothing here"** — the 10 s poll now catches the post within 10 s of creation. If a post genuinely never shows up, it's almost certainly because the cron promoted it to PUBLISHED before the user navigated to the scheduled page (publish cron runs every minute). To force a longer guaranteed schedule window, increase the minimum future buffer in `parseFutureDate` (currently the only check is `> Date.now()` — no minimum buffer).
- **No backend changes** were necessary. The user explicitly said "utilize backend when necessary dont do anything silly which will impact the performance later" — adding polls at 10–25 s intervals is cheap (a few extra GET-equivalents per minute per session) and uses the existing query infrastructure. No new endpoints, no new schema fields.
- **Toggle UI accessibility** — the `<input type="checkbox">` is the actual control (screen readers see it as a switch); the visual `<span>` is purely decorative with `aria-hidden`.
- **`_unlocked` flag** in notificationSound.ts persists for the lifetime of the page. On reload, it resets — and the next user gesture re-unlocks. This is correct: each navigation is a fresh audio session in Safari's model.
