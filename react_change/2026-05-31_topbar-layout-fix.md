# Top Bar Layout — Brand Clipping + Search Bar Spacing Fix

**Date:** 2026-05-31
**Web files changed:**
- `src/index.css`

## What changed

The screenshot showed three stacked problems in the top bar:

1. Brand text "Ke Jitbe" was clipping to "Ke Jit" — actually, was breaking line-by-line into "Ke" / "Jit" / "be" stacked vertically.
2. The tagline "COMPARE · VOTE · VIBE" was breaking into 3 lines too.
3. Whole topbar felt cramped — search input was crushing the brand block.

### Root cause
`.ig-topbar` had `max-width: 432px` baked into the base style. That was fine when the topbar only held [logo] + [tagline] + [2 buttons]. But adding the GlobalSearch input (which wants up to 500px) + 5 action chips (theme/admin/new-compare/bell/logout) into a 432px box caused the flex layout to crush the leftmost child (brand) to ~50px wide. With `min-width: 0` on `.ig-brand-block` and `flex-direction: column` on the brand text, the result was character-by-character wrapping.

### Fixes
**`.ig-topbar`:**
- `max-width: 432px` → **`max-width: 1200px`** on desktop. Lets the bar breathe and accommodate brand + search + actions side-by-side.
- New `@media (max-width: 720px)` restores `max-width: 432px` for mobile, where the search input is hidden and the topbar should stay compact.
- `gap: 8px` → `12px` for cleaner action separation.

**`.ig-brand-block`:**
- Removed `min-width: 0` (which had allowed the brand to shrink to 0).
- Added **`flex-shrink: 0`** + **`white-space: nowrap`** so the brand keeps its natural width and never collapses or wraps.

**`.ig-brand-tag`:**
- Added `white-space: nowrap` so "COMPARE · VOTE · VIBE" stays on one line.
- New `@media (max-width: 980px)` hides the tagline entirely — keeps the topbar visually tidy when the search starts to compete for horizontal space.

**`.cx-gsearch` (global search input):**
- `flex: 1` → `flex: 1 1 0` + `min-width: 180px` + `max-width: 500px`. Now it has a sensible floor (so it stays usable when the bar narrows) and a ceiling (so it doesn't dominate on very wide screens).
- Removed the `margin: 0 16px` — the parent topbar's `gap: 12px` already handles spacing.

**`.ig-topbar-actions`:**
- Added `margin-left: auto` — pushes the action chips to the far right whenever the search shrinks below its max. Keeps the bar visually balanced with whitespace between search and actions.

**`.ig-topbar-cta-label`:**
- The label-show breakpoint was `(min-width: 380px)` which forced "ADMIN" / "NEW COMPARE" text to appear on tiny phones. Moved to `(min-width: 760px)` so on small viewports only the glyphs show, freeing horizontal space for the bell, theme toggle, etc.

## Mobile implementation instructions

The mobile codebase doesn't have a flex topbar with the same problem, but the principle to mirror is: **never let the brand block shrink below its natural width**, and **never let any text in the topbar wrap to multiple lines**. Use `flex-shrink: 0` (or RN's `flexShrink: 0`) on the brand container and `numberOfLines={1}` on the brand text.

## Notes / gotchas
- **No JS changes** — pure CSS responsive-layout refactor.
- **Three responsive breakpoints** at play now:
  - `<= 720px`: search input hides (replaced by mobile icon), topbar shrinks to 432px max, CTA labels hidden.
  - `720px – 760px`: search visible inline, but CTA labels still hidden (just glyphs).
  - `760px – 980px`: CTA labels show, but brand tagline still hidden.
  - `>= 980px`: full layout — brand + tagline + search + labeled CTAs.
- The `1200px` topbar max-width is a deliberate cap so the search input doesn't stretch to 700px+ on ultra-wide monitors, which would look unbalanced.
