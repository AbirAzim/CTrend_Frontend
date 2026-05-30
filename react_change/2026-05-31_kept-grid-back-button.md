# Kept Posts Compact Grid + Back Button Fix

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/PostDetailPage.tsx`
- `src/pages/ProfilePage.tsx`
- `src/index.css`
- `src/components/ScaledCard.tsx` (created then removed)

## What changed on web

### Back button on post detail page
`← Feed` (NavLink hardcoded to `/`) replaced with `← Back` (button calling `navigate(-1)`).
React Router's `navigate(-1)` pops the browser history stack — returns to feed, profile, kept tab, or anywhere else the user came from. `NavLink` import removed.

### Kept posts — compact card grid (`cx-kept-grid`)
Dropped `FeedPostCard` and all scaling tricks (`zoom`, `ScaledCard` component) from the kept tab. Replaced with a proper compact grid:

**Layout:** `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))` — fills the panel with fixed-size cards side by side.

**Each `cx-kept-card`:**
- `max-width: 220px` — won't stretch to fill the whole panel for a single item
- 120px image area — two thumbnails side-by-side for binary compares, single image for multi with `+N` badge
- Info row: truncated caption + vote count + Open/Closed status badge
- Hover: subtle lift animation
- Clicks to `/post/:id` (NavLink)

## Mobile implementation instructions

### Back button
Replace `navigation.navigate('Feed')` with `navigation.goBack()`. Use `navigation.canGoBack()` to decide whether to show the back button or fall back to home.

### Kept posts grid
Use a `FlatList` with `numColumns={2}` and a fixed `ItemSeparatorComponent`. Each item:
- Container: fixed height ~180px, `borderRadius: 12`, `overflow: "hidden"`, `margin: 5`
- Image area: 120px tall `ImageBackground` with two images side by side (flexDirection: "row")
- Info row: `Text` for caption (numberOfLines: 1) + vote count + status

## Notes / gotchas
- `ScaledCard.tsx` (using ResizeObserver + transform scale) was created and immediately removed — scaling FeedPostCard is unreliable because images with `aspect-ratio` still render at their natural size inside the transform context. Custom compact card is the correct approach.
- `navigate(-1)` has no fallback — if the user lands directly on a post URL (e.g. shared link), there's no previous history entry. Could add `window.history.length > 1` check and fall back to `navigate("/")` if needed in the future.
