# Mobile — Web Sync Implementation Plan

> **Source:** All 24 files in `react_change/` (dated 2026-05-30 and 2026-05-31).
> **Goal:** Port every web improvement to the Expo React Native mobile app, phase by phase, with a clear test gate after each phase.
> **Rule:** Complete and test each phase before starting the next. Each phase is independently deployable to the phone via the safe build script.

---

## How to build & test after each phase

```bash
# Verify JS bundle is clean first
cd mobile && export TMPDIR=$HOME/tmp && npx expo export:embed --eager --platform android --dev false

# Build + install
export TMPDIR=$HOME/tmp && ./scripts/build-mobile-apk-safe.sh

# If install fails (signature):
adb uninstall com.ctrend.app && adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell pm enable com.ctrend.app
```

---

## Phase 1 — Feed Card Foundation Fixes

**Goal:** Fix the most visible issues in the existing feed card — display names, comment count, hype toggle, anonymous vote, and realtime delete. All backend fields already exist; this is pure mobile wiring.

**Files to touch:**
- `mobile/components/FeedPostCard.tsx`
- `packages/shared/src/graphql/feed.ts`

### Tasks

#### 1.1 Display name — show name, drop @username duplicate line
- Every user row currently shows TWO lines: display name + `@username`. Remove the `@username` second line everywhere in the feed card (post header, comment rows, voter rows).
- Show `displayName` first, fall back to `@username` only when displayName is blank.
- Avatar initial: `(displayName || username).charAt(0).toUpperCase()`.
- Keep `@username` only on Profile screen headers.

#### 1.2 Lazy comments — remove preview, show count on chip
- Remove `recentComments` from the `FEED_POSTS` and `GET_POST_BY_ID` shared GraphQL selections in `packages/shared/src/graphql/feed.ts`.
- The Discuss chip label: `Discuss {commentCount > 0 ? commentCount : ""}`.
- Comments panel only mounts when `commentsOpen === true` — no prefetch on scroll.
- This matches the backend which now always returns `recentComments: []`.

#### 1.3 viewerHasHyped — hype/unhype toggle
- Add `viewerHasHyped` to the feed/post GraphQL selections (already on backend).
- Drive the Hype chip's active/filled state from `post.viewerHasHyped` instead of local state.
- On press: call `setPostHype(postId, active: !post.viewerHasHyped)`.
- Label switches: **Hype** when not hyped, **Unhype** when hyped.

#### 1.4 Anonymous vote persistence — myVoteAnonymous
- Add `myVoteAnonymous` to feed/post GraphQL selections.
- Initialize the "Vote anonymously" Switch from `post.myVoteAnonymous` (not always false).
- Toggling after a vote is cast: call `votePost` with the same `selectedOptionIndex` + new `anonymous` value.
- Voting while toggle is on: pass `anonymous: true` in the existing vote mutation.

#### 1.5 Realtime post deletion — POST_DELETED_SUB
- Add `POST_DELETED_SUB` subscription to shared GraphQL.
- In the feed screen, subscribe and maintain a `removedIds` Set.
- Filter the rendered post list: skip any post whose `id` is in `removedIds`.

#### 1.6 Realtime new-post — also refetch feed
- In the `NEW_POSTS` subscription handler, also call `refetch()` on the feed query after adding to the live queue.
- This ensures a new post always appears even if the per-post `getPostById` call fails.

### Test gate
- [ ] Feed shows displayName (not @username double line) on post headers and comment rows
- [ ] Discuss chip shows count; tapping opens comments (no comments visible before tap)
- [ ] Hype button reflects current hype state from server after refresh
- [ ] Anonymous toggle starts checked/unchecked correctly after page reload
- [ ] Deleting a post on web removes it from phone feed in real time
- [ ] A new post created on web appears on phone within 1–2 seconds

---

## Phase 2 — Multi-Compare Grid & Vote UX

**Goal:** Posts with 3+ compare images use a grid layout instead of horizontal scroll. Anonymous vote toggle is always visible. Breakdown moves under "See Details".

**Files to touch:**
- `mobile/components/FeedPostCard.tsx`
- Grid cell component (new or inline)

### Tasks

