# Post authorEmail nullable for SYSTEM posts

**Date:** 2026-06-02
**Web files changed:**
- _None (backend-only change surfaced via existing GraphQL type)_

**Backend files changed (CTrend):**
- `src/posts/graphql/post.types.ts`

## What changed

`PostGql` previously required `authorEmail: string`, but `SYSTEM` posts are authored by the platform brand and use `null` for email. This mismatch caused a TypeScript error when mapping posts to GraphQL, because the service returned `authorEmail: null` for `SYSTEM` posts.

We updated the GraphQL type to allow `null`:

- `PostGql.authorEmail` is now declared as `authorEmail?: string | null`.
- The `@Field` decorator for `authorEmail` is now `@Field(() => String, { nullable: true })`.

This matches the existing behavior in `posts.service.ts`, where:

- Non-`SYSTEM` posts still return the real `author.email`.
- `PostType.SYSTEM` posts now validly return `null` for `authorEmail` without breaking the schema or TypeScript.

## GraphQL

- `PostGql.authorEmail` is now nullable in the generated schema (and in TypeScript).
- No new fields were added; this is a compatibility tweak so `SYSTEM` posts don’t violate the type.

## Manual test

1. Create or locate a `SYSTEM` post (platform-authored).
2. Hit the `Post`/feed GraphQL query that returns `PostGql`.
3. Verify:
   - Regular user posts still have `authorEmail` populated.
   - `SYSTEM` posts have `authorEmail: null` in the response.
4. Run backend build: `npm run build` in the CTrend repo — it should pass without TypeScript errors.

## Mobile app

- No UI change needed. Mobile clients that treat `authorEmail` as optional / nullable should continue to work.

