# Comment Replies, Emoji Reactions & Comment Notifications

**Date:** 2026-05-31
**Web files changed:**
- `src/components/PostCommentsPanel.tsx` (new)
- `src/components/FeedPostCard.tsx`
- `src/components/NotificationBell.tsx`
- `src/context/NotificationContext.tsx`
- `src/graphql/comments.ts`
- `src/graphql/notifications.ts`
- `src/index.css`

**Backend files changed:**
- `src/comments/comment-reaction.constants.ts` (new)
- `src/comments/comment-reaction.schema.ts` (new)
- `src/comments/comments.service.ts`
- `src/comments/comments.resolver.ts`
- `src/comments/comments.module.ts`
- `src/comments/graphql/comment.types.ts`
- `src/notifications/notification.schema.ts`
- `src/notifications/notifications.service.ts`
- `src/notifications/graphql/notification.types.ts`

## What changed on web

### Comment UX (Feed card + post detail)
- New shared **`PostCommentsPanel`** used inside `FeedPostCard` (feed + `/post/:id`).
- **1-level replies**: Reply button only on top-level comments; replies render nested inline under the parent.
- **Emoji reactions** (one per user, toggle/switch): 👍 ❤️ 😂 😮 😢 🔥 via `setCommentReaction`.
- **Avatars**: `profileImageUrl` when present; otherwise ui-avatars fallback + initial letter (same pattern as profile connections).
- Author name/avatar links to `/profile/:id`.

### Notifications (bell + sound)
Three comment-related notification types (all in bell, chime on subscription):
| Type | Recipient | When |
|------|-----------|------|
| `POST_COMMENT` | Post owner | Someone adds a **top-level** comment |
| `COMMENT_REPLY` | Parent comment author | Someone replies to their comment |
| `COMMENT_REACTION` | Comment author | Someone reacts to their comment |

Grouped body examples: `"Anjon replied to your comment"`, `"Anjon and 2 more reacted 👍 to your comment"`.

Bell navigation: prefer `postId` → `/post/:postId` (works for comment reply/reaction deep links).

## Mobile implementation instructions

1. **GraphQL — comments**
   - Extend `commentsByPost` selection: `parentId`, `reactions { emoji count }`, `viewerReaction`, `author.profileImageUrl`.
   - `commentPost` input supports optional `parentId` (reply to top-level only — backend rejects nested replies).
   - Add mutation `setCommentReaction(commentId, emoji)` — pass `null` to remove reaction.

2. **Thread UI**
   - Build threads: top-level comments + `parentId` replies nested under parent.
   - Show reply composer inline under the parent when user taps Reply.
   - Do **not** show Reply on reply rows (1-level max).

3. **Reactions**
   - Allowed emojis: `["👍","❤️","😂","😮","😢","🔥"]`.
   - One reaction per user per comment; tapping same emoji removes it; tapping another switches.

4. **Avatars**
   - Use `normalizeProfileImageUrl(profileImageUrl)`; fallback `https://ui-avatars.com/api/?name=...&background=312e81&color=ffffff`.

5. **Notifications**
   - Query/subscription: add `postId` field.
   - Handle types `COMMENT_REPLY`, `COMMENT_REACTION` (icons: ↩️, 😊).
   - On tap: `navigation.navigate('PostDetail', { postId: n.postId ?? n.referenceId })`.

6. **Reuse**
   - Same panel on feed card expand and post detail screen (web uses one component in `FeedPostCard`).

## Relevant web code snippets

```tsx
// Reply submit
await commentPost({ variables: { postId, input: { content: text, parentId } } });

// Reaction toggle
await setCommentReaction({
  variables: { commentId, emoji: viewerReaction === emoji ? null : emoji },
});
```

## Notes / gotchas

- **Self-notifications**: backend skips when actor === recipient.
- **`POST_COMMENT` vs reply**: replying notifies the **comment author** (`COMMENT_REPLY`), not a second `POST_COMMENT` to the post owner.
- **`setCommentLike`** still works (maps to ❤️) but prefer `setCommentReaction`.
- Post detail page uses the same `FeedPostCard` — no separate comment UI needed on web.
- Sound: existing `playNotificationChime()` fires for all non-`MESSAGE` bell notifications.
