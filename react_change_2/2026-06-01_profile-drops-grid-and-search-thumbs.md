# Profile grid cards + global search multi-thumb — design spec

**Date:** 2026-06-01 (updated with full layout / visual spec)

**Web files changed:**
- `src/components/ProfileCompareCard.tsx` (new — shared Kept-style compare card)
- `src/components/SearchPostThumbs.tsx` (new — search result media strip)
- `src/pages/ProfilePage.tsx` (Your drops / Kept / Voted → `.cx-kept-grid`)
- `src/components/GlobalSearch.tsx` (desktop dropdown + mobile overlay)
- `src/index.css` (`.cx-kept-grid`, `.cx-kept-card*`, `.cx-profile-card*`, `.cx-profile-status-pill*`, `.cx-gsearch-media*`)

**Related (same batch, different surfaces):**
- `2026-06-01_profile-stats-voted-tab-compact-post.md` — Voted tab query/filter, per-row stats origin, compact `/post/:id` media cap

---

## Summary

Profile **Your drops**, **Kept**, and **Voted** tabs share one card component (`ProfileCompareCard`) in a responsive **2+ column grid**. Global search post rows show **all compare images** (up to 4 cells + overflow badge), not only the first URL.

**Final status placement (confirmed):** **Live / Ended / Open / Closed** sits at the **bottom-left of the card**, **under** the engagement stat icons — not on the image, not bottom-right of the card.

---

## 1. Grid layout (`.cx-kept-grid`)

| Property | Value |
|--------|--------|
| Display | CSS Grid |
| Columns | `repeat(auto-fill, minmax(160px, 1fr))` |
| Gap | `10px` |
| Padding | `14px` |
| Used on | Your drops, Kept, Voted (and loading skeletons) |

**Card shell (`.cx-kept-card` + `.cx-profile-card`):**
- `border-radius: 12px`, `border: 1px solid var(--ig-border)`
- Background `var(--ig-card)`; dark: `rgb(15 23 42 / 0.6)`
- Shadow `0 1px 6px rgb(var(--cx-ink-rgb) / 0.06)`; hover: `translateY(-2px)` + stronger shadow
- Profile cards drop Kept’s `max-width: 220px` → `.cx-profile-card { max-width: none }` so grid cells can grow with column width

---

## 2. Card anatomy (wireframe)

```
┌─────────────────────────────────────┐
│  [img][img][img][img]     [Edit]    │  ← media 120px tall; Edit top-right (drops only)
│                          [+N]──────│  ← +N badge: media bottom-right
├─────────────────────────────────────┤
│  Caption (ellipsis)                 │
│  Category name (muted)                │  ← drops / voted only
│  [chip] [chip] …                    │  ← option labels, accent pills
│                                     │
│  ─── border-top (stats footer) ───  │
│  🗳️ 12  💬 3  ❤️ 1  🔖 4          │  ← stats row (drops / voted)
│  ● LIVE                             │  ← status: bottom-left, UNDER icons
└─────────────────────────────────────┘
```

**Kept variant** (lighter footer):
```
│  Caption                            │
│  ─── footer ───                     │
│  42 votes                           │  ← muted text, not emoji stats
│  ● OPEN                             │  ← labels: Open / Closed (not Live/Ended)
```

Tap anywhere on the link area → `/post/:id`. Edit is a **sibling button** outside navigation propagation (`stopPropagation`).

---

## 3. `ProfileCompareCard` variants

| | `drops` | `voted` | `kept` |
|---|---------|---------|--------|
| Grid tab | Your drops | Voted (+ All/Anonymous filter above grid) | Kept |
| Category + option chips | Yes | Yes | No |
| Stats row (🗳️ 💬 ❤️ 🔖) | Yes | Yes | No — only `{n} votes` muted line |
| Status labels (open) | **Live** + green pulse dot | **Live** + pulse dot | **Open** + pulse dot |
| Status labels (closed) | **Ended** + `IconLock` | **Ended** + lock | **Closed** + lock |
| Edit button | Yes, if `onEdit` passed | No | No |
| `showRichMeta` | `true` | `true` | `false` |

### Voting open / closed logic

