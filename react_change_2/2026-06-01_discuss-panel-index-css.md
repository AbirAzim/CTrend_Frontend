# Discuss panel — CSS reference (web)

**Date:** 2026-06-01  
**Companion:** [discuss-panel-ux-overhaul.md](./2026-06-01_discuss-panel-ux-overhaul.md)

Port these `src/index.css` areas when matching web Discuss on mobile (or reuse patterns in StyleSheet).

---

## Key selectors (grep in repo)

| Prefix / class | Role |
|----------------|------|
| `.cx-discuss-slot` | Wrapper under post footer |
| `.cx-discuss-panel` | Open panel container |
| `.cx-discuss-header` | Sticky “Hide discussion” bar |
| `.cx-discuss-thread` | Scrollable comment list |
| `.cx-discuss-composer` | Bottom input area |
| `.cx-discuss-more` | Show more / show less control |
| `.cx-action-chip--discuss` | Discuss chip on action rail |
| `.cx-action-chip--discuss-open` | Pressed/open state |
| `.cx-comment-row` | Flat comment row (light bubbles) |
| `.cx-comment-actions` | Text-style reply/like links |

---

## FeedPostCard wiring

- Panel lives in `.cx-post-footer` → `#post-discuss-{id}` (`cx-discuss-slot`).
- Chip label: **Discuss** / **Hide** when `commentsOpen`.
- `userDismissedDiscussRef` prevents auto-reopen after user closes.

---

## Mobile

No equivalent sheet yet — optional full-screen Discuss modal; reuse thread sort rules from [phase2-comment-ux.md](./2026-06-01_phase2-comment-ux.md).
