# CTrend — Session Changes Summary

## 1. Android WebView Performance Fixes

### Problem
The Capacitor Android release build had a laggy, jittery feed scroll due to multiple root causes in the build config and React code.

### Fixes Applied

#### `vite.config.ts` — Code Splitting
Split the single 688KB JS monolith into parallel-parsed chunks:
```
Before: index.js = 688KB (single chunk)
After:
  vendor-react.js  =  42KB  (React + Router — cached across deploys)
  vendor-apollo.js = 228KB  (Apollo + GraphQL)
  index.js         = 432KB  (app code)
```

#### `android/app/src/main/AndroidManifest.xml` — GPU Acceleration
Added `android:hardwareAccelerated="true"` to `<application>` tag.
Without this, Android draws the WebView entirely on the CPU.

#### `android/app/build.gradle` — R8 Optimization
```groovy
// Before
minifyEnabled false

// After
minifyEnabled true
shrinkResources true
```
Enables R8 dead-code elimination and resource shrinking on release builds.

#### `src/index.css` — Fix Scroll Jitter
```css
/* Before */
contain-intrinsic-size: 560px;

/* After — 'auto' lets browser remember real rendered height */
contain-intrinsic-size: auto 860px;

/* Added GPU layer hint to scroll container */
will-change: scroll-position;
```
The 560px estimate vs ~800px actual card height caused scrollbar jumping as cards entered the viewport. `auto` keyword fixes this.

#### `src/components/FeedPostCard.tsx` — Remove Aggressive Refetches
Every like (♥) and save (🔖) tap was firing a full `FEED_POSTS` network refetch:
```ts
// Removed from handleToggleHype:
await apolloClient.refetchQueries({ include: [FEED_POSTS, GET_POST_BY_ID] });

// Removed from handleToggleKeep:
await apolloClient.refetchQueries({ include: [FEED_POSTS, GET_POST_BY_ID, MY_SAVED_POSTS] });
```
Optimistic UI already handles the display — the refetch was unnecessary and caused network spam on every interaction.

#### `src/components/FeedPostCard.tsx` — `decoding="async"` on Images
Added `decoding="async"` to all `<img>` tags (author avatar, compare images, single image).
This moves image decode off the main thread, preventing jank during scroll-into-view.

#### `src/pages/FeedPage.tsx` — Cache-First for Auxiliary Queries
Changed 4 non-volatile queries from `cache-and-network` to `cache-first`:
- `MY_FRIENDS`
- `FRIEND_REQUESTS`
- `FRIEND_SUGGESTIONS`
- `ME`

On tab-switch re-mount, these now load from cache instantly (0ms) instead of
firing a network request and double-rendering. Manual `refetch()` calls in
`onAddFriend`/`onRespondRequest` and the `ctrend:refresh-feed` event still
force fresh data when needed.

---

## 2. React Native Expo Monorepo Migration

### Architecture

Transformed the project into an npm workspaces monorepo:

```
CTrend_Frontend/
├── package.json              ← workspace root (web app + mobile)
├── packages/
│   └── shared/               ← shared pure TypeScript (no DOM, no RN)
│       └── src/
│           ├── types/
│           │   ├── feed.ts   ← FeedPostView, VoteDirectionGql, etc.
│           │   └── user.ts   ← StoredUser type
│           ├── graphql/      ← all GQL operations (auth, feed, friends, etc.)
│           └── lib/
│               ├── apolloErrorMessage.ts
│               ├── formatRelativeTime.ts
│               ├── mapGqlPostToFeedView.ts
│               └── profileImageUrl.ts
├── mobile/                   ← Expo SDK 56, React Native 0.85
│   ├── app/                  ← Expo Router v4 (file-based routing)
│   │   ├── _layout.tsx       ← Root: ApolloProvider + AuthProvider + SafeAreaProvider
│   │   ├── +not-found.tsx
│   │   ├── auth/
│   │   │   ├── _layout.tsx
│   │   │   ├── login.tsx     ← Login screen (email/password)
│   │   │   └── signup.tsx    ← Signup screen
│   │   ├── tabs/
│   │   │   ├── _layout.tsx   ← Bottom tab navigator (Feed | Create | Profile)
│   │   │   ├── index.tsx     ← Feed screen (FlatList)
│   │   │   ├── create.tsx    ← Create screen (placeholder)
│   │   │   └── profile.tsx   ← Profile screen (me query + logout)
│   │   └── post/
│   │       └── [id].tsx      ← Post detail screen
│   ├── components/
│   │   └── FeedPostCard.tsx  ← Native card (expo-image, vote logic, subscriptions)
│   ├── context/
│   │   └── AuthContext.tsx   ← Async AsyncStorage version
│   ├── lib/
│   │   ├── apolloClient.ts   ← Apollo v4 config (no proxy, no localStorage)
│   │   ├── authStorage.ts    ← AsyncStorage (async read/write, same interface)
│   │   ├── apolloErrorMessage.ts  ← v4-compatible (duck typing, no ApolloError class)
│   │   └── postPermalink.ts  ← Uses expo-linking instead of window.location
│   ├── metro.config.js       ← Monorepo watchFolders + nodeModulesPaths
│   ├── babel.config.js       ← module-resolver: @ctrend/shared → ../packages/shared/src
│   ├── tsconfig.json         ← paths alias for @ctrend/shared
│   ├── app.json              ← Expo config (scheme: ctrend, package: com.ctrend.app)
│   └── .env                  ← EXPO_PUBLIC_GRAPHQL_HTTP / EXPO_PUBLIC_GRAPHQL_WS
└── src/                      ← Web app — unchanged, still builds
```