#### 2.1 Multi-compare grid layout
- Detect `post.imageUrls.length > 2` (multi-compare).
- Replace the current horizontal `FlatList`/`ScrollView` with a `View` using `flexDirection: "row"; flexWrap: "wrap"`.
- Cell widths (use `Dimensions.get("window").width`):
  - 3 items → `cellWidth = screenWidth / 3`
  - 4 items → `cellWidth = screenWidth / 2` (2×2 grid)
  - 5+ items → `cellWidth = screenWidth / 3` (3-col wrapping)
- Each cell: `width: cellWidth`, `aspectRatio: 1`, `overflow: "hidden"`, `margin: 1` (1px gap each side).

#### 2.2 VOTED badge fix for multi-compare
- Remove the single global "VOTED" overlay for multi-compare posts.
- Only render the VOTED chip overlay for binary (2-image) posts.
- Multi-compare: show the per-cell voted pin (heart/star icon) only on the selected cell.

#### 2.3 Vote anonymously toggle — always visible
- Move the anonymous toggle row OUT of any collapsed/details section.
- Render it as a persistent row directly below the compare media area, before the action chips.
- Layout: ghost emoji `👻` + "Vote anonymously" Text + `Switch` component.
- Switch color when active: `#8b5cf6` (brand purple).
- Only show when `voteMode === "api"` (authenticated) AND voting is still open.

#### 2.4 Breakdown under "See Details"
- Move the live-split percentage breakdown View inside the `detailsOpen` block.
- Only render breakdown `View` when `detailsOpen === true`.
- The compact vote bar (for non-compare posts) stays always visible — only the full breakdown cards move.

### Test gate
- [ ] A post with 3 images shows a 3-column grid (not horizontal scroll)
- [ ] A post with 4 images shows a 2×2 grid
- [ ] VOTED chip appears only on the picked cell for multi-compare (no full-overlay badge)
- [ ] Anonymous toggle is visible below images on any open-voting post
- [ ] Breakdown percentages only appear after tapping "See Details"

---

## Phase 3 — Comment System Upgrade

**Goal:** Full comment upgrade — 1-level threaded replies, 6-emoji reactions, author avatars, and correct notification types from the bell.

**Files to touch:**
- `mobile/components/FeedPostCard.tsx` (or a new `PostCommentsPanel.tsx`)
- `packages/shared/src/graphql/comments.ts`
- `mobile/app/notifications/index.tsx`

### Tasks

#### 3.1 GraphQL selections — extend comments
Update `COMMENTS_BY_POST` selection to include:
```graphql
parentId
reactions { emoji count }
viewerReaction
author { id username displayName profileImageUrl }
```
Add mutation `SET_COMMENT_REACTION(commentId: ID!, emoji: String): CommentReaction`.

#### 3.2 Thread UI — 1-level replies
- Build comment threads: top-level comments + their replies (filter by `parentId`).
- Show a **Reply** button only on top-level comments (not on replies).
- When Reply is tapped: show an inline composer below the parent thread.
- Submit reply: `commentPost({ postId, input: { content, parentId } })`.
- Do NOT show a Reply button on replies (1-level max, backend enforces this).

#### 3.3 Emoji reactions
- Allowed emojis: `["👍", "❤️", "😂", "😮", "😢", "🔥"]`.
- Render a small emoji strip below each comment.
- Each emoji shows its count. The viewer's active reaction is highlighted (accent border/background).
- Tapping same emoji as active → removes reaction (`emoji: null`).
- Tapping a different emoji → switches reaction.
- Call: `setCommentReaction({ commentId, emoji: viewerReaction === emoji ? null : emoji })`.

#### 3.4 Author avatars
- Use `author.profileImageUrl` when present.
- Fallback: `https://ui-avatars.com/api/?name={displayName}&background=312e81&color=ffffff`.
- Tapping author avatar/name → `navigation.navigate('UserProfile', { userId: author.id })`.

#### 3.5 Notification types — comments
In `mobile/app/notifications/index.tsx` (or notification handler):
- Handle new types: `COMMENT_REPLY` (icon: ↩️) and `COMMENT_REACTION` (icon: 😊).
- On tap for either: `navigation.navigate('PostDetail', { postId: n.postId ?? n.referenceId })`.
- Add `postId` field to the notification GraphQL selection.

