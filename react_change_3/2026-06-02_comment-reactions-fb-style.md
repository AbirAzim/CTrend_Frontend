# Comments: Facebook-style reaction tray + bubble summary

**Date:** 2026-06-02  
**Web files changed:**
- `src/components/PostCommentsPanel.tsx`
- `src/index.css`

**Backend files changed (CTrend):**
- _None (uses existing comment reaction data shape)._

## What changed

The comment UI was upgraded to a more familiar “Facebook-style” reactions experience:

- Quick “Like” toggles the default reaction emoji (or removes your reaction if already reacted).
- Hovering the Like button shows an emoji tray to pick a specific reaction.
- The comment bubble shows a compact reaction summary (top emojis + total count).

## Web

- `PostCommentsPanel.tsx`
  - Adds `reactionSummary()` to compute total + top reactions.
  - Adds hover-driven open/close behavior for the reaction tray (with a short close delay).
  - Adds quick-like behavior using the first emoji from `COMMENT_REACTION_EMOJIS` as the default.
  - Updates markup/classes for the new bubble + meta row layout.
- `index.css`
  - Adds styles under “Facebook-style comment reactions” (`.cx-fb-*`).

## Manual test

1. Open a post → comments panel.
2. On a comment:
   - Click **Like** → should add the default reaction.
   - Click **Like** again → should remove your reaction.
   - Hover **Like** → pick another emoji → should set that reaction.
3. Confirm bubble summary updates (top emojis + count).
4. Signed-out: confirm you see “Sign in to react” and can’t react.

