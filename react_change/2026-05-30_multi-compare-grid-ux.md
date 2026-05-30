# Multi-Compare Grid Layout & Vote UX Overhaul

**Date:** 2026-05-30
**Web files changed:**
- `src/components/FeedPostCard.tsx`
- `src/index.css`

## What changed on web

### 1. Multi-item layout — grid instead of horizontal scroll
Posts with 3+ compare images now render in a CSS grid instead of a horizontally-scrollable swiper. No more left/right swiping needed.
- 3 items → 3-column equal grid (`1fr 1fr 1fr`)
- 4 items → 2×2 grid (`1fr 1fr`)
- 5+ items → 3-column wrapping grid

CSS classes: `ig-post-media-wrap--compare-grid`, `--compare-grid--3`, `--compare-grid--4`, `--compare-grid--many`
Each cell gets `aspect-ratio: 1` (square) and `border-radius: 0` for a tight tile appearance.

### 2. "VOTED" badge bug fix (multi-compare)
The floating `cx-vote-status-chip--overlay` chip was showing "VOTED" incorrectly across all images in a multi-compare because it was a single overlay on the entire media container. It now only renders for binary (2-item) compare. Multi-compare uses the per-cell `cx-voted-pin` heart icon on the picked cell instead.

### 3. Vote Anonymously — always visible, redesigned as toggle switch
Moved from inside the "See Details" panel to always visible below the compare images (before the footer). New design:
- Ghost emoji icon + "Vote anonymously" text + sliding pill toggle switch
- Pill turns purple when enabled
- Container row: `cx-anon-toggle-row` (centered, semi-transparent background)
- Label: `cx-anon-toggle` with `:has(input:checked)` for reactive styling
- Custom `cx-anon-toggle-switch` span replaces the old checkbox appearance

Only shown in `voteMode === "api"` and while voting is open.

### 4. Breakdown (pulse card) hidden under "See Details"
The live-split / breakdown percentage cards (`cx-pulse-card`) for binary and multi compare are now rendered inside the `detailsOpen` block (only shown when user clicks "See Details"). The compact Pulse card for non-compare posts remains always visible.

---

## Mobile implementation instructions

### Multi-compare grid (React Native)
1. Detect when `post.imageUrls.length > 2` (multi-compare)
2. Replace horizontal `FlatList`/`ScrollView` with a grid:
   - Use a `FlatList` with `numColumns={compareUrls.length === 3 ? 3 : 2}` or a manual `View` with `flexDirection: "row"; flexWrap: "wrap"`
   - Each cell: `width: cellWidth`, `aspectRatio: 1`, `overflow: "hidden"`
   - For 3 items: `cellWidth = screenWidth / 3`
   - For 4 items: `cellWidth = screenWidth / 2`
   - For 5+: `cellWidth = screenWidth / 3` (3-col grid, items wrap)
   - Gap: 2px between cells

### "VOTED" badge fix
- Remove the global voted badge overlay for multi-compare
- Only keep the per-cell picked indicator (heart icon on the selected cell)

### Vote anonymously toggle
- Add a persistent row below the images (before the footer)
- Use a `Switch` component from React Native (or a custom toggle)
- Style as a pill row with ghost emoji, label text, and the Switch
- Purple color when active (`#8b5cf6`)
- Only shown when authenticated (`voteMode === "api"`) and voting is open

### Breakdown under "See Details"
- Wrap the breakdown `View` inside the existing "See Details" expandable section
- Only render when `detailsOpen === true`
- Keep the classic vote bar always visible for non-compare posts

## Notes / gotchas
- `:has()` CSS pseudo-class is used for the toggle switch reactive styling (web only — not available in React Native, use state-driven styles there)
- CSS grid `aspect-ratio: unset` overrides the base `ig-post-media-wrap` 4:3 ratio — in RN, don't set a fixed container height for multi-compare grids
- The `cx-voted-pin` SVG heart on the picked cell still works in grid layout — no change needed there
- Multi-compare voting logic (`handleMultiCompareTap`) is unchanged
