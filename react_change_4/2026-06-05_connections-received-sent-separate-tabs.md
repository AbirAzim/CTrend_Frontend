# Connections — separate Received and Sent tabs (not one Requests tab)

**Date:** 2026-06-05

## User requirement (must be clear)

> There should be **two different tabs** for friend requests:
> 1. Requests **sent to me** (incoming — others asked to be my friend)
> 2. Requests **I sent** (outgoing — I asked others)
>
> They must **not** both live inside a single **Requests** tab with **INCOMING** / **SENT** section headers on the same screen.

### Wrong (what we had before)

```
Friends | Requests | Suggestions
          └─ INCOMING  (Badhon… Accept/Reject)
          └─ SENT      (Imran… Pending/Cancel)   ← both visible in one tab
```

### Correct (what we ship now)

```
Friends | Received | Sent | Suggestions
          └─ only incoming rows
                    └─ only outgoing rows
```

- **Received** = GraphQL `friendRequests.requestedMe`
- **Sent** = GraphQL `friendRequests.requestedByMe`
- Each tab has its own badge count and empty state; search + pagination are per tab on profile.

## Web files changed

- `src/pages/ProfilePage.tsx` — Connections tab bar: replaced single **Requests** with **Received** + **Sent**; split panels; `incomingPage` / `sentPage` pagination
- `src/pages/FriendsPage.tsx` — top-level tabs: **My Friends | Received | Sent | Suggestions** (removed broken `requests` + `requestTab` subtabs)
- `src/index.css` — horizontal scroll for 4-tab bars; `cx-friends-tab-count--alert` for incoming badge

**Backend:** no schema change (existing `friendRequests` query).

## Behaviour

| Tab | Data | Actions |
|-----|------|---------|
| **Received** | `requestedMe` | Accept, Reject |
| **Sent** | `requestedByMe` | Cancel (Pending badge) |
| **Friends** | `myFriends` | Message, Unfriend |
| **Suggestions** | `friendSuggestions` | Add Friend |

`FriendsPage` still uses the animated view-model engine (optimistic pins, 8s poll) — see [friends-tabs-and-live-moves.md](./2026-06-05_friends-tabs-and-live-moves.md).

## Manual test

1. Profile → Connections: confirm **four** top tabs, not three with grouped sections.
2. Open **Received** — only incoming rows; no Sent block below.
3. Open **Sent** — only outgoing rows; no Incoming block above.
4. `/friends` page: same four-tab pattern; badge on Received when incoming count > 0.
5. Accept from Received → user moves to Friends (animated on Friends page).

## Mobile app

Mirror the same tab model: **do not** use one “Requests” screen with two scroll sections. Use two tabs (or two stack screens): **Received** and **Sent**.