### Test gate
- [ ] Tap Reply on a comment → inline composer appears below that comment
- [ ] Reply appears nested under the parent after submit
- [ ] Tapping 👍 adds reaction; tapping again removes it; tapping ❤️ switches
- [ ] Commenter avatar shows profile picture (or ui-avatars fallback with initials)
- [ ] Tapping commenter name navigates to their profile
- [ ] Bell shows ↩️ for reply notifications and 😊 for reactions; tapping → post detail

---

## Phase 4 — Notification System Upgrade

**Goal:** Full notification bell upgrade — new post/hype/comment notification types with actor grouping, inline friend-request actions, sound, and polling fallback.

**Files to touch:**
- `mobile/app/notifications/index.tsx`
- `packages/shared/src/graphql/notifications.ts`
- Feed screen (polling)
- Sound file (expo-av asset)

### Tasks

#### 4.1 GraphQL — add new fields and types
Update `MY_NOTIFICATIONS` query and `NEW_NOTIFICATION_SUB` subscription to include:
```graphql
actorCount
latestActorId
latestActorName
postId
referenceType
```
New notification types to handle: `NEW_POST_FRIEND`, `POST_HYPE`, `POST_COMMENT`, `COMMENT_REPLY`, `COMMENT_REACTION`.

#### 4.2 Deduplication on subscription
- When a `NEW_NOTIFICATION_SUB` event arrives, check if an entry with the same `id` already exists in the list.
- If yes → replace it in place (grouped notifications update their existing entry — `actorCount` increments, body changes, `createdAt` bumps).
- If no → prepend to list.

#### 4.3 Grouped body display
- Body text uses `latestActorName` + grouped count, e.g.:
  - `actorCount === 1`: `"Anjon hyped your post"`
  - `actorCount === 2`: `"Anjon and 1 more hyped your post"`
  - `actorCount > 2`: `"Anjon and {count-1} more hyped your post"`

#### 4.4 Route mapping by type
- `FRIEND_REQUEST` → `navigation.navigate('UserProfile', { userId: n.referenceId })`
- `POST_HYPE`, `POST_COMMENT`, `NEW_POST_FRIEND`, `COMMENT_REPLY`, `COMMENT_REACTION` → `navigation.navigate('PostDetail', { postId: n.postId ?? n.referenceId })`
- `ANNOUNCEMENT` → no navigate; mark read only (or open campaign modal)

#### 4.5 Inline friend-request actions in bell
- For `FRIEND_REQUEST` rows in the notification list, show **Accept** (green) + **Reject** (ghost) + **View** buttons inline.
- Each button uses `ActivityIndicator` while its action is loading (`actionLoadingIds` Set per notification id).
- Accept/Reject calls `respondFriendRequest(accept: true/false)` then refetches `FRIEND_REQUESTS` + `MY_FRIENDS`.

#### 4.6 Notification sound
- Add a short chime audio file to `mobile/assets/sounds/notification.mp3` (or `.wav`).
- Use `expo-av` `Audio.Sound.playAsync()` in the subscription `onData` handler for any non-MESSAGE notification.
- Load the sound once on app start; unload on unmount.

#### 4.7 Polling fallback
Add `pollInterval` to these queries (insurance when WebSocket drops on mobile):
- `FEED_POSTS`: `pollInterval: 20000` (20 s)
- `MY_NOTIFICATIONS`: `pollInterval: 25000` (25 s)
- `MY_SCHEDULED_POSTS`: `pollInterval: 10000` (10 s)

### Test gate
- [ ] Bell shows `POST_HYPE` with ❤️ icon and grouped body ("Anjon and 2 more hyped your post")
- [ ] Bell shows `NEW_POST_FRIEND` with ✨ icon when a friend posts
- [ ] Bell shows `POST_COMMENT` with 💬 icon
- [ ] Friend request in bell has Accept / Reject buttons; accepting removes the row
- [ ] Tapping a post notification → navigates to PostDetail
- [ ] A notification chime plays when a new notification arrives
- [ ] With Wi-Fi WebSocket blocked, a new notification still appears within 25 s via poll

---

