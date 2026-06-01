# Phase 1 — Icon-only action bar + count badges + notification dark-mode hover

**Date:** 2026-06-01
**Web files changed:**
- `src/components/FeedPostCard.tsx` (action rail markup)
- `src/components/IgIcons.tsx` (new `IconUsers`)
- `src/index.css` (`.cx-action-rail`, `.cx-action-chip*`, `.nb-item`/`.nb-btn` hover)

## What changed on web (final, confirmed behaviour)

### A. Post action bar — icon-only, wrapping, with count badges
The per-post action rail (Discuss/Comments, Share, Full page, Hype, Keep, Voters):

1. **Icon-only.** Removed all text labels. Each chip is now just its icon. Added a new
   **`IconUsers`** (group) icon for the **Voters** chip (it previously had no icon).
2. **Count badges.** Comments, Hype, Keep, and Voters show their count as a small
   **pill badge** next to the icon (`.cx-action-chip-count`) — only when count > 0.
   Each badge is **color-matched** to its chip: indigo (default), **rose** (Hype),
   **amber** (Keep), with dark-mode variants. `tabular-nums` for digit alignment.
   The Voters count uses the post's total votes (`isMultiCompare ? sum(optionStats) :
   up + down`).
3. **Wraps instead of scrolling sideways.** The rail was `flex-wrap: nowrap` +
   `overflow-x: auto` (horizontal scroll) — now `flex-wrap: wrap` + `justify-content:
   center`, so **every action is always visible**, wrapping to a second row on narrow
   screens. No swiping.
4. **Accessibility:** each chip keeps its `aria-label` and gained a `title` tooltip
   (Comments / Hype / Keep / Voters …) since the visible text is gone.

### B. Notification dropdown — dark-mode hover (issue #5)
`.nb-item:hover`, `.nb-btn:hover`, and unread-row hover referenced an **undefined**
CSS var `--ig-surface-2`, so they fell back to light grey (`#f7f7f7`) even in dark
mode. Added dark-mode hover overrides (subtle white-alpha backgrounds).

## Mobile implementation instructions (React Native)

### Action bar
1. **Icon-only chips** = `Pressable`s containing just the icon (`react-native-svg` or
   your icon set). Add an `accessibilityLabel` (RN's equivalent of `aria-label`) to
   each — there's no hover tooltip on mobile, so the label is the only affordance, make
   it accurate.
2. **Add the group/users icon** for Voters (mirror `IconUsers`: two overlapping person
   glyphs, stroke style).
3. **Count badge** = a small absolutely-or-inline positioned `View` pill with the
   number, shown only when `count > 0`. Color it from the theme per chip
   (indigo/rose/amber). Use a monospaced/tabular style if available.
4. **Wrapping** = a `View` with `flexDirection: 'row'`, `flexWrap: 'wrap'`,
   `justifyContent: 'center'`, `gap` (or margins). **Do not** use a horizontal
   `ScrollView` for these actions — the whole point is no sideways scrolling.
5. **Voters total** — compute the same way: multi → sum of `optionStats[].count`,
   binary → `up + down`.

### Notification hover → pressed state
RN has no `:hover`. The analogous state is the **pressed** state — set the notification
row's pressed background from the theme (light: `#f7f7f7`; dark: `rgba(255,255,255,0.06)`;
unread pressed: `rgba(0,149,246,0.18)`). Centralize hover/pressed colors in the theme
so the "undefined token → wrong color" bug can't recur.

## Relevant web code snippets

```tsx
// Icon-only chip with count badge (FeedPostCard.tsx)
<button className="cx-action-chip ..." aria-label="Hype" title="Hype" onClick={...}>
  <IconHeart filled={liked} />
  {hypeCount > 0 ? <span className="cx-action-chip-count">{hypeCount}</span> : null}
</button>

// Voters total
const totalVoteCount = isMultiCompare ? multiTotalVotes : binaryTotal;
```

```css
.cx-action-rail { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.cx-action-chip-count { /* pill */ background: rgb(var(--cx-accent-rgb)/.14); color: var(--cx-accent-deep); }
.cx-action-chip--heart .cx-action-chip-count { background: rgb(var(--cx-rose-rgb)/.16); color: var(--cx-rose-soft); }
.cx-action-chip--saved .cx-action-chip-count { background: rgb(245 158 11/.18); color: #b45309; }

/* Notification hover — dark */
[data-theme="dark"] .nb-btn:hover  { background: rgba(255,255,255,.08); }
[data-theme="dark"] .nb-item:hover { background: rgba(255,255,255,.06); }
[data-theme="dark"] .nb-item--unread:hover { background: rgba(0,149,246,.18); }
```

## Notes / gotchas

- The old `.cx-action-chip-label` CSS rules are now dead on web (kept, harmless). On
  mobile, don't port a label element at all.
- Hype heart fills **rose** when hyped; Keep bookmark fills **amber** when saved — keep
  that state-color coupling on the badge too.
