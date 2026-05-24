# CTrend Frontend — Admin System & Invitation Flow Migration Guide

> This document is a Claude prompt. Paste it into Claude Code inside the frontend project to implement all required UI changes.

---

## Context

The CTrend backend has been updated with an admin user system, an email-invitation flow, and a change to how user posts are displayed. This guide describes every change the frontend needs to adopt.

---

## 1. New User Roles

`UserRole` now has two values that matter to the frontend:

| Value | Meaning |
|-------|---------|
| `"user"` | Regular user — posts visible to followers only |
| `"admin"` | Admin — posts visible to all users on the platform |

The `role` field is already present on the `User` GraphQL type returned by `me`, `login`, `signup` verify, `acceptInvitation`, and `googleLogin`. Use it to conditionally render admin UI.

```graphql
query Me {
  me {
    id
    email
    username
    displayName
    role        # "user" | "admin"
    bio
    profileImageUrl
    interests
  }
}
```

---

## 2. Feed Visibility Change

**Normal user posts are now friends-only.** The feed behavior has changed:

| Feed scope | What you see |
|------------|-------------|
| `GLOBAL` | Admin (SYSTEM) posts + organization GLOBAL posts only |
| `PERSONALIZED` | Your own posts + posts from users you follow + org posts |

**What this means for the frontend:**
- The global/explore feed no longer shows regular user posts from strangers.
- To see content from a user, you must follow them.
- Admin posts always appear for everyone.
- The "explore" / "discover" UX should encourage following users rather than browsing public posts.

---

## 3. New Route: `/accept-invitation`

Add a new page at `/accept-invitation` that reads the `?token=` query parameter and lets the invited user set their password and optional display name.

### Mutation

```graphql
mutation AcceptInvitation($token: String!, $password: String!, $displayName: String) {
  acceptInvitation(token: $token, password: $password, displayName: $displayName) {
    accessToken
    user {
      id
      email
      username
      displayName
      role
    }
  }
}
```

### Page logic

1. On mount, read `token` from the URL query string. If missing, show an error ("Invalid invitation link").
2. Show a form with:
   - **Display name** (optional text input)
   - **Password** (required, min 8 characters)
   - **Confirm password** (client-side validation only)
3. On submit, call `acceptInvitation`. On success, store the `accessToken` and redirect to the home feed (same as after login).
4. Handle errors:
   - `"Invalid or expired invitation link"` → Show "This invitation has expired or is no longer valid."
   - `"An account with this email already exists"` → Show "An account already exists for this email. Please log in."
   - `"Password must be at least 8 characters"` → Inline form validation.

---

## 4. Invitation Mutations (Authenticated Users)

### Any logged-in user — invite someone as a regular user

```graphql
mutation InviteUser($email: String!) {
  inviteUser(email: $email)
}
```

Returns `true` on success. An invitation email is sent to the target address.

**UI placement:** A "Invite a Friend" button/modal in the user's profile or settings page.

### Admin only — invite someone as an admin

```graphql
mutation InviteAdmin($email: String!) {
  inviteAdmin(email: $email)
}
```

Only render this option when `me.role === "admin"`.

**UI placement:** Admin dashboard → "Admin Management" → "Invite Admin" button.

### Error handling for both invite mutations

| Error | Display message |
|-------|----------------|
| `"A user with this email already exists"` | "This email is already registered on CTrend." |
| `"Only admins can invite other admins"` | (Should not happen if UI is role-gated, but handle gracefully.) |

---

## 5. Admin: List All Users

```graphql
query ListUsers($skip: Int, $take: Int) {
  listUsers(skip: $skip, take: $take) {
    id
    email
    username
    displayName
    role
  }
}
```

Only available when the viewer is an admin (`me.role === "admin"`). Returns up to 200 users per request. Implement basic pagination with `skip` / `take`.

---

## 6. Admin: Remove Users

### Remove a regular user