## Phase 5 — Profile Core (Cache, Skeleton, Drops, Kept Grid)

**Goal:** Profile screen loads instantly on repeat visits, drops tab looks polished, kept tab is a compact grid, back button works properly everywhere.

**Files to touch:**
- `mobile/app/tabs/profile.tsx`
- `mobile/app/post/[id].tsx` (back button)
- Apollo client config (cache cap)

### Tasks

#### 5.1 Apollo cache policy — cache-and-network
Change all `useQuery` calls in the Profile screen from `fetchPolicy: "network-only"` to:
```ts
fetchPolicy: "cache-and-network",
nextFetchPolicy: "cache-first",
```
Affected queries: `ME`, `USER_POSTS`, `MY_FRIENDS`, `FRIEND_REQUESTS`, `FRIEND_SUGGESTIONS`, `MY_SAVED_POSTS`.

#### 5.2 Apollo persist cache — 5 MB cap
If using `apollo3-cache-persist`, bump `maxSize` from 1 MB (default) to `5 * 1024 * 1024`.

#### 5.3 Skeleton loader for drops (cold load)
- While `postsLoading && gridPosts.length === 0`, render 3 skeleton rows.
- Each skeleton row: a gray `View` with `opacity: 0.3` + an `Animated.loop(Animated.sequence([Animated.timing(opacity, 0.3 → 0.7), Animated.timing(opacity, 0.7 → 0.3)]))` pulse.
- Shape: thumbnail placeholder (120×80) + two text lines.
- Once data loads, swap to the real list with no flash.

#### 5.4 Kept posts — compact FlatList grid
- Replace the current full-card rendering in the Kept tab with a `FlatList numColumns={2}`.
- Each item (`KeptCard`): fixed height ~180px, `borderRadius: 12`, `overflow: "hidden"`, `margin: 5`.
- Image area: 120px tall, two thumbnails side-by-side (`flexDirection: "row"`) for binary posts; single image for multi with a `+N` badge.
- Info row: caption (1 line, truncated) + vote count + Open/Closed badge.
- Tapping → `navigation.navigate('PostDetail', { postId })`.

#### 5.5 Back button — goBack() instead of hardcoded route
In `mobile/app/post/[id].tsx` (PostDetail):
- Replace `navigation.navigate('Feed')` with `navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs')`.
- Label changes from "← Feed" to "← Back".

#### 5.6 Keep nav → Profile with tab param
- The bottom nav Kept icon currently navigates to the Kept tab directly.
- Update to navigate to the Profile tab with a param: `navigation.navigate('Profile', { tab: 'kept' })`.
- In `ProfileScreen`, read `route.params?.tab` (and `useFocusEffect`) to set the default active content tab.

#### 5.7 Profile header — interests as tag chips
- Read `me?.interests` (array from ME query, not from localStorage).
- Render below the bio as a horizontal `ScrollView` of small pill `View`s: `#tag` style (brand purple tint, small text, rounded).

### Test gate
- [ ] Second visit to Profile renders instantly (no blank flash) then quietly refreshes
- [ ] 3 skeleton rows appear briefly on first-ever load; replaced by real data
- [ ] Kept tab shows a 2-column grid of compact cards (not full FeedPostCards)
- [ ] Tapping a kept card → PostDetail; tapping ← Back → returns to Kept tab (not feed home)
- [ ] Bottom nav Kept icon → Profile screen, Kept tab auto-selected
- [ ] User's interests appear as `#tag` pills under the bio

---

## Phase 6 — Profile Connections (Social Graph)

**Goal:** Friends, incoming requests, sent requests, and suggestions all live inside the Profile screen. Cancel sent requests. Suggestions have server-side search.

**Files to touch:**
- `mobile/app/tabs/profile.tsx`
- `packages/shared/src/graphql/friends.ts`

### Tasks

#### 6.1 GraphQL — CANCEL_FRIEND_REQUEST mutation
Add `CANCEL_FRIEND_REQUEST` to `packages/shared/src/graphql/friends.ts`:
```graphql
mutation CancelFriendRequest($userId: ID!) {
  cancelFriendRequest(userId: $userId)
}
```

