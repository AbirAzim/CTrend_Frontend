# Phase 2 — Vote-bar/status layout + single-tap unvote (+ seamless switching)

**Date:** 2026-06-01
**Web files changed:**
- `src/components/FeedPostCard.tsx`, `src/components/IgIcons.tsx`,
  `src/graphql/feed.ts`, `src/index.css`
- Backend: `src/votes/votes.resolver.ts`, `src/votes/votes.service.ts`, `src/schema.gql`

These changes were NOT in the original Phase 2 plan — they emerged while testing
and are confirmed working on web.

## What changed on web (confirmed)

### A. Action bar + voting-status layout
- The old separate **"countdown + See details" header row** at the top of the post
  footer was removed. Everything is now one toolbar row.
- The **voting status / countdown** moved into the **"Vote anonymously"** row for
  open API compare posts: `[ 91D… LEFT ]  ·····  [ 👻 Vote anonymously ⚪ ]`
  (the row is now `justify-content: space-between`).
- For posts where that row doesn't render (closed posts, binary up/down posts,
  demo/local mode), the status badge falls back to the **left slot of the action
  toolbar**. Driven by one flag:
  `statusInAnonRow = voteMode === "api" && !isVotingClosed && Boolean(compareUrls)`.
- Action toolbar = status (only when not in the anon row) · **action icons** (center,
  wrap internally) · **See details** (right). The details panel expands below it.

### B. Single-tap unvote (withdraw) — frontend + backend
- **Before:** tapping the option you already chose was a no-op in API mode (you
  couldn't withdraw).
- **Now:** a single tap on your chosen option **withdraws** the vote — instant
  optimistic clear (count drops, vote sound, "unvoted" exit animation), then
  reconciled with the server.
- **Backend:** new **`removeVote(postId): VoteResultGql!`** mutation →
  `VotesService.removeVote(userId, postId)` deletes the user's vote, decrements
  `voteCount`, recomputes stats, and **publishes the same `VOTE_UPDATED` /
  `POST_VOTE_UPDATED` events as voting** — so other viewers see the unvote in real
  time exactly like a vote. Honors the "voting ended" guard.

### C. Seamless vote ↔ unvote switching (the important part)
- Vote and unvote now run through **one shared engine `processVoteIntent(targetIndex)`**
  (`targetIndex >= 0` votes that option, `< 0` withdraws). Both share the single
  in-flight queue (`pendingVoteRef`): if a mutation is in flight, the new intent
  (vote **or** unvote) is queued, and when the running mutation finishes the loop
  discards the stale result and fires the **latest** intent. So rapid
  vote → unvote → vote-other-side always converges on the last tap with no dropped
  taps or flicker.
- Fixed a `??` bug: `optimisticVote?.viewerVote ?? post.viewerVote` fell back to the
  stale post vote when the optimistic value was an explicit `null` (withdraw), so the
  UI ignored the unvote. Now: when an optimistic snapshot exists, **trust it fully**,
  including `null`.

## Mobile implementation instructions (React Native)

1. **Backend is shared** — call the new `removeVote(postId)` mutation for withdraw.
   Same `votePost` for voting. Both already drive real-time via subscriptions.
2. **Single-tap toggle:** on tapping an option, if it's the user's current pick →
   call `removeVote`; otherwise → `votePost(index)`. Apply the optimistic update
   first (clear pick + decrement, or move pick + inc/dec), then call the mutation.
3. **Port the unified engine.** Keep ONE in-flight guard + one "pending latest
   intent" slot shared by vote and unvote (an int where `-1` = withdraw). When a
   mutation resolves, if a newer intent is queued, fire it instead of applying the
   stale result. This is what makes switching feel seamless — don't give unvote its
   own separate in-flight path.
4. **Optimistic state must win over server props.** When you hold a local optimistic
   vote snapshot, render from it directly — including an explicit "no vote" — rather
   than coalescing `?? serverVote`. (This was the bug that hid the withdraw on web.)
5. **Layout:** put the voting status/countdown next to the "Vote anonymously" control
   for open compare posts; fall back to the action row for closed/binary posts. RN
   uses `flexDirection: 'row'` + `justifyContent: 'space-between'`.
6. **New icon:** a group/users glyph already added on web (`IconUsers`) for the Voters
   chip — reuse the equivalent on mobile.

## Relevant web code snippets

```tsx
// Unified engine (FeedPostCard.tsx) — handles vote and unvote
async function processVoteIntent(targetIndex: number) {
  voteGuardUntilRef.current = Date.now() + 2000;
  if (voteInFlight.current) { pendingVoteRef.current = { selectedOptionIndex: targetIndex }; return; }
  voteInFlight.current = true;
  let currentIdx = targetIndex;
  while (true) {
    try {
      const data = currentIdx < 0
        ? (await removeVoteMut({ variables: { postId } })).data?.removeVote
        : (await voteMut({ variables: { postId, selectedOptionIndex: currentIdx, anonymous } })).data?.votePost;
      const pending = pendingVoteRef.current; pendingVoteRef.current = null;
      if (!pending) { applyServerVoteSnapshot(data, currentIdx); break; }
      currentIdx = pending.selectedOptionIndex;          // newer tap → loop to it
    } catch { setOptimisticVote(null); await refreshPostVotingState(); break; }
  }
  voteInFlight.current = false;
}
```

```ts
// Backend removeVote (votes.service.ts) — same pubsub as vote()
const existing = await this.voteModel.findOne({ userId: uid, postId: pid });
if (existing) {
  await this.voteModel.deleteOne({ _id: existing._id });
  await this.postModel.updateOne({ _id: pid, voteCount: { $gt: 0 } }, { $inc: { voteCount: -1 } });
}
const stats = await this.getStats(postId, post.options.length);
await pubsub.publish(VOTE_UPDATED, { voteUpdated: { postId, ...stats } });
await pubsub.publish(POST_VOTE_UPDATED, { postVoteUpdated: { postId } });
```

## Notes / gotchas

- A negative `selectedOptionIndex` (`-1`) is the web's internal "withdraw" sentinel;
  `applyServerVoteSnapshot` maps it to viewerVote=null, mySelectedOptionIndex=null.
- Local/demo mode already toggled off on re-tap; only the API path needed the new
  `removeVote` wiring.
- Keep the subscription in-flight guard (`voteGuardUntilRef`) so your own optimistic
  state isn't clobbered by your own broadcast echo.
