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

**Security notes**

- Verify **audience** (`aud`) matches your Google **Web client ID** (the same value as frontend `VITE_GOOGLE_CLIENT_ID`).
- Verify **issuer** (`iss`) and token expiry (`exp`).
- Prefer linking by Google `sub`, not by email alone, unless you have a clear account-linking policy.

## Google Cloud Console

Create an OAuth **Web application** client:

- **Authorized JavaScript origins**: e.g. `http://localhost:5173` (and production frontend URL).
- **Authorized redirect URIs**: not required for the ID-token button flow used by `@react-oauth/google`, but add any redirect URIs if you use other flows.

Share the **Client ID** with the frontend (env: `VITE_GOOGLE_CLIENT_ID`). The **Client secret** must **never** ship in the frontend; only the backend uses it if you add server-side OAuth code exchange (not required for `googleLogin(idToken)` as specified above).

## Password and user fields

- **Email**: normalize (trim, lowercase) consistently.
- **Password**: never store plain text; use a strong hash and per-password salt (library defaults).
- **`displayName`**: optional on signup; can map from Google `name` for `googleLogin`.

## Optional follow-ups (not in the frontend yet)

- **Refresh tokens** + `refreshToken` mutation.
- **`me` query** returning `User` from the Bearer token (useful for profile UI).
- **Email verification** and **password reset** flows.
- **Rate limiting** on `login` / `signup` / `googleLogin`.

## Questions for the backend owner

1. Will you use **JWT** for `accessToken`? If yes, what signing algorithm and expiry?
2. Do you need **httpOnly cookies** instead of (or in addition to) Bearer tokens?
3. Exact GraphQL path: still `/graphql` only, or also subscriptions/file upload?

Once these mutations exist and CORS + token validation are configured, the current frontend should work without further backend changes for the auth flows described here.