```ts
function votingEnded(post) {
  if (post.isVotingOpen === false) return true;
  if (!post.votingEndsAt) return false;
  return new Date(post.votingEndsAt).getTime() <= Date.now();
}
```

Vote count: `totalVotes ?? upvoteCount + downvoteCount`.

### Props

```tsx
<ProfileCompareCard post={post} variant="drops" onEdit={() => openEdit(post)} />
<ProfileCompareCard post={post} variant="voted" />
<ProfileCompareCard post={post} variant="kept" />
```

`ProfileCompareCardPost` fields: `id`, `imageUrls`, `caption`, `category`, `options`, vote counts, `commentCount`, `hypeCount`, `saveCount`, `isVotingOpen`, `votingEndsAt`.

---

## 4. Media strip (`.cx-kept-card-media`)

| Property | Value |
|--------|--------|
| Height | `120px` |
| Layout | Horizontal flex; each thumb `flex: 1` |
| Images | Up to **4** URLs from `imageUrls.slice(0, 4)` |
| Background | `background-image: url(...)` + `cover` / `center` |
| Empty | Centered 📷 (`.cx-profile-card-media-empty`, opacity 0.35) |
| Overflow | `+{n}` badge (`.cx-kept-card-more`): **absolute bottom-right** of media, `rgb(0 0 0 / 0.55)` pill |

**Do not** place Live/Ended on the media layer (removed after UX iteration).

---

## 5. Footer — stats + status (`.cx-profile-card-stats-bar`)

Stacked column, **left-aligned**:

1. **Row 1 — stats** (`.cx-profile-card-stats`): flex wrap, gap `6px 8px`, font `0.68rem` weight 700, tabular nums  
   - 🗳️ `{totalVotes}` · 💬 `{commentCount}` · ❤️ `{hypeCount}` · 🔖 `{saveCount}`  
   - Zero counts still render (`💬 0` visible)
2. **Row 2 — status** (`.cx-profile-card-status-row`): full width, `justify-content: flex-start`  
   - Contains `.cx-profile-status-pill` only

Footer pinned to card bottom via flex on `.cx-profile-card-info`:
- `min-height: 108px`, `margin-top: auto` on stats bar
- Top border: `1px solid rgb(var(--cx-ink-rgb) / 0.08)`
- Padding: `8px 10px 0` on stats bar

---

## 6. Status pill design (`.cx-profile-status-pill`)

| State | Class | Visual |
|-------|--------|--------|
| Open | `--live` | Green text `#15803d`, bg `rgb(34 197 94 / 0.12)`, border green 28% opacity |
| Closed | `--ended` | Muted text, neutral bg/border; **lock icon** 11px (`IconLock`) — no 🔴 emoji |
| Live indicator | `.cx-profile-status-dot` | 6px circle `#22c55e`, pulse animation `cx-status-pulse` 2s |

Typography: `0.62rem`, weight 800, uppercase, letter-spacing `0.04em`, pill radius `999px`, padding `3px 8px 3px 7px`.

**Dark mode:**
- Live: text `#86efac`, slightly stronger green bg/border
- Ended: `rgb(255 255 255 / 0.06)` bg

---

## 7. Edit control (drops only)

| Property | Value |
|--------|--------|
| Class | `.cx-profile-card-edit` |
| Position | `absolute` top `8px` right `8px`, `z-index: 3` |
| Size | `34×34px`, radius `10px` |
| Icon | `IconEdit` SVG, 15px — **not** emoji |
| Surface | White 94% + blur; dark: slate 88% |
| Interaction | `preventDefault` + `stopPropagation` on click |

Rendered **outside** `.cx-profile-card-link` (`<article>` child) so edit does not navigate.

---

## 8. Text & chips

| Element | Class | Style |
|---------|--------|--------|
| Title | `.cx-kept-card-title` | `0.78rem` bold, single-line ellipsis, fallback `"Untitled compare"` |
| Category | `.cx-profile-card-category` | `0.68rem`, `var(--ig-muted)` |
| Option chips | `.cx-profile-card-chip` | `0.62rem` bold, accent tint bg `rgb(var(--cx-accent-rgb) / 0.1)`, accent-deep text, max-width ellipsis |

