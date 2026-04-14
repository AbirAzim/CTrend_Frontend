# Backend requirements (CTrend frontend)

This document describes what the **GraphQL API** should expose and how it should behave so the current frontend (`login`, `signup`, Google sign-in, protected home) works end-to-end.

## Endpoint

- **URL**: Same as today, e.g. `http://localhost:4000/graphql` (POST, JSON body).
- **CORS**: Allow the frontend origin (e.g. `http://localhost:5173`). If the browser sends `Authorization: Bearer …`, allow that header in preflight (`Access-Control-Allow-Headers`).
- **Credentials**: The frontend uses `credentials: "include"` on the GraphQL HTTP link. If you use **cookies** for sessions, set `Access-Control-Allow-Credentials: true` and use a **specific** `Access-Control-Allow-Origin` (not `*`).

## Auth: Bearer token (required for this frontend)

After successful `login`, `signup`, or `googleLogin`, the client stores `accessToken` in `localStorage` and sends:

```http
Authorization: Bearer <accessToken>
```

on subsequent GraphQL requests.

The backend should:

1. Validate the JWT (or opaque token) on protected resolvers.
2. Return `401` / GraphQL errors with appropriate extensions when the token is missing or invalid.

If you prefer **cookie-only** sessions instead of `Authorization`, say so—the frontend can be switched to stop sending Bearer and rely only on cookies.

## GraphQL schema (contract)

Implement these **mutations** and **types** (names and shapes should match; if your stack uses different names, add field aliases or a thin resolver layer).

### Error: `Cannot query field "googleLogin" on type "Mutation"`

That message means the **GraphQL schema your server publishes does not define** `googleLogin` on `Mutation` (or the resolver is not registered, so the field never appears in the built schema).

**You must do all of the following on the backend:**

1. **Declare the field in the schema** — `googleLogin(idToken: String!): AuthPayload!` must exist on `Mutation` (see SDL below).
2. **Implement the resolver** — a function that receives `idToken`, verifies it with Google, finds or creates the user, and returns `AuthPayload`.
3. **Rebuild / restart** the server so introspection and clients see the new field.

If you only implemented email/password auth so far, **`googleLogin` is an additional mutation** — it will not appear until you add it explicitly.

**Schema-first (e.g. Apollo Server + `.graphql` file):** merge or import a definition like:

```graphql
type Mutation {
  # ...existing mutations...
  googleLogin(idToken: String!): AuthPayload!
}
```

(or use `extend type Mutation { googleLogin(...) }` if your root `Mutation` is assembled from modules.)

**Code-first (e.g. NestJS `@nestjs/graphql`, TypeGraphQL):** add a mutation method named **`googleLogin`** (exact name) on your mutations resolver class, with an argument **`idToken`** (or map with `@Args('idToken')`), returning the same shape as `login` / `signup`. The generated schema must expose `googleLogin`, not e.g. `signInWithGoogle`, unless you change the frontend to match.

**Quick verification:** open GraphQL Playground / Apollo Sandbox / `curl` introspection and confirm `__schema.types` includes `Mutation` with field `googleLogin`, or run the mutation document from `frontend/src/graphql/auth.ts` against your server.

### Types

```graphql
type User {
  id: ID!
  email: String!
  displayName: String
}

type AuthPayload {
  accessToken: String!
  refreshToken: String
  user: User!
}
```

- **`refreshToken`**: Optional. The current frontend does **not** implement refresh; you can omit it or return `null`. If you add refresh later, document the mutation (e.g. `refreshToken`) and we can wire it in.

### Mutations

```graphql
extend type Mutation {
  login(email: String!, password: String!): AuthPayload!
  signup(
    email: String!
    password: String!
    displayName: String
  ): AuthPayload!
  googleLogin(idToken: String!): AuthPayload!
}
```

#### `login`

- Validate email + password.
- On failure: GraphQL error with a safe message (e.g. “Invalid email or password”).
- On success: issue `accessToken` and return `user` (id, email, displayName).

#### `signup`

- Create user, hash password server-side (e.g. bcrypt/argon2).
- Enforce password policy (frontend only enforces min length 8).
- If email already exists: GraphQL error (e.g. “Email already registered”).
- On success: same as `login` (return tokens + user). Optionally auto-verify email later—document if sign-in is blocked until verified.

#### `googleLogin`