#### 6.2 Four connections subsections in Profile
Below the drops/kept tabs area, add a "Connections" section with four sub-lists.
Each rendered as a simple vertical list of rows:

**Friends list:**
- Avatar + displayName (tap → UserProfile)
- **Unfriend** ghost button (calls `unfriend`, refetches `MY_FRIENDS`)

**Friend Requests (incoming — `requestedMe`):**
- Avatar + displayName
- **Accept** (green pill) + **Reject** (rose outline)
- Hidden when empty

**Sent Requests (`requestedByMe`):**
- Avatar + displayName
- **PENDING** amber badge (small pill)
- **Cancel** ghost button (calls `cancelFriendRequest`, refetches)
- Hidden when empty

**Suggestions:**
- Avatar + displayName
- **Add** purple pill (calls `addFriend`)
- Hidden when empty

#### 6.3 Per-row loading state
Maintain an `actionLoadingIds: Set<string>`. Add the user id on mutation start, remove on complete. Render `ActivityIndicator` instead of the button label when `actionLoadingIds.has(userId)`.

#### 6.4 Suggestions — server-side search
- Add a search `TextInput` above the suggestions list.
- Debounce 300 ms; pass as `variables: { limit: 50, search: query }` to `FRIEND_SUGGESTIONS`.
- Clear the search query when navigating away from the Suggestions section.

### Test gate
- [ ] Profile screen shows all 4 connection sections
- [ ] Accepting a friend request moves the user to the Friends list
- [ ] Cancel button on a sent request removes it from the Sent Requests list
- [ ] Typing in suggestions search shows matching users from server (not just client filter)
- [ ] Each row shows a spinner while its action is in progress

---

## Phase 7 — Global Search Screen

**Goal:** A unified search entry point (people + posts) accessible from the top bar.

**Files to touch:**
- `mobile/app/tabs/index.tsx` (or `AppShell` equivalent)
- `mobile/app/search.tsx` (new screen or modal)
- `packages/shared/src/graphql/search.ts` (new)

### Tasks

#### 7.1 GraphQL — GLOBAL_SEARCH query
Create `packages/shared/src/graphql/search.ts`:
```graphql
query GlobalSearch($query: String!, $limit: Int) {
  globalSearch(query: $query, limit: $limit) {
    users { isFriend user { id username displayName profileImageUrl } }
    posts { id caption imageUrls options { label imageUrl } }
  }
}
```

#### 7.2 Search screen / modal
- Add a search icon button to the top bar (next to the bell).
- Tapping opens a full-screen search modal (or a dedicated `SearchScreen`).
- Input at the top with a magnifier icon. Auto-focus on open.
- Debounce 300 ms using `useEffect` + `setTimeout` + `clearTimeout`.
- Use `useLazyQuery(GLOBAL_SEARCH, { fetchPolicy: "no-cache" })`.

#### 7.3 Mixed results list
- Single `FlatList` — users first, then posts.
- **User row:** avatar + displayName + small `FRIEND` badge if `isFriend` + `@username` below name.
- **Post row:** first image thumbnail (`imageUrls[0]` or `options[0].imageUrl`) + caption (1 line) + "Post by {displayName}" below.
- Tap user → `navigation.navigate('UserProfile', { userId })`; close modal.
- Tap post → `navigation.navigate('PostDetail', { postId })`; close modal.
- Empty state: muted text "No results." when query is non-empty but results are empty.

### Test gate
- [ ] Tapping the search icon opens the search screen
- [ ] Typing "ab" shows users whose name contains "ab" (friends appear first)
- [ ] Typing part of a post caption shows matching posts
- [ ] Tapping a user row → navigates to their profile; search closes
- [ ] Tapping a post row → navigates to PostDetail

---

## Phase 8 — Create Post & Edit Post Enhancements

**Goal:** Create screen has a toggleable voting deadline. Posts can be edited after creation. Scheduled queue shows "Goes live at" time (not creation time).

**Files to touch:**
- `mobile/app/tabs/create.tsx`
- `mobile/app/profile/scheduled.tsx`
- `mobile/app/(new) edit-post.tsx`
- `packages/shared/src/graphql/feed.ts`

### Tasks

