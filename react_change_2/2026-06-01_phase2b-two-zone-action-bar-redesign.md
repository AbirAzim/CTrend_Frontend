# Phase 2b — Two-zone post action bar redesign (full design spec)

**Date:** 2026-06-01
**Web files changed:**
- `src/components/FeedPostCard.tsx` (action-bar JSX → two zones; status content)
- `src/index.css` (all `.cx-action-rail*`, `.cx-action-status-line*`, flat-chip
  overrides, dark-mode overrides; reverted `.cx-anon-toggle-row`)

This doc is an **exhaustive design spec** so the React Native card can match the web
pixel-for-pixel. Every color is given as a concrete value (the web uses CSS tokens;
the resolved values for both themes are listed).

---

## 1. Final layout

```
┌───────────────────────────────────────────────┐  ← container: rounded 16px,
│    💬2     ↗     ⤢     ❤1     🔖2     👥9       │     1px hairline border,
│ ───────────────────────────────────────────── │     translucent surface
│  🏆 Argentina won · 56% (1,234 votes)  See ›   │
└───────────────────────────────────────────────┘
  zone 1: flat action icons, evenly spaced
  divider: 1px hairline
  zone 2: result/countdown (left, truncates) + "See details ›" (right)
```

- **Closed post** → zone 2 left shows `🏆 {winner} won · {pct}% ({votes} votes)`
  in **amber/gold**.
- **Open post** → zone 2 left shows `⏳ {countdown}` (e.g. `⏳ Ends in 2d 4h`) in
  **accent/indigo**.
- The old standalone "RESULT/countdown" header row and the in-bar status badge were
  **removed** (the image already carries a FINAL banner; open status now lives only in
  zone 2). The "Vote anonymously" row went back to **just the toggle** (centered).

---

## 2. Design tokens (resolved values)

| Token | Light | Dark |
|---|---|---|
| `--cx-accent-deep` | `#312e81` | `#818cf8` |
| `--cx-accent` | `#4338ca` | `#a5b4fc` |
| `--cx-accent-rgb` | `67 56 202` | `129 140 248` |
| `--cx-rose-soft` | `#be123c` | `#f43f5e` |
| `--cx-rose-rgb` | `159 23 77` | `251 113 133` |
| `--cx-ink-rgb` | `21 20 27` | `7 12 24` |
| `--cx-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | (same) |
| amber (result/keep) | `#b45309` | `#fcd34d` |
| amber chip bg | `rgb(245 158 11 / …)` | (same hue) |

`rgb(X Y Z / a)` = the token's RGB triple at alpha `a`.

---

## 3. Container — `.cx-action-rail`

```css
.cx-action-rail {
  display: flex;
  flex-direction: column;            /* two stacked zones */
  background: rgb(255 255 255 / 0.72);
  border: 1px solid rgb(var(--cx-accent-rgb) / 0.14);   /* light: rgb(67 56 202 / .14) */
  border-radius: 16px;
  overflow: hidden;                  /* clip the divider/zones to the radius */
}
/* dark */
:root[data-theme="dark"] .cx-action-rail {
  background: rgb(15 23 42 / 0.64);
  border-color: rgb(148 163 184 / 0.24);
}
```

**RN:** `borderRadius: 16, borderWidth: 1, overflow: 'hidden'`, column flex.
Light surface `rgba(255,255,255,0.72)` border `rgba(67,56,202,0.14)`; dark surface
`rgba(15,23,42,0.64)` border `rgba(148,163,184,0.24)`.

---

## 4. Zone 1 — icons row — `.cx-action-rail-icons`

```css
.cx-action-rail-icons {
  display: flex;
  align-items: center;
  justify-content: space-evenly;   /* equal space incl. the ends */
  flex-wrap: wrap;                  /* safety on very narrow widths */
  gap: 2px;
  padding: 7px 8px;
}
```

**Flat icon buttons** (the container groups them, so each chip drops its pill):

```css
.cx-action-rail-icons .cx-action-chip {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 8px 10px;
}
.cx-action-rail-icons .cx-action-chip:hover {
  background: rgb(var(--cx-accent-rgb) / 0.08);   /* soft circular-ish highlight */
  border-color: transparent;
  transform: none;
}
.cx-action-rail-icons .cx-action-chip:active {
  transform: scale(0.94);          /* tactile press */
}
/* dark */
:root[data-theme="dark"] .cx-action-rail-icons .cx-action-chip { background: transparent; border-color: transparent; }
:root[data-theme="dark"] .cx-action-rail-icons .cx-action-chip:hover { background: rgb(129 140 248 / 0.16); }
```

Icon glyph size is **19×19** (`.cx-action-chip svg { width:19px; height:19px }`).
Chip base also carries `transition: transform .22s var(--cx-ease-spring), background .2s, border-color .2s, color .2s;`.

**Order of icons:** Comments (`IconComment`), Share (`IconShare`), Full page
(`IconOpenPost`, only when `showPermalinkToolbar`), Hype (`IconHeart`, fills **rose**
when active), Keep (`IconBookmark`, fills **amber** when active), Voters (`IconUsers`).

**Count badge** — `.cx-action-chip-count` (only shown when count > 0):
```css
.cx-action-chip-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 17px; padding: 0 5px; margin-left: -1px;
  border-radius: 999px;
  background: rgb(var(--cx-accent-rgb) / 0.14);
  color: var(--cx-accent-deep);
  font-size: 0.68rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1;
}
.cx-action-chip--heart .cx-action-chip-count { background: rgb(var(--cx-rose-rgb) / 0.16); color: var(--cx-rose-soft); }
.cx-action-chip--saved .cx-action-chip-count { background: rgb(245 158 11 / 0.18); color: #b45309; }
/* dark */
:root[data-theme="dark"] .cx-action-chip-count { background: rgb(129 140 248 / 0.2); color: #c7d0ff; }
:root[data-theme="dark"] .cx-action-chip--heart .cx-action-chip-count { background: rgb(251 113 133 / 0.22); color: #fda4af; }
:root[data-theme="dark"] .cx-action-chip--saved .cx-action-chip-count { background: rgb(245 158 11 / 0.22); color: #fcd34d; }
```