### Key Technical Decisions

| Decision | Reason |
|----------|--------|
| **Expo Router v4** | File-based routing like Next.js — no manual navigator setup |
| **`expo-image`** | Glide-backed on Android — GPU decode, `memory-disk` cache, no extra native config |
| **`FlatList`** | True RecyclerView virtualization — only renders visible cards at 60fps |
| **Apollo v4 in mobile** | npm resolved v4 (latest); hooks moved to `@apollo/client/react` |
| **Apollo v3 in web** | Web stays on v3 — no migration needed, separate install |
| **Async `AuthContext`** | `AsyncStorage` is always async — `hydrated` flag prevents premature login redirect |
| **Duck-typed `apolloErrorMessage`** | Apollo v4 removed the `ApolloError` class — uses property checks instead |
| **`@ctrend/shared` via babel** | Metro's `module-resolver` plugin resolves the alias before bundling |

### FlatList Performance Settings
```tsx
<FlatList
  initialNumToRender={4}       // Only render 4 cards on first frame
  maxToRenderPerBatch={4}      // Render 4 cards per JS batch
  windowSize={7}               // Keep 7 screen-heights of cards in memory
  removeClippedSubviews={true} // Detach off-screen views from the native tree
  updateCellsBatchingPeriod={50}
/>
```

### What's Different on Mobile vs Web

| Concern | Web | Mobile |
|---------|-----|--------|
| Storage | `localStorage` (sync) | `AsyncStorage` (async) |
| Apollo hooks | `@apollo/client` | `@apollo/client/react` |
| Error type | `instanceof ApolloError` | Duck-typing (`graphQLErrors` check) |
| Images | `<img loading="lazy" decoding="async">` | `<Image cachePolicy="memory-disk">` (expo-image) |
| Navigation | React Router v7 | Expo Router v4 |
| Env vars | `VITE_GRAPHQL_HTTP` | `EXPO_PUBLIC_GRAPHQL_HTTP` |
| Scroll | DOM scroll + `content-visibility: auto` | `FlatList` RecyclerView |
| Permalinks | `window.location.origin` | `expo-linking` deep links |
| Post-login redirect | `router.replace` (react-router) | `router.replace("/")` (expo-router) |

---

## 3. How to Run

### Web app
```bash
npm run dev          # dev server
npm run build        # production build (Vite + tsc)
```

### Mobile app
```bash
# 1. Fill in mobile/.env
EXPO_PUBLIC_GRAPHQL_HTTP=https://your-backend.com/graphql
EXPO_PUBLIC_GRAPHQL_WS=wss://your-backend.com/graphql

# 2. Start
cd mobile
expo start --android         # Expo Go (for quick testing)
expo run:android             # Full native build (first time or after native changes)
```

---

## 4. What's Left to Build (Mobile)

| Feature | Where |
|---------|-------|
| Create post (image picker) | `mobile/app/tabs/create.tsx` — use `expo-image-picker` |
| Comments on post detail | `mobile/app/post/[id].tsx` — add comment list + form |
| Friends list | `mobile/app/tabs/profile.tsx` — add friends section |
| Google Sign-In | `@react-native-google-signin/google-signin` + `google-services.json` |
| Push notifications | `expo-notifications` plugin |
| Offline cache persistence | `apollo3-cache-persist` with `AsyncStorageWrapper` |