```graphql
mutation RemoveUser($email: String!) {
  removeUser(email: $email)
}
```

Returns `true` on success. Only works for users with `role === "user"`. Attempting on an admin returns a `ForbiddenException`.

### Remove an admin

```graphql
mutation RemoveAdmin($email: String!) {
  removeAdmin(email: $email)
}
```

The system admin account (`systemadminctrend@gmail.com`) cannot be removed — the backend will throw a `ForbiddenException`. Handle this gracefully in the UI.

**UI placement:** Admin dashboard → user list row → kebab menu → "Remove User" / "Remove Admin". Always show a confirmation dialog before executing.

---

## 7. Admin Dashboard

Create an `/admin` route (or `/dashboard/admin`) visible only when `me.role === "admin"`. It should include:

### 7.1 User Management panel

- **Search / list users** — call `listUsers` with pagination
- Each row shows: display name, email, username, role badge
- Row actions:
  - For regular users: "Remove User" (calls `removeUser`)
  - For admins: "Remove Admin" (calls `removeAdmin`) — disabled for the system admin email
- **"Invite User"** button — opens modal for `inviteUser`
- **"Invite Admin"** button — opens modal for `inviteAdmin`

### 7.2 Post creation

Admin users can create two kinds of posts:

| Mutation | Post type | Visibility |
|----------|-----------|------------|
| `createPost` | `USER` type | Visible only to followers |
| `createSystemPost` | `SYSTEM` type | Visible to ALL users, highest feed priority |

When an admin creates a post via the normal post composer, let them choose between "Regular Post" (friends-only) and "Platform-wide Post" (calls `createSystemPost`). Platform-wide posts have likes disabled by default.

---

## 8. System Admin Login

The system admin account can log in via the standard `login` mutation without email verification:

```graphql
mutation Login {
  login(email: "systemadminctrend@gmail.com", password: "admin123") {
    accessToken
    user {
      id
      role   # will be "admin"
    }
  }
}
```

No special frontend handling needed — the backend bypasses email verification automatically for this account.

---

## 9. Auth Flow Summary (Updated)

```
Regular signup:  signup() → verifyEmail() → logged in (role: "user")
Google login:    googleLogin() → logged in
Invited user:    /accept-invitation?token=xxx → acceptInvitation() → logged in (role depends on invite)
Admin login:     login() → logged in (role: "admin", no email verification needed)
```

---

## 10. Role-Based UI Rules

| Feature | Regular User | Admin |
|---------|-------------|-------|
| See own feed | ✓ (followers' posts) | ✓ |
| See global feed | System + org posts only | System + org posts only |
| Invite friends | ✓ (`inviteUser`) | ✓ (`inviteUser`) |
| Invite admins | ✗ | ✓ (`inviteAdmin`) |
| Remove users | ✗ | ✓ (`removeUser`) |
| Remove admins | ✗ | ✓ (`removeAdmin`) |
| List all users | ✗ | ✓ (`listUsers`) |
| Create system post | ✗ | ✓ (`createSystemPost`) |
| Access `/admin` | Redirect to home | ✓ |

Implement a route guard on `/admin` that redirects to `/` if `me.role !== "admin"`.

---

## 11. Checklist

- [ ] Add `/accept-invitation` page with token-based account creation form
- [ ] Call `acceptInvitation` mutation; store token and redirect on success
- [ ] Add "Invite a Friend" UI in profile/settings (calls `inviteUser`)
- [ ] Create `/admin` route guarded by `role === "admin"`
- [ ] Admin dashboard: user list via `listUsers` with pagination
- [ ] Admin dashboard: remove user/admin actions with confirmation
- [ ] Admin dashboard: invite user + invite admin buttons
- [ ] Post composer: allow admin to choose between regular and platform-wide post
- [ ] Update feed copy/empty states to reflect friends-only visibility ("Follow people to see their posts")
- [ ] Expose `role` badge on user profile pages