---

## 9. Global search — `SearchPostThumbs`

Used in `GlobalSearch.tsx` for post hits (desktop + mobile).

| Property | Value |
|--------|--------|
| Container | `.cx-gsearch-media` — `80×40px`, radius `8px`, `gap: 1px` |
| Cells | Up to 4, equal flex width, `background-size: cover` |
| Empty | `.cx-gsearch-media--empty` + 📷 |
| Overflow | `.cx-gsearch-media-more` — absolute **bottom-right**, `+N` |

Row alignment: `.cx-gsearch-row--post { align-items: center }`.

Backend `globalSearch` already returns full `imageUrls[]` — change was frontend-only.

---

## 10. CSS class quick reference

| Class | Role |
|-------|------|
| `.cx-kept-grid` | Profile tab grid container |
| `.cx-kept-card` | Base card shell |
| `.cx-profile-card` | Profile extensions (relative, no max-width) |
| `.cx-profile-card--{drops\|voted\|kept}` | Variant hook (mostly for skeleton) |
| `.cx-profile-card-link` | Full-height NavLink column flex |
| `.cx-kept-card-media` / `.cx-kept-card-thumb` | Media strip |
| `.cx-kept-card-more` | +N on media |
| `.cx-profile-card-info` / `-body` | Text + flex footer column |
| `.cx-profile-card-stats-bar` | Footer stack (stats then status) |
| `.cx-profile-card-stats` / `-stat` | Engagement icons row |
| `.cx-profile-card-status-row` | Status left alignment wrapper |
| `.cx-profile-status-pill*` | Live/Ended/Open/Closed pills |
| `.cx-profile-card-edit` | Edit overlay |
| `.cx-gsearch-media*` | Search thumbs |

**Legacy / unused on profile tabs:** `.cx-drop-list`, `.cx-drop-stats*` (superseded by card footer; see older doc for history).

---

## 11. Placement iteration (for mobile parity)

Do **not** reintroduce these rejected layouts:

| Attempt | Result |
|---------|--------|
| Status below stats in variable footer without pin | Live jumped with chip wrap |
| Status on image (top-left / bottom-right glass) | User wanted on card body, not thumbnails |
| Status bottom-right beside stats (horizontal footer) | User corrected → **bottom-left under icons** |

---

## 12. Mobile implementation (React Native)

1. **Grid** — `FlatList` `numColumns={2}` or `FlashList` with `estimatedItemSize`; min cell width ~160, gap 10, padding 14.
2. **Shared card component** — `variant: 'drops' | 'voted' | 'kept'`; mirror `showRichMeta` rules above.
3. **Media** — `View` row height 120; map first 4 URLs to `Image` `flex:1` `resizeMode="cover"`; `+N` `position:'absolute'` bottom-right.
4. **Footer** — `Column` `alignItems:'flex-start'`: stats `Row` `flexWrap`, then status pill below (not beside).
5. **Status** — Pill `borderRadius: 999`, live green + `Animated` pulse dot; ended = lock icon + muted (no red dot emoji).
6. **Edit** — `Pressable` absolutely positioned; **outside** the navigation `Pressable` for the card body.
7. **Search** — Same 80×40 (or scale for density) multi-cell strip; use post `imageUrls` array.
8. **Voted tab** — See `2026-06-01_profile-stats-voted-tab-compact-post.md` for `myVotedPosts(anonymousOnly)` and segmented filter.

---

## 13. Verification (web)

- Profile → Your drops: grid cards, edit on own posts, Live under stat icons bottom-left
- Profile → Voted: same cards, no edit, filter works
- Profile → Kept: compact footer (votes + Open/Closed)
- Global search: post rows show 2–4 thumbs when multi-image compare
- Hard refresh after CSS changes (`Cmd+Shift+R` / clear cache)

---

## Notes / gotchas

- Counts of 0 still show in stats row (intentional).
- Voted posts may belong to other users → never pass `onEdit`.
- Kept cards intentionally omit category/chips/full stats — lighter bookmark list.
- Single-post compact media (`58vh` cap) is documented in the profile-stats doc, not applied to these grid cards.
