# Notifications (bell)

**File:** `notifications-dropdown-bell.png`

Header bell dropdown:

- Mark all read
- Items: hype, comment, vote, friend request, etc.
- Unread: blue tint + dot; read: plain
- Avatar per actor (target for **mobile system notifications** too)

**Web:** `src/components/NotificationBell.tsx`, GraphQL `NEW_NOTIFICATION_SUB`

**Mobile parity:** every notification should show sender image (or app logo for system). See also `notification reference/` for Android shade style.