#### 8.1 Voting deadline — optional toggle
- Add a boolean `votingEndEnabled` state (default `false`).
- Render an iOS-style `Switch` labeled "Set voting deadline".
- When OFF: no `votingEndsAt` sent; voting is open indefinitely.
- When ON: reveal a native date-time picker (`@react-native-community/datetimepicker`).
- Validation: if enabled, the date must be set and must be in the future. Block submit otherwise.
- Toggling OFF clears the picked date.

#### 8.2 Category selector — REQUIRED styling
- Add a small "REQUIRED" badge (rose-tinted) next to the category label.
- Use `Picker` or `react-native-picker-select` with a card-style container.
- Error state when no category is selected on submit.

#### 8.3 Edit Post screen
New screen `mobile/app/edit-post.tsx`:
- Accepts `postId` as param.
- Fetches post data via `GET_POST_BY_ID`.
- Fields: `caption` (TextInput multiline), `categoryId` (Picker), per-item rows (thumbnail Image + URL TextInput + label TextInput).
- Min 2 items, max 10. Add/remove item buttons.
- On save: call `updatePost(postId, input)` mutation.
- Navigate back on success.

Add `UPDATE_POST` mutation to `packages/shared/src/graphql/feed.ts`:
```graphql
mutation UpdatePost($postId: ID!, $input: UpdatePostInput!) {
  updatePost(postId: $postId, input: $input) { id caption }
}
```

Add edit icon button (✏️) to each drop card in the Profile drops list → opens `EditPostScreen`.

#### 8.4 Scheduled queue card redesign
In `mobile/app/profile/scheduled.tsx`:
- Image resolution: try `imageUrls[0]` first; fall back to `options[0].imageUrl`.
- Show option label chips below the thumbnail.
- Countdown copy: **"Goes live in {relative}"** + **"Goes live at {datetime}"** — never show `createdAt` as relative time.
- Refresh countdown every 30 s with `setInterval`.

#### 8.5 Feed timestamp — prefer scheduledAt
In `FeedPostCard`, when rendering the post age:
- Use `post.scheduledAt ?? post.createdAt` for the timestamp displayed on published posts.

### Test gate
- [ ] Create screen: deadline toggle OFF → no date picker. Toggle ON → date picker appears
- [ ] Submitting without a date when toggle is ON shows a validation error
- [ ] Category field shows REQUIRED badge; submitting without category shows error
- [ ] Tapping edit ✏️ on a drop card → opens EditPostScreen pre-filled with data
- [ ] Saving edit → drop card reflects updated caption/category
- [ ] Scheduled queue shows "Goes live at [date]" not "X minutes ago"

---

## Phase 9 — Navigation Shell

**Goal:** Bottom nav gets a 5th Admin tab (admin-only), a Kept badge count, and the brand text is protected from shrinking.

**Files to touch:**
- `mobile/app/tabs/_layout.tsx`
- `mobile/components/` (TopBar or AppShell equivalent)

### Tasks

#### 9.1 Bottom nav — Admin tab (5th item, admin-only)
- Check if the authenticated user has `role === "admin"` or `roles.includes("admin")`.
- When true: add a 5th tab — `Admin` with a shield-checkmark icon (`Ionicons "shield-checkmark-outline"`).
- Route: existing `mobile/app/admin/index.tsx`.
- Icon has a small 6×6 accent dot overlay (signal for admin area, not an unread count).
- When false: 4-tab layout unchanged.

#### 9.2 Bottom nav — Kept badge count
- Query `MY_SAVED_POSTS` count (or read from cache).
- Show a purple badge number on the Kept/Bookmark tab icon when count > 0.
- Use `TabBarBadge` from expo-router or a custom overlay `View`.

#### 9.3 Top bar brand — never shrink
- Brand text container: add `flexShrink: 0` (RN `StyleSheet`).
- Brand text: `numberOfLines={1}` to prevent wrapping.
- Tagline text: `numberOfLines={1}`.
- This mirrors the web fix for "Ke Jitbe" clipping.

### Test gate
- [ ] Admin user sees 5 tabs; regular user sees 4 tabs
- [ ] Tapping Admin tab → Admin screen
- [ ] Kept tab shows a badge with the count of saved posts
- [ ] Brand text "Ke Jitbe" never wraps or clips on any screen width

