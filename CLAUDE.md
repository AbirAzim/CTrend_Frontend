## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Project Overview

**CTrend** is a social comparison platform — "Compare · vote · vibe". Users post side-by-side image comparisons, others vote on options, and results show live percentages. Think Instagram-style feed with polling.

- **Stack**: React 19, TypeScript, Vite, Apollo Client, React Router v7
- **Backend**: GraphQL API (HTTP + WebSocket subscriptions via `graphql-ws`)
- **Auth**: Email/password + Google OAuth (`@react-oauth/google`)

---

## Environment Setup

Copy `.env.example` to `.env` and set:

```
VITE_GRAPHQL_HTTP=http://localhost:4000/graphql   # HTTP GraphQL endpoint
VITE_GRAPHQL_WS=ws://localhost:4000/graphql       # WebSocket endpoint for subscriptions
```

The app throws at startup if `VITE_GRAPHQL_HTTP` is missing.

---

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check + Vite production build
npm run lint      # ESLint
npm run preview   # Preview production build locally
```

---

## Architecture

### Directory Structure

```
src/
  components/     # Reusable UI components
  context/        # React context (AuthContext)
  data/           # Static mock data
  graphql/        # Apollo GQL queries/mutations/subscriptions
  layouts/        # Route layouts (AppShell)
  lib/            # Pure utility/helper modules
  pages/          # Route-level page components
  types/          # Shared TypeScript types
```

### Key Communities (from graph analysis)

| Community | Files | Role |
|---|---|---|
| `pages` | `FeedPage`, `ProfilePage`, `CreatePostPage`, `PostDetailPage`, `FriendsPage`, `LoginPage`, `SignupPage` | Route-level views |
| `components` | `FeedPostCard`, `IgIcons`, `ProtectedRoute` | Reusable UI |
| `lib` | `apolloClient`, `authStorage`, `mapGqlPostToFeedView`, `apolloErrorMessage`, `formatRelativeTime`, `postPermalink`, `mockFeedAdapter` | Utilities |
| `context` | `AuthContext` | Auth state |
| `layouts` | `AppShell` | Chrome/nav shell |

### Auth Flow

- Session stored in `localStorage` via `src/lib/authStorage.ts` (keys: `ctrend_access_token`, `ctrend_user`)
- `AuthContext` (`src/context/AuthContext.tsx`) hydrates from localStorage on mount, exposes `setSession`, `patchUser`, `logout`
- `ProtectedRoute` (`src/components/ProtectedRoute.tsx`) wraps routes that require auth — redirects to `/login` if unauthenticated
- Apollo client (`src/lib/apolloClient.ts`) reads the stored token and injects `Authorization: Bearer <token>` on every request

### Apollo Client

- HTTP and WebSocket links are split: subscriptions go over `VITE_GRAPHQL_WS`, queries/mutations over `VITE_GRAPHQL_HTTP`
- Auth token is injected via `setContext` link for HTTP and via `connectionParams` for WebSocket

### GraphQL Modules

| File | Operations |
|---|---|
| `graphql/auth.ts` | `LOGIN`, `SIGNUP`, `GOOGLE_LOGIN` |
| `graphql/feed.ts` | `FEED_POSTS`, `GET_POST_BY_ID`, `VOTE_POST`, `CREATE_POST`, `CATEGORIES`, `EXTEND_POST_VOTING`, `POST_VOTE_UPDATED` (subscription) |
| `graphql/friends.ts` | `ADD_FRIEND`, `MY_FRIENDS`, `FRIEND_SUGGESTIONS`, `FRIEND_REQUESTS`, `RESPOND_FRIEND_REQUEST` |
| `graphql/comments.ts` | Comment mutations |
| `graphql/profile.ts` | Profile queries/mutations |

### Feed / Voting Data Model

- `FeedPostView` (`src/types/feed.ts`) is the canonical view-layer type — built by `mapGqlPostToFeedView`
- Posts support binary votes (`UP`/`DOWN`) and multi-option votes (`mySelectedOptionIndex`, `optionStats`)
- `FeedPostCard` handles optimistic updates for both vote types via `applyOptimisticBinaryVote` / `applyOptimisticMultiVote`
- Real-time vote updates come via `POST_VOTE_UPDATED` subscription

### AppShell

- Top bar + bottom nav (3-tab: Home, Create, Profile)
- Home icon taps: scrolls to top if already on feed, dispatches `ctrend:refresh-feed` custom event if at top
- Bottom nav redirects unauthenticated users to `/login` for protected tabs

---

## Patterns & Conventions

- **Error handling**: all Apollo errors go through `getApolloErrorMessage` (`src/lib/apolloErrorMessage.ts`) — use it consistently, never raw `error.message`
- **Mock data**: `src/data/mockFeed.ts` + `src/lib/mockFeedAdapter.ts` used as fallback/demo when API is unavailable
- **Relative time**: use `formatRelativeTime` from `src/lib/formatRelativeTime.ts`
- **Post permalinks**: use `postPermalink` from `src/lib/postPermalink.ts`
- **No test suite** exists yet — verify features manually in browser
- **CSS classes**: follow the `ig-*` BEM-like naming convention already established in the codebase
- **No Tailwind** — plain CSS with `ig-*` class names

---

## CI / Lint Rules (ESLint — errors block deploy)

Always run `npm run lint` before committing. The CI runs lint and fails on any **error** (exit code 1).

- **`prefer-const`**: use `const` for any variable that is never reassigned after declaration. Using `let` for such variables is a lint **error**. This caught `let rem = ...` in `FeedPostCard.tsx` — it was read-only and should have been `const`.
- **`react-hooks/exhaustive-deps`** and **`react-refresh/only-export-components`**: currently warnings, not errors — safe to leave but worth cleaning up over time.
