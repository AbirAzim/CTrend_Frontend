# Admin Post Delete + Safari Chat Keyboard Fix

**Date:** 2026-06-02
**Web files changed:**
- `src/pages/AdminPage.tsx`
- `src/components/MessengerPanel.tsx`
- `src/index.css`

**Backend files changed (CTrend):**
- None (reused existing `deletePost` GraphQL mutation)

## What changed

- Added post delete action in Admin Post Management table (`Posts` tab).
- Added a safe confirmation dialog before deleting a post.
- Wired delete flow to refresh post list + count after successful deletion.
- Added error rendering for failed delete requests in admin UI.
- Added Safari/iOS keyboard-safe chat composer behavior so message input stays above keyboard in mobile messenger.
- Used `visualViewport` resize/scroll data to calculate keyboard inset and apply it to the mobile messenger shell/composer spacing.

## GraphQL

- Reused existing mutation from frontend: `deletePost(postId: ID!): Boolean!`
- No schema or resolver contract changes required for this update.

## Manual test

1. Open `Admin -> Posts`, click `Delete` on a post.
2. Confirm modal appears with irreversible warning.
3. Confirm delete and verify post disappears from list.
4. Verify pagination still works if deleted item was the last row on current page.
5. Open mobile Safari, go to messenger, focus message input.
6. Verify composer/input area moves above the keyboard and remains visible while typing.
7. Dismiss keyboard and verify composer returns to normal position.

## Mobile app

- No React Native code changes required.
- If similar issue appears in mobile app webviews, replicate visual-viewport keyboard inset strategy for webview overlays.
