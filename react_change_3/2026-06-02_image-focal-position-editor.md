# Per-option image focal (object-position) + editor on create post

**Date:** 2026-06-02  
**Web files changed:**
- `src/pages/CreatePostPage.tsx`
- `src/components/ImagePositionEditor.tsx` (new)
- `src/lib/imageFocal.ts` (new)
- `src/components/FeedPostCard.tsx`
- `src/graphql/feed.ts`
- `src/lib/mapGqlPostToFeedView.ts`
- `src/types/feed.ts`
- `src/index.css`

**Backend files changed (CTrend):**
- _Expected_: post option fields must support `imageFocalX` / `imageFocalY` on `PostOption` (create + read).  
  (Frontend now queries these fields on `PostGql.options`.)

## What changed

We added **per-option image focal coordinates** so compare images can be framed consistently using CSS `object-position` / `background-position`.

- Create post now stores `imageFocalX` + `imageFocalY` per option (0–100).
- Feed rendering uses these values to set each option image’s `objectPosition`.

## Web

### Create post: “Position” editor

- `CreatePostPage.tsx` draft items now include `imageFocalX`/`imageFocalY` (default 50/50).
- New modal `ImagePositionEditor` lets the author drag the image (and/or use sliders) to set focal.
- “Position ·” indicator shows when the focal is customized away from center.

### Feed rendering

- `FeedPostCard.tsx` applies `objectPosition` per option using `imageObjectPosition(...)`.

### GraphQL query shape

- `src/graphql/feed.ts` introduces `POST_OPTION_FIELDS` and requests:
  - `options { label imageUrl imageFocalX imageFocalY }`
- `mapGqlPostToFeedView.ts` and `types/feed.ts` extend `postOptions` to include focal values.

## Manual test

1. Create post → upload an image for option A/B.
2. Tap **Position** → drag image so subject is centered → Done.
3. Publish post.
4. Feed / post detail: confirm the option image framing matches what you set (not always centered).
5. Confirm options without custom position look unchanged (center-crop).