---

## Phase 10 — Admin Features

**Goal:** Admin screens get full parity — proper pagination, category management, and moderator messaging.

**Files to touch:**
- `mobile/app/admin/index.tsx` (Users + Admin Management tabs)
- `mobile/app/admin/categories.tsx` (new)
- `mobile/app/admin/messages.tsx` (new, or expand existing)
- `packages/shared/src/graphql/admin.ts`

### Tasks

#### 10.1 Admin Users tab — proper pagination
- Pass `role: "user"` to `LIST_USERS` (excludes pure-admin accounts).
- Add `LIST_USERS_COUNT` query with same `role: "user"` filter.
- Compute `hasMore = skip + items.length < totalCount` for the Next button.
- Show "Showing 1–20 of 87" footer.
- Drop the client-side admin-filter logic.

#### 10.2 Admin Management tab — same pattern
- Pass `role: "admin"` to `LIST_USERS` + `LIST_USERS_COUNT`.
- Same pagination footer.
- Role pills: show both USER and ADMIN pills for dual-role accounts.

#### 10.3 Admin Categories screen
New screen `mobile/app/admin/categories.tsx`:
- Header: `TextInput` + "Add" button → calls `CREATE_CATEGORY`.
- `FlatList` of existing categories: name + slug + Edit / Delete buttons.
- Edit: inline row mode — replace Text with `TextInput` + Save / Cancel.
- Delete: `Alert.alert` confirm dialog → calls `DELETE_CATEGORY`. Surface the conflict message if the category is in use.
- Add mutations to `packages/shared/src/graphql/admin.ts`: `CREATE_CATEGORY`, `UPDATE_CATEGORY`, `DELETE_CATEGORY`.
- Add to the Admin tab navigator.

#### 10.4 Admin Moderator Messages — thread list
New screen (or tab) `mobile/app/admin/messages.tsx`:
- Screen 1 (Thread list): `FlatList` of users who have had moderator conversations. Search `TextInput`. Unread count badge per row.
- Screen 2 (Chat): flat message list, amber/gold bubbles for moderator messages, gray bubbles for user replies. Chat input: 📷 attach + text field + Send.
- Screen 3 (Recipient picker): search `TextInput` + checkbox `FlatList`. Uses `listUsers(role: "member")` — includes regular users AND admin+user dual-role.
- Branding constant: `MODERATOR_BRAND_NAME = "Ke Jitbe Moderator"`. Use app logo for avatar.
- Wire `SEND_MODERATOR_MESSAGES` mutation + `adminModeratorUserMessage` subscription.

#### 10.5 User-side moderator message styling
In the regular Messages/Chat screen (`mobile/app/tabs/messages.tsx`):
- Detect `conversation.type === "moderator"`.
- Render the app logo as avatar instead of a user avatar.
- Thread header: "Ke Jitbe Moderator" + **Official** tag.
- Moderator message bubbles: amber/gold background (`#f59e0b`) instead of gray.
- Pinned at top of thread list.

#### 10.6 Moderator notifications
In the notification handler:
- `referenceType === "moderator_conversation"` → navigate to the moderator chat screen.
- Bell row: 🛡 icon + **Important** chip + amber highlight.
- Sound: use `messageSoundId` preset sound.

### Test gate
- [ ] Admin → Users tab shows only non-admin users with correct pagination ("Showing 1–N of Total")
- [ ] Admin → Admin Management shows admin users with dual-role pills
- [ ] Admin → Categories: can create, rename, and delete a category
- [ ] Deleting a category with posts in it shows an error message
- [ ] Admin can send a message as "Ke Jitbe Moderator" to a user
- [ ] User sees amber chat bubble and "Ke Jitbe Moderator" thread pinned at top
- [ ] Moderator message notification has 🛡 icon; tapping opens the chat

---

## Phase 11 — Sound Preferences

**Goal:** Per-user sound preferences (vote, notification, message) persisted to the backend and applied on every login.

**Files to touch:**
- `packages/shared/src/graphql/profile.ts`
- `mobile/app/profile/sounds.tsx` (new)
- Mobile audio utility

### Tasks

