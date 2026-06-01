# Phase 5 — Messenger message reactions

**Date:** 2026-06-01  
**Status:** Web done · mobile port pending

---

## Behaviour

- **6 emojis:** 👍 ❤️ 😂 😮 😢 🔥 (same as comment reactions).
- **Desktop:** hover a bubble → quick-react bar above it.
- **Touch / right-click:** long-press (~480ms) or context menu opens the same bar.
- **Toggle:** tap same emoji again → remove (`emoji: null` mutation).
- **Strip:** aggregated counts show under the bubble; your emoji highlighted.
- **Live:** other participant sees updates via `messageReactionChanged` subscription.

---

## Backend (`CTrend`)

| File | Change |
|------|--------|
| `message-reaction.schema.ts` | `(messageId, userId)` unique |
| `message-reaction.constants.ts` | allowed emoji list |
| `messages.service.ts` | `reactMessage`, batch `reactions` / `viewerReaction` on queries |
| `messages.resolver.ts` | `reactMessage` mutation, `messageReactionChanged` sub |
| `graphql/message.types.ts` | `MessageReactionCountGql`, `MessageReactionChangedGql` |
| `pubsub.ts` | `MESSAGE_REACTION_CHANGED` |

**Restart backend** after deploy.

---

## Frontend (web)

| File | Change |
|------|--------|
| `src/graphql/messages.ts` | `reactions` / `viewerReaction` on queries; `REACT_MESSAGE`, `MESSAGE_REACTION_CHANGED` |
| `packages/shared/src/graphql/messages.ts` | same (for mobile) |
| `src/context/MessengerContext.tsx` | `reactMessage`, optimistic + sub merge |
| `src/components/MessengerPanel.tsx` | `MessageBubble` component |
| `src/index.css` | `.cw-bubble-wrap`, `.cw-bubble-quick-react`, `.cw-bubble-reactions` |

---

## Mobile port checklist

1. Copy GraphQL from `packages/shared/src/graphql/messages.ts`.
2. Extend messenger message type with `reactions`, `viewerReaction`.
3. Wire `reactMessage` + `MESSAGE_REACTION_CHANGED` in messenger provider.
4. Long-press bubble → emoji row; show reaction chips under bubble.

---

## QA

1. User A reacts 👍 on B's message → B sees strip update without refresh.
2. A taps 👍 again → reaction removed for both.
3. A switches to ❤️ → counts update correctly.
4. Works on image and text bubbles.