**RN zone 1:** `flexDirection:'row', flexWrap:'wrap', justifyContent:'space-evenly', alignItems:'center', gap:2, paddingVertical:7, paddingHorizontal:8`. Each action is a
`Pressable` (icon 19px) with `accessibilityLabel`; pressed → `transform:[{scale:0.94}]`
and a translucent accent bg. Count badge = a pill `View` 17px tall, radius 999, tabular
number, colored per action (indigo / rose / amber) with the dark variants above.

---

## 5. Divider + Zone 2 — context line — `.cx-action-rail-context`

```css
.cx-action-rail-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
  border-top: 1px solid rgb(var(--cx-accent-rgb) / 0.12);   /* the divider */
  background: rgb(var(--cx-ink-rgb) / 0.025);               /* faint tint to separate zones */
}
:root[data-theme="dark"] .cx-action-rail-context {
  border-top-color: rgb(148 163 184 / 0.18);
  background: rgb(255 255 255 / 0.03);
}
```

### Status / result line — `.cx-action-status-line`
```css
.cx-action-status-line {
  min-width: 0;
  font-size: 0.76rem; font-weight: 700; letter-spacing: 0.01em;
  color: var(--cx-accent-deep);              /* open: indigo  (#312e81 / #818cf8) */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;  /* truncate long summaries */
}
.cx-action-status-line--result { color: #b45309; }   /* closed: amber/gold */
:root[data-theme="dark"] .cx-action-status-line { color: var(--cx-accent); }       /* #a5b4fc */
:root[data-theme="dark"] .cx-action-status-line--result { color: #fcd34d; }
```

### "See details ›" button — `.cx-action-rail-details`
```css
.cx-action-rail-details {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 3px;
  border: none; background: none;
  padding: 4px 6px; border-radius: 8px;
  font: inherit; font-size: 0.76rem; font-weight: 800; letter-spacing: 0.01em;
  color: var(--cx-accent-deep);
  cursor: pointer;
  transition: background 0.18s var(--cx-ease-out), color 0.18s var(--cx-ease-out);
}
.cx-action-rail-details:hover { background: rgb(var(--cx-accent-rgb) / 0.1); }
.cx-action-rail-details-arrow { font-size: 1.05rem; line-height: 1; font-weight: 700; }
:root[data-theme="dark"] .cx-action-rail-details { color: var(--cx-accent); }
:root[data-theme="dark"] .cx-action-rail-details:hover { background: rgb(129 140 248 / 0.18); }
```
The arrow is `›` (collapsed) and flips to `‹` when the details panel is open; the label
toggles "See details" / "Hide details".

**RN zone 2:** `flexDirection:'row', justifyContent:'space-between', alignItems:'center',
gap:10, paddingVertical:8, paddingHorizontal:14`, top hairline border + faint bg.
Status `Text` with `numberOfLines={1}` + ellipsis, weight 700, 0.76rem (~12px). Details
`Pressable` weight 800 with a chevron; pressed → accent bg, radius 8.

---

## 6. Status content logic (FeedPostCard)

```tsx
<span className={`cx-action-status-line${isVotingClosed ? " cx-action-status-line--result" : ""}`}>
  {isVotingClosed
    ? `🏆 ${votingWinnerSummary || "Results are in"}`
    : `${votingHasEndDate ? "⏳ " : ""}${votingStatusLabel}`}
</span>
```

- `votingWinnerSummary` (closed) yields, e.g.:
  - `"Argentina won · 56% (1,234 votes)"` (single winner),
  - `"Tie · 50% each"` / `"Tie at 33%"`,
  - `"No votes were cast"`.
- `votingStatusLabel` (open): the live `countdownLabel` (e.g. `"Ends in 2d 4h"`), else
  `"Ends {relative}"`, else `"Voting open"`. The `⏳` prefix is added only when the post
  has an end date.

---

## 7. Winner highlighting inside "See details" (existing, part of the result design)

When expanded on a **closed** post, the details panel's per-option "pulse" rows mark the
winner — port these too for a consistent result feel:
- Winner row class `cx-pulse-row--final-winner` with a `🥇` medal before the label
  (`cx-pulse-medal`), a gold-tinted fill bar (`cx-pulse-fill--winner`), and emphasized
  count; losing rows get `cx-pulse-row--final-loser` (dimmed). Dark variants exist
  (`:root[data-theme="dark"] .cx-pulse-row--final-winner`).
- The card header above the rows reads "Final results" (vs "Live split"/"Breakdown" when
  open).

---

## 8. Notes / gotchas for mobile

- **No `:hover` on mobile** — map every `:hover` here to the **pressed** state.
- **`space-evenly`** is what makes the icon row look intentional regardless of how many
  icons show (Full page is conditional). RN supports `justifyContent:'space-evenly'`.
- **Truncate the status line** (`numberOfLines={1}`) — winner summaries can be long.
- **Two translucent surfaces** stack: the rail surface + the zone-2 tint. Keep both so
  the divider reads even on busy backgrounds.
- The old per-chip pill (border + shadow + filled bg) is intentionally dropped **inside
  the rail only**; the chip styles still exist for any non-rail usage.
- Amber `#b45309` (light) / `#fcd34d` (dark) is the shared "winner/keep" accent — reuse
  the same value for the Keep badge and the result line.
