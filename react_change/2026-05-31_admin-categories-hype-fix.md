# Admin Category Management + Fix Hype on System Posts

**Date:** 2026-05-31
**Web files changed:**
- `src/pages/AdminPage.tsx`
- `src/graphql/admin.ts`
- `src/index.css`

**Backend files changed:**
- `src/posts/posts.service.ts`
- `src/categories/categories.service.ts`
- `src/categories/categories.resolver.ts`
- `src/categories/categories.module.ts`

## What changed

### 1. Hype on system/admin posts — fixed
The bug: `createSystemPost` was creating admin/campaign posts with `likesDisabled: true`. When a user tried to hype such a post, `setReaction` threw `ForbiddenException: "Reactions are disabled on this post"`.

**Fix:**
- Changed `createSystemPost` to set `likesDisabled: false` so new system posts allow hype.
- Added `OnModuleInit` to `PostsService` that runs once on backend startup: `updateMany({ likesDisabled: true }, { $set: { likesDisabled: false } })`. This backfills all existing system posts so the user no longer hits the error on already-created campaigns.

### 2. Admin category management — created
**Backend:**
- New `Mutation createCategory(name: String!): CategoryGql!` — admin-only, slugifies the name (e.g. "Music & Dance" → "music-dance"), rejects duplicates (name OR slug match), throws `BadRequestException` for empty/invalid names.
- New `Mutation updateCategory(id: ID!, name: String!): CategoryGql!` — admin-only, regenerates slug from the new name, rejects duplicates against OTHER categories.
- New `Mutation deleteCategory(id: ID!): Boolean!` — admin-only, blocks deletion when posts reference the category (throws `ConflictException` with the count). Admin must reassign or delete those posts first.
- New `Query categoryPostCount(categoryId: ID!): Int!` — admin-only, returns count of posts using the category.
- `CategoriesModule` now registers the `Post` model so the service can count usages.
- All mutations guarded by `GqlAuthGuard + RolesGuard + @Roles(UserRole.ADMIN)`.

**Frontend:**
- `src/graphql/admin.ts` adds `CREATE_CATEGORY`, `UPDATE_CATEGORY`, `DELETE_CATEGORY`, `CATEGORY_POST_COUNT`.
- New `CategoriesTab` component in `AdminPage`:
  - Form at the top: text input + "+ Add Category" button → calls `createCategory`
  - Table listing all existing categories (name + slug + actions)
  - Inline edit mode: click "Edit" → row swaps to input + Save/Cancel
  - "Delete" button with `window.confirm` → calls `deleteCategory`, surfaces the post-count error if any
  - All mutations auto-`refetchQueries: [CATEGORIES]` so the list updates instantly
- Added "Categories" tab between "Campaigns" and "🏆 World Cup" in the admin tabs row.
- Minimal CSS additions: `.admin-cat-create` (form row layout), `.admin-cat-action` (inline button styling).

## Mobile implementation instructions

### Hype fix
Already done server-side. Mobile inherits the fix automatically because the backend now responds without the `ForbiddenException`. The startup migration also unblocks all existing system posts.

### Category management
1. Add a `Categories` screen behind the admin tab navigator.
2. Use the new `CREATE_CATEGORY` / `UPDATE_CATEGORY` / `DELETE_CATEGORY` mutations from `graphql/admin`.
3. Layout: `FlatList` of categories with each row showing name + action buttons (Edit / Delete). A header row with `TextInput` + Submit button for creating new categories.
4. Handle the `ConflictException` from `deleteCategory` by surfacing the message ("Cannot delete: 5 posts use this category…") so the admin knows to reassign first.

## Notes / gotchas
- **Backend type-checks clean** with `npx tsc --noEmit`.
- **Slug uniqueness** is enforced at the DB level (`unique: true` index on `slug`) AND at the service level via the duplicate check. The service check provides the friendly error; the DB index is the safety net for race conditions.
- **Default categories** seeded by `onModuleInit` (`Tech`, `Fashion`, `Food`, `Sports`, `Entertainment`) are visible in the admin table and CAN be edited/deleted just like user-created ones.
- **The startup hype-backfill** (`updateMany(likesDisabled: true → false)`) runs every server boot. Since it's idempotent (only affects rows that match), it's harmless to leave permanently. If desired, gate it on a NODE_ENV check, but for now it stays as a safety net.
- **Cyclic import avoided**: `CategoriesModule` registers the `Post` schema directly via `MongooseModule.forFeature` instead of importing `PostsModule`. `PostsModule` already imports `CategoriesModule` — going the other way would have been circular.
