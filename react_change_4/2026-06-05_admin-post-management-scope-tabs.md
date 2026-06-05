# Post Management — split into Admin vs User post tabs

**Date:** 2026-06-05
**Web files changed:**
- `src/pages/AdminPage.tsx` — `PostsTab` gets a `scope` sub-tab toggle (Admin / User)
- `src/index.css` — `admin-subtabs` / `admin-subtab` segmented control

**Backend files changed (CTrend):**
- `src/posts/dto/admin-platform-posts.input.ts` — `scope` field (`admin` | `user`)
- `src/posts/posts.service.ts` — `buildPlatformPostsFilter` branches on `scope`; `scope` threaded through `listPlatformPostsAdmin` / `countPlatformPostsAdmin`
- `src/posts/posts.resolver.ts` — pass `scope` from query/filter inputs

## What changed

Admin **Post management** now has two sub-tabs:

- **Admin Post Management** — admin platform-wide posts (`type: SYSTEM`). _Default._
- **User Post Management** — normal-user posts broadcast platform-wide
  (`type: USER` + `isUserGlobalBroadcast: true`).

Previously the admin posts query was hardcoded to `type: SYSTEM`, so user global
broadcasts (added by the user-global-posts feature) had no management surface. The new
`scope` filter selects which set to manage; all existing search / status / voting /
category / sort filters and the edit/delete/open actions work on both.

The "New platform post" CTA shows only on the Admin tab (it creates a SYSTEM post);
the User tab is review/remove only. The User tab's rows show the real author
(name + avatar), the Admin tab shows the platform brand as before.

## GraphQL

`AdminPlatformPostsFilterInput` (and the `...QueryInput` that extends it) gain a
nullable `scope`:

```graphql
input AdminPlatformPostsFilterInput {
  # …existing…
  scope: String   # "admin" (default) | "user"
}
```

No change to the query/mutation documents — the client already passes the whole
`$query` / `$filter` object, so adding `scope` to those objects is enough.

Backend filter:
- `scope = "user"` → `{ type: USER, isUserGlobalBroadcast: true }`
- otherwise → `{ type: SYSTEM }`

## Manual test

1. Admin → Post management → **Admin Post Management**: shows platform/SYSTEM posts
   (unchanged), "New platform post" CTA present.
2. Switch to **User Post Management**: shows only normal-user posts that were broadcast
   globally, real author shown, no create CTA; pagination/count reflect that set.
3. Search / status / voting / category / sort all work within each tab; switching tabs
   resets to page 1.
4. Backend `npm run build` + frontend `npm run lint` (0 errors) / `npm run build` pass.

## Mobile app

<!-- Native UI may differ; port data model + API first. -->
Native admin (if any) can pass `scope: "user"` to `adminPlatformPosts` /
`adminPlatformPostsCount` to list user global posts.
