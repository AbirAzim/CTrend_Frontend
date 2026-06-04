# User global platform posts (admin toggle)

**Date:** 2026-06-05

## User requirement

- Admin needs a **prominent** control to allow or disallow **normal users** posting **globally** (visible + notified to everyone).
- **Default: OFF** — only admin **Platform-wide** (`SYSTEM`) posts reach all users with the **Ke Jitbe** brand.
- When ON, a user can opt in per post; their **name and profile image** appear on the feed and in notifications (not the platform logo).
- Must be **clearly different** from admin platform posts (`SYSTEM` / `ANNOUNCEMENT`).

## Backend files changed (CTrend)

- `src/platform-settings/` — singleton `allowUserGlobalPosts` (default `false`); `platformSettings` query; `setAllowUserGlobalPosts` mutation (admin)
- `src/app.module.ts` — register `PlatformSettingsModule`
- `src/posts/post.schema.ts` — `isUserGlobalBroadcast`
- `src/posts/dto/create-post.input.ts` — `broadcastGlobally?: boolean`
- `src/posts/graphql/post.types.ts` — `isUserGlobalBroadcast` on `PostGql`
- `src/posts/posts.service.ts` — validate setting + non-admin on create; fan-out via `notifyAllUsersOfUserGlobalPost`; `feedPriority: 50` when global
- `src/posts/posts.module.ts` — import `PlatformSettingsModule`
- `src/feed/feed.service.ts` — include `USER` + `isUserGlobalBroadcast` in guest + authenticated feed (alongside `SYSTEM`)
- `src/notifications/notification.schema.ts` — type `USER_GLOBAL_POST`
- `src/notifications/notifications.service.ts` — `notifyAllUsersOfUserGlobalPost` (actor name/id for avatar; title `🌍 {name}`)

## Web files changed

- `src/graphql/admin.ts` — `PLATFORM_SETTINGS`, `SET_ALLOW_USER_GLOBAL_POSTS`
- `src/graphql/feed.ts` — `authorProfileImageUrl`, `isUserGlobalBroadcast` on feed/post queries
- `src/pages/AdminPage.tsx` — compact toggle + **Details** panel above tabs (full copy in Details)
- `src/pages/CreatePostPage.tsx` — **Post globally** checkbox when setting ON and user is not admin
- `src/components/FeedPostCard.tsx` — green **Global** badge + `ig-post--user-global` (platform posts still use **Platform** badge)
- `src/components/NotificationBell.tsx` — `USER_GLOBAL_POST` icon 🌍; deep-link to post; user avatar (not brand logo)
- `src/lib/mapGqlPostToFeedView.ts` — map `isUserGlobalBroadcast`, `authorProfileImageUrl`
- `src/types/feed.ts` — `isUserGlobalBroadcast` on `FeedPostView`
- `src/index.css` — admin control card, global badge, create-post checkbox, feed border accent

## GraphQL

```graphql
query PlatformSettings {
  platformSettings { allowUserGlobalPosts }
}

mutation SetAllowUserGlobalPosts($enabled: Boolean!) {
  setAllowUserGlobalPosts(enabled: $enabled) {
    allowUserGlobalPosts
  }
}

mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) { id }
  # input.broadcastGlobally: Boolean — only when platform setting allows; admins must use createSystemPost
}
```

| Post kind | API | Feed author | Notification type | Avatar |
|-----------|-----|-------------|-------------------|--------|
| Admin platform | `createSystemPost` → `SYSTEM` | Ke Jitbe brand | `ANNOUNCEMENT` 📢 | Ke Jitbe logo |
| User global | `createPost` + `broadcastGlobally` → `USER` + `isUserGlobalBroadcast` | Real user | `USER_GLOBAL_POST` 🌍 | User profile |

## Manual test

1. **Default OFF:** Admin dashboard → card shows **OFF**; normal user create page has **no** global checkbox.
2. **Turn ON:** Admin clicks **Allow global user posts** → refetch shows ON.
3. **User post:** Log in as non-admin → Create → check **Post globally** → publish → appears in another account’s feed with **Global** badge and user header (not Platform).
4. **Notifications:** Second account bell → 🌍 row with poster’s name/photo; tap opens post. Admin `SYSTEM` post still shows 📢 + **Ke Jitbe** branding (not the poster’s avatar).
5. **Turn OFF:** Admin disables → user cannot pass `broadcastGlobally` (backend `ForbiddenException`).
6. **Admin create:** Admin “Platform-wide Post” still uses `createSystemPost` only; `broadcastGlobally` on `createPost` rejected for admins.

**Deploy order:** backend first (new module, fields, notification enum), then web.

## Mobile app

- Read `platformSettings.allowUserGlobalPosts` before showing a global-post toggle on create.
- Map `isUserGlobalBroadcast` for feed badges; handle `USER_GLOBAL_POST` in push/in-app notification UI (user avatar, not moderator brand).
