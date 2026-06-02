# Admin Post Management UX Overhaul

**Date:** 2026-06-02
**Web files changed:**
- `src/pages/AdminPage.tsx`
- `src/index.css`

**Backend files changed (CTrend):**
- None

## What changed

- Reworked `Admin -> Posts` table UI to be more structured and scan-friendly for high-volume moderation.
- Added summary stat cards above the table (total, visible, live/closed/scheduled, votes shown).
- Refined post row composition:
  - Removed separate `Compare` column.
  - Embedded exactly 2 compare image previews into `Post` column.
  - Removed inline compare text links for cleaner visual density.
- Consolidated engagement into one `Engagement` column with grouped cards for:
  - Votes
  - Comments
  - Hype
  - Keeps
- Added dedicated `Winner` column (separate from status), with clickable winner avatar/name link.
- Improved status readability with semantic chips (`PUBLISHED`/`SCHEDULED`, `Live`/`Closed`).
- Updated created/scheduled metadata to badge style for clearer time-state recognition.
- Polished dark mode visuals and hover states for management actions.

## GraphQL

- No schema or operation changes.
- Existing admin post query fields were reused.

## Manual test

1. Open `Admin -> Posts`.
2. Confirm there is no standalone `Compare` column.
3. In each row, confirm exactly 2 compare preview images appear inside `Post`.
4. Confirm `Engagement` column shows votes/comments/hype/keeps in one grouped block.
5. Confirm `Winner` has a separate column and winner avatar/name is clickable.
6. Confirm `Created` and `Scheduled` labels appear as badges.
7. Verify styles in both light and dark themes.

## Mobile app

- No React Native change required.
- This is a web-admin layout update only.
