# Phase 2 — Comment UX: Enter-to-post + newest comment on top

**Date:** 2026-06-01
**Web files changed:**
- `src/components/PostCommentsPanel.tsx`

## What changed on web (confirmed)

1. **Enter posts a comment (#4).** The top-level comment box and the reply box are
   `<textarea>`s. They now submit on **Enter**, with **Shift+Enter** inserting a
   newline. The "Post" / "Reply" buttons still work. Placeholders hint "(Enter to
   post)". Implemented by extracting the submit into a no-arg `submitTopComment()`
   and adding an `onKeyDown` handler (mirrors the chat input in `MessengerPanel`).
2. **Newest comment on top (#9).** `buildThreads` now sorts **top-level comments
   newest-first** by `createdAt`, while **replies stay oldest-first** (chronological
   within a thread). Sorting by timestamp means the optimistic new comment (stamped
   "now") jumps to the top immediately and stays there after the server confirms.
   Local/demo comments already prepend, so they're consistent.

No backend changes.

## Mobile implementation instructions (React Native)

1. **Enter-to-post:** RN `TextInput` doesn't have Shift+Enter semantics like the web.
   Options:
   - Single-line intent: set `returnKeyType="send"` + `onSubmitEditing={submit}` and
     `blurOnSubmit={false}`. This is the cleanest mobile pattern (the keyboard's
     "send"/return key posts).
   - If you keep it multiline (`multiline`), the return key inserts a newline by
     default; in that case keep the explicit **Post button** as the primary submit
     and don't try to hijack Enter. Recommended: a single-line input with a send key
     **plus** a visible send button.
   - Factor the submit into a no-arg function (as on web) so both the send key and
     the button call it.
2. **Newest comment on top:** sort the top-level comment list **newest-first** by
   `createdAt`; keep replies **oldest-first**. If you use a `FlatList`, either sort
   the data and render top-down, or use `inverted` — but the simplest is to sort the
   `data` array (top-level desc, replies asc) and render normally.

## Relevant web code snippets

```tsx
// Extracted submit + Enter handling (PostCommentsPanel.tsx)
function submitTopComment() { /* validate, optimistic add, mutate */ }
function onSubmitTopComment(e: React.FormEvent) { e.preventDefault(); submitTopComment(); }

<textarea
  value={commentDraft}
  onChange={(e) => setCommentDraft(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitTopComment(); }
  }}
/>

// Ordering (buildThreads)
const createdAsc = (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
topLevel.sort((a, b) => -createdAsc(a, b));         // newest first
for (const list of repliesByParent.values()) list.sort(createdAsc); // replies oldest first
```

## Notes / gotchas

- The Shift+Enter = newline trick is web/desktop-keyboard specific. On a phone there's
  no Shift+Enter; use the return-key/send-button split described above.
- Keep the optimistic-comment timestamp = "now" so it sorts to the top with no extra
  logic.