- Input `idToken` is a **Google ID token (JWT)** from [Sign in with Google](https://developers.google.com/identity/gsi/web) (what the frontend sends from `@react-oauth/google`).
- On the server:
  1. Verify the token with Google (using your Google client ID / JWKS, e.g. official Google auth libraries for your language).
  2. Read `sub`, `email`, `email_verified`, `name`, `picture` as needed.
  3. **Find or create** the user linked to that Google account (`sub` is the stable id).
  4. Return the same `AuthPayload` shape as email/password login.

**Resolver outline (language-agnostic)**

1. Receive `idToken: string`.
2. Call Google’s token verification (e.g. Node: `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })`).
3. If verification fails → throw a GraphQL error (e.g. “Invalid Google token”) with **HTTP 200** if possible (recommended GraphQL style); if your framework returns **400**, the frontend will still show the error message.
4. Upsert user by `sub` (and optionally sync email/name).
5. Issue the same `accessToken` (and optional `refreshToken`) as `login` / `signup`.
6. Return `{ accessToken, refreshToken, user }`.

**Security notes**

- Verify **audience** (`aud`) matches your Google **Web client ID** (the same value as frontend `VITE_GOOGLE_CLIENT_ID`).
- Verify **issuer** (`iss`) and token expiry (`exp`).
- Prefer linking by Google `sub`, not by email alone, unless you have a clear account-linking policy.

**Environment (backend only, not in Vite)**

- `GOOGLE_CLIENT_ID` — same Web client ID as the frontend (used as `audience` when verifying the ID token).
- Client **secret** is **not** required for verifying ID tokens from the GIS button; only add secret-related config if you implement a separate OAuth **authorization-code** flow.

## Google Cloud Console

Create an OAuth **Web application** client:

- **Authorized JavaScript origins**: e.g. `http://localhost:5173` (and production frontend URL).
- **Authorized redirect URIs**: not required for the ID-token button flow used by `@react-oauth/google`, but add any redirect URIs if you use other flows.

Share the **Client ID** with the frontend (env: `VITE_GOOGLE_CLIENT_ID`). The **Client secret** must **never** ship in the frontend; only the backend uses it if you add server-side OAuth code exchange (not required for `googleLogin(idToken)` as specified above).

## Password and user fields

- **Email**: normalize (trim, lowercase) consistently.
- **Password**: never store plain text; use a strong hash and per-password salt (library defaults).
- **`displayName`**: optional on signup; can map from Google `name` for `googleLogin`.

## Feed posts & voting (real data for the home feed)

The frontend loads the home feed with the **`feedPosts`** query and sends votes with **`votePost(postId, selectedOptionIndex)`** (CTrend API). Without these, the feed stays empty (unless `VITE_USE_MOCK_FEED=true` for local demo data).

### Types

```graphql
type FeedPost {
  id: ID!
  authorUsername: String!
  authorDisplayName: String
  imageUrls: [String!]!
  caption: String
  createdAt: String
  upvoteCount: Int!
  downvoteCount: Int!
  """Legacy A/B label for the viewer’s choice when there are two options."""
  viewerVote: String
  mySelectedOptionIndex: Int
  optionStats: [VoteOptionStat!]!
}

type VoteOptionStat {
  index: Int!
  label: String!
  count: Float!
  percentage: Float!
}
```

- **`viewerVote`**: For two-option posts, legacy string `up` / `down` (or `UP` / `DOWN`) for the viewer’s side; otherwise `null`. For three or more options, prefer **`mySelectedOptionIndex`** (0-based); `viewerVote` may not distinguish options beyond the second.
- **`mySelectedOptionIndex` / `optionStats`**: Returned by the CTrend API for accurate multi-option tallies and UI.
- **`createdAt`**: ISO-8601 string recommended so the client can show relative time.

### Query

```graphql
extend type Query {
  feedPosts: [FeedPost!]!
}
```

- Return posts in feed order (e.g. newest first).
- **Auth**: Either allow public read, or require a valid Bearer token—match your product rules. The vote mutation should use the same identity as `viewerVote`.

### Mutation

```graphql
extend type Mutation {
  """
  Record or change the viewer’s vote for one option (0-based index).
  CTrend returns aggregated stats; the client refetches `feedPosts` after success.
  """
  votePost(postId: ID!, selectedOptionIndex: Int!): VoteResult!
}
```

**Behaviour the frontend expects**

1. Caller must be authenticated (Bearer token) so you know who is voting.
2. **`selectedOptionIndex`** must be valid for the post’s option list (`0` … `n-1`).
3. Re-voting the **same** index may be a no-op; switching indices updates the stored choice (see your `VotesService` rules).
4. Response should include enough data to refresh tallies, or the client will **refetch `feedPosts`** (current frontend refetches after `votePost`).

**Security**

- One row (or equivalent) per `(userId, postId)` for votes.
- Validate `postId` exists; ignore or error on duplicate votes consistent with the rules above.

### Frontend env

- **`VITE_USE_MOCK_FEED`**: If `true`, the UI uses built-in demo posts and **local-only** votes (nothing is sent to the API). Use for UI work without a backend. For **real data**, omit it or set to `false` and implement `feedPosts` + `votePost`.

## Optional follow-ups (not in the frontend yet)

- **Refresh tokens** + `refreshToken` mutation.
- **`me` query** returning `User` from the Bearer token (useful for profile UI).
- **Email verification** and **password reset** flows.
- **Rate limiting** on `login` / `signup` / `googleLogin`.
- **Stories** API (the UI currently derives a simple story strip from unique authors in `feedPosts`, or uses demo stories in mock mode).

## Questions for the backend owner

1. Will you use **JWT** for `accessToken`? If yes, what signing algorithm and expiry?
2. Do you need **httpOnly cookies** instead of (or in addition to) Bearer tokens?
3. Exact GraphQL path: still `/graphql` only, or also subscriptions/file upload?

Once **auth** mutations, **`feedPosts`**, and **`votePost`** exist—and CORS + token validation are configured—the current frontend should work for login/signup, Google sign-in, feed, and voting as described here.
