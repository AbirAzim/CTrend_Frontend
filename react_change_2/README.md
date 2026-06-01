# React Change Log 2 — Web → Mobile Sync (Issue Batch 2)

Continuation of `react_change/`. Tracks the **second batch** of web changes
(notifications, comments, voters dark mode, mobile zoom, message reactions) so
equivalent changes can be ported to the React Native mobile app.

The overall web plan lives in the repo root: [`../PHASES.md`](../PHASES.md).

## Workflow

1. Implement + verify a phase on the **web** version.
2. Then add a dated entry here describing that phase's web change and how to
   port it to React Native.

```
react_change_2/
  YYYY-MM-DD_short-description.md
```

Use [`TEMPLATE.md`](./TEMPLATE.md) as the starting structure for each entry.

**Recent:** `2026-06-01_profile-drops-grid-and-search-thumbs.md` — **full design spec**
(profile grid cards: layout wireframe, variants, status pill, footer placement,
edit control, search multi-thumb, CSS reference, mobile port notes).

Other batch-2 entries: phase1/2 voters & comments, profile voted-tab stats,
compact single-post view — see files in this folder.