#### 11.1 ME query — include sound preference fields
Add to `ME` query selection:
```graphql
voteSoundId
notificationSoundId
messageSoundId
```
Add to `UPDATE_PROFILE` mutation input variables.

#### 11.2 Sound presets catalog
Mirror the web preset IDs. Minimum required sets:
- **Vote sounds:** `buzz-in`, `tick-pop-thump`, (+ others from `notificationSound.ts`)
- **Bell sounds:** `ascending-chime`, (+ others)
- **Message sounds:** `gentle-ping`, (+ others)

Store preset audio files in `mobile/assets/sounds/`.

#### 11.3 Sound preferences screen
New screen `mobile/app/profile/sounds.tsx`:
- 3-tab layout (using a simple `TouchableOpacity` tab row or `TabView`):
  - **Vote** — cards of vote sound presets
  - **Bell** — bell sound presets
  - **Messages** — message sound presets
- Each card: sound name + Preview button (plays sample) + selected state (accent border + checkmark).
- Selecting a card: calls `updateProfile({ voteSoundId: id })` (or bell/message equivalent) and saves locally.
- Load current prefs from `me.voteSoundId` etc. on mount.

#### 11.4 Apply preferences on login + before first sound
- On login, fetch `ME` and store the sound preference IDs.
- Before playing vote/notification/message sounds, look up the stored preference ID and play the correct asset.

#### 11.5 Link to sound screen from Profile
- Add a "Sound preferences" row in the Profile edit area or settings section.
- Navigates to `mobile/app/profile/sounds.tsx`.

### Test gate
- [ ] Profile → Sound preferences → 3 tabs visible
- [ ] Tapping Preview on a vote sound plays it
- [ ] Selecting a bell sound → refresh the app → new sound plays on next notification
- [ ] Sound preference is persisted across app restarts (loaded from `ME` query)

---

## Quick-reference: backend changes already live (no mobile code needed)

These are server-side fixes that the mobile app inherits automatically — **no action required:**
- Hype on system/admin posts fixed (likesDisabled backfill)
- Scheduled posts no longer appear in the main feed
- System posts now notify all users (`ANNOUNCEMENT`)
- Comment notifications backend wiring (`POST_COMMENT`, `COMMENT_REPLY`, `COMMENT_REACTION`)
- `cancelFriendRequest` mutation is live
- `updatePost` mutation is live
- `globalSearch` query is live
- `viewerHasHyped` field is live
- `myVoteAnonymous` field is live
- Sound preference fields (`voteSoundId` etc.) are live
- Category CRUD mutations are live
- Moderator messages backend is live
- `postId` on notifications is live
- `listUsersCount` pagination query is live

---

## Phase dependency map

```
Phase 1 (Feed foundation) ──► Phase 2 (Grid + vote UX)
                          ──► Phase 3 (Comments) ──► Phase 4 (Notifications)
                          ──► Phase 5 (Profile core) ──► Phase 6 (Connections)
                                                    ──► Phase 8 (Create/Edit)
Phase 7 (Global search) — independent, no deps
Phase 9 (Nav shell) — independent
Phase 9 ──► Phase 10 (Admin features)
Phase 10 ──► Phase 11 (Sound preferences)  [sound prefs accessible from profile]
```

Start Phase 1. Phases 2, 3, 5, 7, and 9 can be parallelized after Phase 1 is complete.

---

## Estimated complexity per phase

| Phase | Complexity | New screens | Key blocker |
|-------|-----------|-------------|-------------|
| 1 | Low | 0 | None — wire existing backend fields |
| 2 | Medium | 0 | Grid layout math + toggle design |
| 3 | Medium | 0 | Thread builder + emoji row UI |
| 4 | Medium | 0 | Sound file needed; subscription dedup logic |
| 5 | Medium | 1 (KeptCard) | Animated skeleton |
| 6 | Medium | 0 | 4 list sections in Profile |
| 7 | Medium | 1 (Search) | New GQL file |
| 8 | High | 1 (EditPost) | Native date picker + form validation |
| 9 | Low | 0 | Conditional tab count |
| 10 | High | 3 (Categories, AdminMsg, Chat) | Moderator chat UI |
| 11 | Medium | 1 (Sounds) | Audio asset management |
