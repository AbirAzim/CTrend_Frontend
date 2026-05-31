# App Sounds UI + Backend-Persisted Preferences

**Date:** 2026-05-31
**Web files changed:**
- `src/lib/notificationSound.ts`
- `src/lib/soundPreferencesStorage.ts`
- `src/context/SoundPreferencesContext.tsx`
- `src/pages/SoundPreferencesPage.tsx` (replaces `VoteSoundLabPage.tsx`)
- `src/graphql/profile.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/pages/ProfilePage.tsx`
- `src/index.css`

**Backend files changed:**
- `src/users/user.schema.ts`
- `src/users/graphql/user.types.ts`
- `src/users/dto/update-profile.input.ts`
- `src/users/users.service.ts`
- `src/users/sound-preferences.constants.ts`
- `src/schema.gql`

## What changed

### Backend — per-user sound preferences
Added to `User` model + `UserGql` + `UpdateProfileInput`:
- `voteSoundId` (default `buzz-in`)
- `notificationSoundId` (default `ascending-chime`)
- `messageSoundId` (default `gentle-ping`)

Validated with `@IsIn` against allowed ID lists in `sound-preferences.constants.ts`.

### Frontend — unified sound system
- All sounds registered in one player map; vote/bell/message each have their own preset catalog.
- `playVoteSound`, `playNotificationChime`, `playMessageSound` read from active preferences (not hard-coded).
- `SoundPreferencesProvider` loads from `ME`, caches locally, saves via `updateProfile` mutation on change.

### UI — `/profile/sounds`
- Tabbed picker: **Vote | Bell | Messages**
- 2-column grid on wider screens
- Tap card to select + save; **Preview** button per sound
- Active badge + toast confirmation

## Mobile instructions
1. Add `voteSoundId`, `notificationSoundId`, `messageSoundId` to mobile `ME` / `UPDATE_PROFILE` operations.
2. Mirror preset IDs from web `notificationSound.ts` (or share via `packages/shared`).
3. Build a settings screen with three tabs matching web.
4. On login, apply prefs before playing sounds; on change, call `updateProfile`.

## Notes
- Backend restart required after schema change.
- Old `ctrend_vote_sound_id` localStorage key is superseded by `ctrend_sound_preferences` cache object.
