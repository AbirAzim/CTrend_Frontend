# Backend: Multi-emoji reactions on posts

**Status: implemented** in `~/Documents/code/CTrend` (sibling backend repo) —
`src/posts/post-emoji-reaction.schema.ts`, `post-reaction-emoji.constants.ts`,
`graphql/post.types.ts` (`PostReactionCountGql`/`PostReactionSummaryGql`/`PostHyperGql`),
`posts.service.ts` (`setPostReaction`, `reactionCountsForPost`, `listHypers`),
`posts.resolver.ts` (`setPostReaction` mutation, `hypersByPost` now returns
`PostHyperGql`). Build + lint pass; not yet deployed. Rest of this doc is the
spec that guided the implementation, kept for reference.

Frontend is extending the existing single "Hype" (❤️) toggle on posts into a
full 6-emoji reaction system — the same model already implemented for
comments (`setCommentReaction`, `CommentGql.reactions` / `viewerReaction`).
This doc specifies the equivalent for posts.

**This is purely additive.** Nothing existing changes shape or behavior;
old app builds that only know about `setPostHype` / `hypeCount` /
`viewerHasHyped` must keep working unmodified.

## Emoji set

Same 6 emojis already used for comments, for visual consistency:

```
👍 ❤️ 😂 😮 😢 🔥
```

Default/quick-react emoji is `❤️` (matches the current heart icon so a
plain "hype" tap keeps behaving the way it does today).

## GraphQL — new types

```graphql
type PostReactionCountGql {
  emoji: String!
  count: Int!
}

type PostReactionSummaryGql {
  postId: ID!
  reactions: [PostReactionCountGql!]!
  viewerReaction: String
}
```

## GraphQL — extend `Post` / `PostGql`

```graphql
type PostGql {
  # ...existing fields...
  reactions: [PostReactionCountGql!]!
  viewerReaction: String   # emoji the current viewer reacted with, or null

  # Unchanged, now computed (see "Backward compatibility" below):
  hypeCount: Int!
  viewerHasHyped: Boolean!
}
```

Add `reactions` + `viewerReaction` to every query that already returns
posts: `feedPosts`, `getPostById`, `mySavedPosts`, `myScheduledPosts` (any
resolver currently selecting `hypeCount`/`viewerHasHyped`).

## GraphQL — new mutation

```graphql
setPostReaction(postId: ID!, emoji: String): PostReactionSummaryGql!
```

- `emoji` is one of the 6 emojis above, or `null` to clear the viewer's
  reaction.
- One reaction per user per post (setting a new emoji replaces the old
  one — it does not add a second reaction row).
- Returns the updated summary only (not the full post), matching the lean
  style of `votePost` — posts are heavy, no need to round-trip the whole
  object.
- Requires auth, same as `setPostHype`.

Keep `setPostHype(postId: ID!, active: Boolean!): Boolean!` exactly as it
works today, for old clients. Internally it can just be sugar for
`setPostReaction(postId, active ? "❤️" : null)`.

## Backward compatibility (`hypeCount` / `viewerHasHyped`)

These become **computed fields**, no longer their own storage:

- `hypeCount` = sum of `reactions[].count` (i.e. total reactions of any
  emoji, not just ❤️).
- `viewerHasHyped` = `viewerReaction != null`.

This means an old app build that only reads `hypeCount`/`viewerHasHyped`
keeps seeing correct-looking numbers even for posts that were reacted to
with non-heart emojis — it just can't distinguish which emoji was used.

## Reactor list — extend `hypersByPost`

No new query. Add one optional field to the existing row type so the
"Hyped by" list can show which emoji each person used:

```graphql
type PostHyperGql {
  # ...existing fields (user, etc.)...
  reactionEmoji: String   # the emoji this user reacted with
}
```

`hypersByPost(postId, search, skip, take)` keeps its current name/args and
keeps returning **everyone who has any reaction** (not just ❤️) — same
"anyone who hyped" semantics as today, just now sourced from the reactions
table instead of a boolean-hype table.

## Coins & notifications

Same trigger rule as today's hype, generalized from a boolean flip to a
`previousEmoji → nextEmoji` transition:

| Transition | Effect |
|---|---|
| `null → any emoji` | Award `HYPE` coins to the reactor; fire `POST_HYPED` coin/notification to the post author (same as today's "hype on") |
| `any emoji → null` | Reverse both of the above (same as today's "hype off") |
| `emoji A → emoji B` (switching, never null in between) | **No coin/notification effect** — it's a no-op for the economy, only the stored emoji changes |

This exactly matches the symmetric award/reverse logic the frontend
already runs client-side for hype; do not award coins again on every emoji
switch or double-count anything.

## Migration

Existing hype rows (wherever hype is currently stored — a boolean/flag
table or a `hypeCount`/`viewerHasHyped` column) should be backfilled into
the reactions table as `❤️` reactions, so `hypeCount` stays numerically
identical for existing posts after the migration ships.
