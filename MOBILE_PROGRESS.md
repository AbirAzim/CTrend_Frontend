# CTrend Mobile — Full Web Parity Progress Tracker

> Updated automatically as features are built. Never delete entries — only mark complete.

---

## KEY FACTS

- **GraphQL endpoint:** `https://seashell-app-stt6c.ondigitalocean.app/graphql`
- **WS endpoint:** `wss://seashell-app-stt6c.ondigitalocean.app/graphql`
- **Google Client ID:** `41983174733-rpq1s0k95fhnme4jfrb2uv2usfq4p1ce.apps.googleusercontent.com`
- **Image upload:** GraphQL mutation `getImageUploadUrl(filename, contentType)` → presigned S3 URL → PUT binary
- **Package:** `com.ctrend.app`
- **Build cmd:** `cd mobile/android && ./gradlew assembleRelease --no-daemon -x lintVitalAnalyzeRelease -x lintVitalRelease`
- **Install cmd:** `adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## UX / UI PARITY — ANIMATIONS & INTERACTIONS

> Full audit of `src/index.css` (9705 lines). Every animation and interaction that must be replicated on mobile. Use React Native `Animated` API or `react-native-reanimated` (v2/v3) where needed.

### Easing constants (map to RN)
| Web name | Web curve | RN equivalent |
|---|---|---|
| `--cx-ease-out` | `cubic-bezier(0.22,1,0.36,1)` | `Easing.bezier(0.22,1,0.36,1)` |
| `--cx-ease-spring` | `cubic-bezier(0.34,1.3,0.64,1)` | `Easing.bezier(0.34,1.3,0.64,1)` or `Animated.spring` with `tension:180, friction:12` |

---

### 1. Feed — Post card entrance
- **Web**: `cx-post-in` — opacity: 0→1, translateY: 18px→0, scale: 0.97→1, 0.55s spring, staggered 0.03s per item
- **Mobile**: Each `FeedPostCard` should fade-in + slide up on mount. Use `useAnimatedValue` per card or `FlatList` `onViewableItemsChanged` trigger. Delay = index × 45ms, cap at item 8.
- **Status**: ❌ Not yet done

### 2. Feed — Background ambient gradient
- **Web**: `cx-bg-drift` — radial gradient drifts and breathes for 18s (disabled on Capacitor Android for perf)
- **Mobile**: Skip on mobile — use static gradient background matching the theme palette. Already handled by `colors.bg`.
- **Status**: ✅ Handled (static color)

### 3. Logo shimmer
- **Web**: `cx-logo-shimmer` — gradient text with `background-position` shifting (disabled on Capacitor)
- **Mobile**: Skip — use accent gradient text static. "Ke Jitbe" in `colors.accentLight`. No shimmer loop needed.
- **Status**: ✅ Handled (static)

### 4. Topbar — Floating pill style
- **Web**: `background: rgba(255,255,255,0.45)`, `backdrop-filter: blur(8px)`, `border-radius: 999px`, `box-shadow` lift, hidden state = `opacity 0.14, translateY(-10px) scale(0.98)`
- **Mobile**: The topbar is a View, not floating pill yet. Needs: semi-transparent background (`rgba`), rounded pill shape (`borderRadius: 999`), `BlurView` from `expo-blur` for backdrop blur effect (use fallback solid bg if `expo-blur` not installed). Hide-on-scroll: track `FlatList` scroll offset, translateY topbar if scrolling down > 40px.
- **Status**: ❌ Not yet done — needs pill shape + scroll-hide behavior

### 5. Bottom nav — Floating pill style
- **Web**: Floating pill (`border-radius: 999px`, `background: rgba(255,255,255,0.82)`, `backdrop-filter: blur(20px)`), nav items are circles with spring hover. Active item = gradient bg + scale(1.02). Hidden = `translateY(84px) scale(0.96)`.
- **Mobile**: Current tab bar uses RN default. Needs: custom tab bar with pill container, each tab as a circle button. Active = accent gradient bg. Spring press animation `scale(0.94)` on press, spring back. `BlurView` background.
- **Status**: ❌ Not yet done — major visual gap

### 6. Compare cells — Vote interactions (HIGH PRIORITY)
The most complex UX piece. On the web, voting is extremely polished:

| Step | Web animation | Mobile target |
|---|---|---|
| Pre-vote idle | `vote-invite`: brightness 0.9↔1.04, 2.6s loop | `Animated.loop(Animated.sequence([...]))` on unvoted cells |
| Press/tap | `cx-vote-pop`: scale 1→1.065→0.975→1.018→1, 0.48s spring | `Animated.spring` sequence on the Pressable |
| Flash on vote | `cx-vote-flash`: radial white+accent radial bloom, 0.55s | Overlay `View` with `Animated.timing` opacity 0→1→0 |
| Voted pin badge | `cx-voted-pin-in`: scale(0)→scale(1.2)→scale(1) with rotate, 0.52s spring | Star/heart circle badge — `Animated.spring` from scale 0 |
| Voted chip (overlay) | `cx-chip-drop-in`: translateY(-14px)→0, scale 0.88→1, 0.38s | Pill chip on image — `Animated.spring` |
| Unchosen cell dim | `filter: brightness(0.72) saturate(0.55)` | Not directly doable in RN — use `opacity: 0.55` as approximation |
| Unchosen hover: "↺ Switch" pill | Text pill appears from below | On long-press unchosen cell: show "Switch" label |
| Bar sweep on vote | `cx-bar-sweep`: light sweeps across bar fill, 0.58s | Gradient overlay `translateX(-200% → 300%)` on bar after vote |
| Hint bar entrance | `cx-vote-hint-in`: translateY(7px)→0 + fade, 0.42s spring | Animate hint row `translateY` + `opacity` |
| Vote switch exit | `cx-vote-switch-out`: brightness flash then dim | Opacity flash then dim on previously-voted cell |

- **Status**: ❌ All vote animations missing — current implementation has no animation at all

### 7. Winner state (post closed)
| Element | Web | Mobile |
|---|---|---|
| Loser cell | opacity 0.48, grayscale(0.85), scale(0.99) | `opacity: 0.48`, no grayscale in RN (use `ImageStyle.tintColor` workaround or accept no grayscale) |
| Winner cell | scale(1.025), golden `box-shadow` inset + outer glow | `transform: [{scale: 1.025}]`, border + shadow via `shadowColor: '#f59e0b'` |
| Winner shimmer | Diagonal light sweep every 2.8s | Animated overlay translateX loop on winner image |
| Crown badge | `crown-pop` spring: scale(0.6)rotate(-30deg) → scale(1.2) → scale(1), 0.55s | `Animated.spring` scale from 0 + rotate |
| Crown glow | `crown-glow`: text-shadow pulsing 2s | Amber text with no extra animation needed |
| "VOTING ENDED" strip | Slides in from top, shimmers | Animated View from translateY(-100%) → 0, then subtle shimmer loop |

- **Status**: ❌ Winner shimmer + crown pop missing — current has static WINNER badge

### 8. Action chips (bottom of post)
- **Web**: `cx-action-chip` — pill-shaped, `translateY(-2px)` on hover, `scale(0.98)` active, `background: rgba(...)`, `border-radius: 999px`. Hype chip goes rose-colored when pressed. Save chip goes amber.
- **Mobile**: Current bottom action bar uses flat View rows with text labels. Needs: pill-shaped chips, spring press scale(0.94→1), color change on press (hype: rose, save: amber).
- **Status**: ❌ Not yet done — needs pill chips + press animations

### 9. Online presence dot
- **Web**: `cx-presence-pulse` — 2s ease-in-out glow animation: `box-shadow 0→10px` radius ring in green
- **Mobile**: `Animated.loop(Animated.sequence([Animated.timing(scale, {toValue:1.4}), Animated.timing(scale, {toValue:1})]))` on a green dot View. Show in friends list, chat header, profile.
- **Status**: ❌ Not yet done

### 10. Offline banner
- **Web**: `ig-offline-slidein` — translateY(-100%)→0, 0.3s `cubic-bezier(0.22,1,0.36,1)`
- **Mobile**: Animated View at the top that slides in from above when network is offline. Use `@react-native-community/netinfo` (Phase 13 dep). Show amber banner with WiFi-off icon.
- **Status**: ❌ Not yet done (Phase 13)

### 11. Toast notifications
- **Web**: `ig-toast-in` — opacity 0→1, translateY(-8px)→0, 0.2s ease. Pill at `top: 72px, left: 50%`.
- **Mobile**: A floating toast View centered at top, animated in from above. Show on: new post published, vote recorded, comment sent, friend request sent. Auto-dismiss after 2.5s.
- **Status**: ❌ Not yet done

### 12. Page transitions (screen navigation)
- **Web**: React Router — instant replace, no transition
- **Mobile**: Expo Router Stack has default slide-right. Use `animation: "slide_from_right"` for drill-down (post detail, profile, chat). Use `animation: "slide_from_bottom"` for modals (voters sheet, extend voting). Auth screens: `animation: "fade"`.
- **Status**: ⚠️ Partially done — auth uses fade, main stack uses default slide

### 13. OTP boxes (verify email)
- **Web**: `border-color` + `box-shadow: 0 0 0 3px rgba(accent,0.18)` on `:focus`. Filled box gets `border-color: accent-mid`.
- **Mobile**: TextInput `borderColor` changes on focus via `onFocus/onBlur`. Shadow not natively possible per-input, but border highlight is. Already partially done.
- **Status**: ⚠️ Partially done

### 14. Card radius & shadows
- **Web**: Cards use `border-radius: 24px`, layered shadows (`0 1px 2px` + `0 4px 12px` + `0 16px 36px`)
- **Mobile**: Current cards use `borderRadius: 20` (close enough). Shadow: use `elevation: 4` on Android + `shadowColor/Radius/Offset/Opacity` on iOS. The current cards lack the layered shadow. Apply to `FeedPostCard` `.card` style.
- **Status**: ⚠️ Partial — radius close, shadows minimal

### 15. Split bar (vote distribution)
- **Web**: Height 4px, green gradient left / orange gradient right, `transition: flex 0.45s ease-out` on the fill widths
- **Mobile**: `Animated.timing` the `flex` value of each side when votes update (0.45s ease-out). Currently static.
- **Status**: ❌ Not animated

### 16. Progress bars (live split options)
- **Web**: `cx-pulse-fill` — `transition: width 0.45s ease-out` + `cx-bar-sweep` shine on vote
- **Mobile**: Animate bar width via `Animated.Value` + `Animated.timing(0.45s)`. After vote, run a translateX sweep overlay.
- **Status**: ❌ Not animated

### 17. More menu (⋯ button)
- **Web**: `ig-more-btn:hover` → `rotate(90deg)` + accent bg. Menu appears as popover with delete/extend options.
- **Mobile**: Currently the ⋯ button does nothing. Needs: `ActionSheet` or `Modal` with delete/extend options. The ⋯ should rotate 90° on press via `Animated.spring`. Only show delete/extend for post owner.
- **Status**: ❌ Not yet done — ⋯ is dead button

### 18. Avatar hover (post card)
- **Web**: On post card hover, avatar does `rotate(-6deg) scale(1.05)`
- **Mobile**: On press-in of author row, spring-animate avatar `rotate(-6deg) scale(1.05)`, spring back on press-out.
- **Status**: ❌ Not yet done

### 19. Percentage badge on compare images
- **Web**: `ig-compare-pct-main` — semi-transparent pill with `backdrop-filter: blur(3px)`, tabular nums, `font-size: 1.12rem`
- **Mobile**: Currently simple `Text` overlaid. Needs: semi-transparent `View` with `borderRadius: 999`, blurred bg (hard in RN — use `rgba(0,0,0,0.58)` solid). Tabular-nums font variant: `fontVariant: ['tabular-nums']`.
- **Status**: ⚠️ Partially done — missing pill shape and tabular-nums

### 20. Voting ended strip (above compare images)
- **Web**: Amber gradient strip slides down from top of compare, shimmers
- **Mobile**: Animated `View` with amber gradient (`LinearGradient` from `expo-linear-gradient`) that slides from `translateY(-100%)` → 0 when `isVotingOpen === false`. Text: "🏆 VOTING ENDED • RESULTS LOCKED".
- **Status**: ❌ Not yet done

---

## IMPLEMENTATION PRIORITY ORDER

**Phase 2.5 — UX Polish (do before Phase 3):**
1. **Compare cell vote animations** (#6) — most impactful, core experience
2. **Action chips pill shape + press feedback** (#8)
3. **Winner state** (#7) — crown, loser dim, ended strip
4. **Post card entrance animation** (#1) — first impressions
5. **Split bar + progress bar animation** (#15, #16)
6. **Toast system** (#11) — needed for Phase 3+ feedback
7. **Topbar pill + scroll-hide** (#4)
8. **Bottom nav pill + active animation** (#5)

**Phase 13 (Polish) — remaining:**
9. Offline banner (#10)
10. More menu (#17)
11. Online presence pulse (#9)
12. Avatar press animation (#18)
13. Voting ended strip (#20)
14. Percentage badge pill (#19)

---

## ARCHITECTURE

```
mobile/app/
├── _layout.tsx            Stack + ThemeProvider + ApolloProvider + AuthProvider
├── index.tsx              Redirect → /auth/login or /tabs
├── tabs/
│   ├── _layout.tsx        5-tab bar (Feed, Keeps, Create, Messages, Profile)
│   ├── index.tsx          Feed screen
│   ├── keeps.tsx          Saved posts
│   ├── create.tsx         Create post
│   ├── messages.tsx       Conversation list  ← Phase 8
│   └── profile.tsx        Own profile
├── auth/
│   ├── _layout.tsx        Stack (no header, fade animation)
│   ├── login.tsx          ✅ Done
│   ├── signup.tsx         ✅ Phase 1 done
│   ├── verify-email.tsx   ✅ Phase 1 done
│   ├── forgot-password.tsx ✅ Phase 1 done
│   ├── reset-password/
│   │   └── [token].tsx    ✅ Phase 1 done
│   └── accept-invitation/
│       └── [token].tsx    ✅ Phase 1 done
├── post/
│   └── [id].tsx           Phase 3 — post detail + comments + voters
├── chat/
│   └── [conversationId].tsx  Phase 8 — chat screen
├── profile/
│   ├── edit.tsx           Phase 5 — edit profile
│   ├── scheduled.tsx      Phase 10 — scheduled posts
│   └── [userId].tsx       Phase 7 — other user's profile
├── friends/
│   └── index.tsx          Phase 6 — suggestions / requests / my friends
├── notifications/
│   └── index.tsx          Phase 4 — notifications screen
├── campaign/
│   └── [slug].tsx         Phase 9 — campaign detail + fixtures
└── admin/
    ├── _layout.tsx        Phase 11 — admin tab navigator
    ├── index.tsx          Phase 11 — users tab
    ├── invitations.tsx    Phase 11 — invitations tab
    ├── campaigns.tsx      Phase 11 — campaigns tab
    └── world-cup.tsx      Phase 11 — world cup tab
```

---

## PHASES & STATUS

### ✅ PHASE 0 — Foundation (COMPLETE)
- [x] Dark/light theme context (`context/ThemeContext.tsx`)
- [x] Feed with binary voting, real-time subscriptions (POST_VOTE_UPDATED, NEW_POSTS)
- [x] Hype, Save, Share on feed cards
- [x] Campaign banners on feed
- [x] Keeps (saved posts) screen
- [x] Profile screen (own, view only)
- [x] 5-tab navigation (Feed, Keeps, Create, Messages, Profile)
- [x] Login screen (dark theme, Google OAuth)
- [x] Notification unread count badge in topbar
- [x] Topbar: theme toggle, admin icon, create button, bell, logout

---

### ✅ PHASE 1 — Auth Completion (COMPLETE)
All auth flows working natively with dark theme.

- [x] Signup screen — dark theme, redirects to verify-email
- [x] Email verification screen — 6-digit OTP, auto-advance, paste, resend with cooldown
- [x] Forgot password screen — dark theme
- [x] Reset password screen — token from deep link `ctrend://reset-password/TOKEN`
- [x] Accept invitation screen — display name + password
- [x] Shared graphql: messages.ts, admin.ts, worldcup.ts added to `packages/shared/src/graphql/`

**APIs used:** SIGNUP, VERIFY_EMAIL, RESEND_VERIFICATION_EMAIL, REQUEST_PASSWORD_RESET, RESET_PASSWORD, ACCEPT_INVITATION

---

### ✅ PHASE 2 — Create Post (COMPLETE)

- [x] Replace URL inputs with `expo-image-picker` gallery/camera picker
- [x] Select 2–4 images with slot grid (160px tiles), camera/gallery/remove options
- [x] Upload flow: `getImageUploadUrl(filename, contentType)` → `FileSystem.uploadAsync(PUT, BINARY_CONTENT)` → publicUrl
- [x] Caption, category picker (bottom sheet modal), option labels
- [x] Voting duration chips (1h/12h/1d/3d/7d/None)
- [x] Admin: platform-wide toggle → CREATE_SYSTEM_POST
- [x] Dark theme

**APIs:** CREATE_POST, CREATE_SYSTEM_POST, CATEGORIES, GET_IMAGE_UPLOAD_URL
**APK built:** 2026-05-29 ✅

---

### ⚠️ PHASE 2.5 — UX Polish (PARTIAL)
Replicate web animations/interactions audited from `src/index.css`. See **UX/UI PARITY** section above.

- [x] Compare cell vote animations: vote-pop spring, flash overlay, voted-pin badge, unchosen dim
- [x] Action chips: pill shape, horizontal scroll, spring press, hype=rose, save=amber
- [x] Split bar: `Animated.timing` flex animation (450ms ease-out) on vote update
- [x] Toast component: `components/useToast.tsx` — sliding pill from top, auto-dismiss 2.5s, reusable
- [ ] Winner state: loser dim (opacity), winner golden border, crown-pop badge, voting-ended strip
- [ ] Post card entrance: fade-in + slide-up stagger per item in FlatList
- [ ] Progress bars (live split): animated width sweep
- [ ] Topbar: pill shape + scroll-hide behavior (translateY(-100%) when scrolling down > 40px)
- [ ] Bottom nav: floating pill container, circle tab buttons, active=accent gradient

**Deps needed:** `expo-linear-gradient` (for gradients), `expo-blur` (for blur backgrounds)

---

### ✅ PHASE 3 — Post Detail + Comments + Voters (COMPLETE)

- [x] Full post detail screen (`post/[id].tsx`) — inline PostDetailCard (no subscription, avoids native view conflict)
- [x] Comments: COMMENTS_BY_POST, threaded top-level + replies (toggle show)
- [x] Add comment input (sticky bottom), reply with banner
- [x] Like individual comments (SET_COMMENT_LIKE) — optimistic
- [x] Voter list bottom sheet (Modal) — All / per-option tabs, tap → user profile
- [x] Bug fix: "All" tab passes `optionIndex: undefined` (not `null`) so backend returns all voters
- [x] Post owner actions: delete (DELETE_POST w/ Alert confirm), extend voting (EXTEND_POST_VOTING bottom sheet)
- [x] Toast feedback: "Comment posted ✓" / "Voting extended ✓" via `useToast`
- [x] Bell button wired → `/notifications`
- [x] Action chips row: DISCUSS, SHARE, HYPE (SET_POST_HYPE), KEEP (SET_POST_KEEP), VOTERS — matches feed card
- [x] LIVE SPLIT bars with themed colors (adapts dark/light)
- [x] Vote anonymous toggle with correct theme colors
- [x] Dark theme (full makeStyles pattern)

**APIs:** GET_POST_BY_ID, COMMENTS_BY_POST, COMMENT_POST, SET_COMMENT_LIKE, VOTERS_BY_POST, DELETE_POST, EXTEND_POST_VOTING
**APK built:** 2026-05-29 ✅

---

### ✅ PHASE 4 — Notifications Screen (COMPLETE)

- [x] Full notifications screen (`notifications/index.tsx`)
- [x] List with icon, title, body, time ago, unread indicator
- [x] Tap → mark read + navigate to referenceId (POST → post detail, USER → profile)
- [x] Mark all read button
- [x] NEW_NOTIFICATION_SUB subscription (live badge update)
- [x] Bell button in topbar navigates to this screen
- [x] Dark theme

**APIs:** MY_NOTIFICATIONS, MARK_NOTIFICATION_READ, MARK_ALL_NOTIFICATIONS_READ, NEW_NOTIFICATION_SUB
**APK built:** 2026-05-29 ✅

---

### ✅ PHASE 5 — Edit Profile (COMPLETE)

- [x] Edit profile screen (`profile/edit.tsx`)
- [x] Avatar upload: expo-image-picker → GET_IMAGE_UPLOAD_URL → PUT → UPDATE_PROFILE (Android `content://` copy step included)
- [x] Display name field (50 char max)
- [x] Bio field (160 char max with counter)
- [x] Interests: 20 predefined toggle-pill tags
- [x] Save in header + bottom button, loading state on both
- [x] Toast "Profile saved ✓" on success, error toast on failure
- [x] `patchUser` updates local auth context immediately after save
- [x] "✎ Edit Profile" button on profile tab navigates here
- [x] Dark theme

**APIs:** UPDATE_PROFILE, GET_IMAGE_UPLOAD_URL, ME
**APK built:** 2026-05-29 ✅

---

### ✅ PHASE 6 — Friends System (COMPLETE)

- [x] Friends screen (`friends/index.tsx`) with 3 tabs (Suggestions, Requests, Friends)
- [x] Suggestions tab: `FRIEND_SUGGESTIONS` list, Add button turns Pending after press, search filter
- [x] Requests tab: Incoming (Accept/Decline) + Sent (Pending) sub-sections, badge count on tab label
- [x] My Friends tab: online dot via `ONLINE_USER_IDS` (polls 30s), Message button → `START_DIRECT_CONVERSATION` → `/chat/[id]`, long-press row → Unfriend with Alert confirm
- [x] Search bar clears on tab switch
- [x] Toast feedback: request sent, accepted, declined, unfriended, chat fail
- [x] Tap user row → `/profile/[userId]` (Phase 7)
- [x] "👥 Friends" button on profile tab navigates to friends screen
- [x] Dark theme, full color palette

**APIs:** FRIEND_SUGGESTIONS, MY_FRIENDS, FRIEND_REQUESTS, ADD_FRIEND, RESPOND_FRIEND_REQUEST, UNFRIEND, ONLINE_USER_IDS, START_DIRECT_CONVERSATION
**APK built:** 2026-05-30 ✅

---

### ✅ PHASE 7 — Other User's Profile (COMPLETE)

- [x] User profile screen (`profile/[userId].tsx`)
- [x] Avatar (with online dot if friend), name, bio, interests, online pill
- [x] Own profile → redirect to `/tabs/profile`
- [x] `FRIENDSHIP_STATUS` → dynamic button: Add Friend / Pending / Accept Request / ✓ Friends (tap to unfriend)
- [x] Message button visible only when friends → `START_DIRECT_CONVERSATION` → `/chat/[id]`
- [x] Posts grid: 3-column square thumbnails (USER_POSTS), tap → post detail; vote count overlay
- [x] `ONLINE_USER_IDS` poll (30s) — online dot + pill shown only to friends
- [x] Author tap in FeedPostCard header → `/profile/[authorId]`
- [x] Author tap in PostDetailCard header → `/profile/[authorId]` + real avatar shown
- [x] Dark theme

**APIs:** GET_USER_PROFILE, FRIENDSHIP_STATUS, USER_POSTS, ADD_FRIEND, RESPOND_FRIEND_REQUEST, UNFRIEND, START_DIRECT_CONVERSATION, ONLINE_USER_IDS
**APK built:** 2026-05-30 ✅

---

### ✅ PHASE 8 — Full Messaging (COMPLETE)

- [x] Conversation list (`tabs/messages.tsx`) — MY_CONVERSATIONS sorted by last message time
- [x] `MESSAGE_RECEIVED` subscription refetches conversation list
- [x] Unread count badge on each row, bold preview text for unread
- [x] Online dot on conversation avatar
- [x] "+ New" button → friend picker modal (search + tap to start DM)
- [x] Empty state with "Start a Chat" button
- [x] Chat screen (`chat/[conversationId].tsx`)
  - [x] Messages: inverted FlatList, load 30 per page, `onEndReached` loads older
  - [x] Own messages: right-aligned accent bubble; others: left-aligned card bubble + avatar
  - [x] Image messages: 200×200 preview with optional caption
  - [x] Seen receipts: ✓✓ shown on own messages when readBy > 1
  - [x] `MARK_CONVERSATION_READ` called on mount + on new message while open
  - [x] Typing: `SET_TYPING` on input change (2s auto-off), `TYPING_INDICATOR_SUB` shows "X is typing…"
  - [x] Image picker (expo-image-picker) + S3 upload + send with imageUrl
  - [x] Image preview bar before send with remove button
  - [x] Emoji picker: 20 preset emojis in horizontal scroll row
  - [x] Online status in header via `PRESENCE_CHANGED` subscription
  - [x] Pagination via `client.query` with skip/take
  - [x] Notification sound (expo-audio `useAudioPlayer`) + vibration on incoming messages
  - [x] Keyboard gap fixed via `react-native-keyboard-controller` `KeyboardAvoidingView` (edge-to-edge safe)
  - [x] Dark theme

**APIs:** MY_CONVERSATIONS, GET_MESSAGES, SEND_MESSAGE, MARK_CONVERSATION_READ, SET_TYPING, START_DIRECT_CONVERSATION, MESSAGE_RECEIVED, TYPING_INDICATOR_SUB, MESSAGE_READ_SUB, PRESENCE_CHANGED, GET_IMAGE_UPLOAD_URL, MY_FRIENDS
**Note:** Used FlatList (inverted) instead of FlashList — @shopify/flash-list not needed
**APK built:** 2026-05-30 ✅

---

### ✅ PHASE 9 — Campaign Detail (COMPLETE)

- [x] Campaign detail screen (`campaign/[slug].tsx`)
- [x] Hero: banner image with overlay title, fallback text title
- [x] Meta strip: prize (৳), start date, end date
- [x] Description paragraph
- [x] Rules: numbered list, EN/বাং toggle (shows only when `rulesBn` is present)
- [x] Group standings: computed from finished fixtures, green/amber position indicators
- [x] Upcoming matches: grouped by stage, sorted by kickoff time
- [x] Finished matches: sorted newest first
- [x] Fixture card: team crests, score or kickoff time, live badge + red dot, Full Time label, winner highlighted gold
- [x] "Cast your vote" → `/post/[campaignPostId]` (upcoming); "View result" (finished)
- [x] `CAMPAIGN_BY_SLUG` added to `packages/shared/src/graphql/campaigns.ts`
- [x] `fixturesEnabled` added to `ACTIVE_CAMPAIGNS` query
- [x] No extra deps needed (rules are plain text, not markdown)
- [x] Dark theme

**APIs:** CAMPAIGN_BY_SLUG, WORLD_CUP_FIXTURES
**APK built:** 2026-05-30 ✅

---

### ✅ PHASE 10 — Scheduled Posts (COMPLETE)

- [x] Scheduled posts screen (`profile/scheduled.tsx`)
- [x] List with image thumbnail, countdown (d/h/m), status pill (Going live / ⏱ Xd Xh)
- [x] Cancel with Alert confirm → CANCEL_SCHEDULED_POST
- [x] Polls every 30s (MY_SCHEDULED_POSTS)
- [x] NEW_POSTS subscription triggers refetch when a post goes live
- [x] "Scheduled ▾" button on own profile screen navigates here
- [x] Dark theme

**APIs:** MY_SCHEDULED_POSTS, CANCEL_SCHEDULED_POST, NEW_POSTS

---

### ✅ PHASE 11 — Admin Panel (COMPLETE)

- [x] Admin navigator (`admin/_layout.tsx`) — 4-tab Tabs layout (Users, Invites, Campaigns, World Cup)
- [x] Guards: `isAdmin` check — redirects to /tabs if not admin
- [x] Users tab (`admin/index.tsx`): LIST_USERS with skip/take pagination (20/page), role filter chips (All/USER/ADMIN), client-side search by email/username/displayName, remove user (Alert confirm), promote to admin (Alert confirm)
- [x] "+ Invite" button: single email (INVITE_USER) or bulk comma/newline separated (INVITE_USERS_BULK) in bottom sheet modal
- [x] "📢 Broadcast" button: SEND_ADMIN_BROADCAST with title + body in bottom sheet modal
- [x] Invitations tab (`admin/invitations.tsx`): LIST_INVITATIONS with status filter (All/PENDING/ACCEPTED/EXPIRED/CANCELLED), resend (RESEND_INVITATION), cancel with Alert confirm (CANCEL_INVITATION), invite admin modal (INVITE_ADMIN)
- [x] Campaigns tab (`admin/campaigns.tsx`): CAMPAIGNS_ADMIN list, toggle active (TOGGLE_CAMPAIGN with Switch), create/edit modal with all fields (CREATE_CAMPAIGN / UPDATE_CAMPAIGN)
- [x] World Cup tab (`admin/world-cup.tsx`): Fixtures/Winners tab switch, sync fixtures (SYNC_WORLD_CUP_FIXTURES with Alert confirm), create campaign post per fixture (CREATE_WORLD_CUP_CAMPAIGN_POST), process result for finished matches (PROCESS_MATCH_RESULT), mark winner paid (MARK_CAMPAIGN_PRIZE_PAID), RefreshControl on both lists
- [x] Admin gear icon in feed topbar navigates to /admin (was showing Alert)
- [x] "Admin Panel ▾" button on own profile screen navigates to /admin
- [x] Dark theme

**APIs:** LIST_USERS, REMOVE_USER, PROMOTE_TO_ADMIN, INVITE_USER, INVITE_USERS_BULK, INVITE_ADMIN, LIST_INVITATIONS, CANCEL_INVITATION, RESEND_INVITATION, CAMPAIGNS_ADMIN, CREATE_CAMPAIGN, TOGGLE_CAMPAIGN, UPDATE_CAMPAIGN, WORLD_CUP_FIXTURES, SYNC_WORLD_CUP_FIXTURES, CREATE_WORLD_CUP_CAMPAIGN_POST, PROCESS_MATCH_RESULT, CAMPAIGN_WINNERS, MARK_CAMPAIGN_PRIZE_PAID, SEND_ADMIN_BROADCAST

---

### ✅ PHASE 12 — Push Notifications (COMPLETE)

- [x] `expo-notifications` installed + plugin added to app.json with notification icon
- [x] `REGISTER_PUSH_TOKEN(token, platform)` mutation added to `packages/shared/src/graphql/notifications.ts`
- [x] `mobile/hooks/usePushNotifications.ts` — requests permission, gets Expo push token, registers with backend (gracefully silent if backend doesn't support yet), foreground handler, background tap → navigate to POST/USER/MESSAGE
- [x] Android notification channel created (default, MAX importance, purple color)
- [x] Wired into `_layout.tsx` via `<AppServices>` component (inside AuthProvider + ApolloProvider)
- [x] Offline banner (`mobile/components/OfflineBanner.tsx`) — slide-in amber banner via `@react-native-community/netinfo`, animated translateY, shown at top above everything

**Deps:** `expo-notifications ~56.0.15`, `@react-native-community/netinfo 12.0.1`
**APK built:** 2026-05-30 ✅

---

### ✅ PHASE 13 — Polish (COMPLETE)

- [x] Multi-option (3+ image) voting in FeedPostCard — 2-column `flexWrap` grid, all options shown with pct overlay, voted badge, winner/loser dim, vote-pop animation per cell
- [x] Multi-option badge + cell dim animations (useEffect watches `activeMyIdx`)
- [x] FeedPostCard ⋯ menu — Modal bottom sheet for post owner: "Extend voting" (cascades to preset sheet) + "Delete post" (Alert confirm → DELETE_POST + refetch FEED_POSTS)
- [x] Extend voting preset sheet: +12h, +1d, +3d, +1w options in bottom sheet modal
- [x] Post scheduling in Create screen — "Schedule for later" Switch toggle, shows ISO datetime TextInput when enabled, passes `scheduledAt` to CREATE_POST input
- [x] Role switching in profile — ADMIN users see "ACTIVE ROLE" chip row (USER / ADMIN) below admin links, calls SWITCH_ACTIVE_ROLE and updates session token
- [x] Offline banner wired into root `_layout.tsx`, slides in/out with animation

**APIs:** DELETE_POST, EXTEND_POST_VOTING, REGISTER_PUSH_TOKEN (pending backend), SWITCH_ACTIVE_ROLE
**APK built:** 2026-05-30 ✅

---

---

## REACT CHANGE 2 — Mobile Adoption Phases (2026-06-01 web batch)

> Source docs: `react_change_2/` directory. All web changes confirmed working. Port in phase order below.

---

### ✅ PHASE 14 — Two-Zone Action Bar + Voters Modal Redesign (COMPLETE 2026-06-02)

**Source docs:** `phase1-action-bar-and-notification-darkmode.md`, `phase2b-two-zone-action-bar-redesign.md`, `phase1-voters-modal-redesign.md`

**Goal:** Replace the current horizontal-scroll action chips with the new two-zone container; upgrade the voters modal with pagination + search + avatars.

#### Action bar

- [ ] **Two-zone container** (`flexDirection:'column'`, `borderRadius:16`, `borderWidth:1`, `overflow:'hidden'`)
  - Light: `rgba(255,255,255,0.72)` bg · `rgba(67,56,202,0.14)` border
  - Dark: `rgba(15,23,42,0.64)` bg · `rgba(148,163,184,0.24)` border
- [ ] **Zone 1 — icon row:** `flexDirection:'row'`, `justifyContent:'space-evenly'`, `flexWrap:'wrap'`, `gap:2`, `paddingVertical:7`, `paddingHorizontal:8`
  - Icon-only `Pressable`s, no text labels; each icon **19px**
  - Press → `scale(0.94)` spring + translucent accent bg
  - Order: Comments, Share, Full page (conditional), Hype, Keep, Voters
  - Add `IconUsers` (two-person glyph) for the **Voters** chip
  - `accessibilityLabel` on each (replaces visible label)
  - Transparent bg; flat style (no per-chip pill border/shadow inside the rail)
- [ ] **Count badges** (`.cx-action-chip-count` equivalent) — pill `View`, 17px tall, radius 999, shown only when `count > 0`:
  - Default (Comments): accent indigo — light `rgba(67,56,202,0.14)` / dark `rgba(129,140,248,0.2)`
  - Hype (rose): light `rgba(159,23,77,0.16)` / dark `rgba(251,113,133,0.22)`
  - Keep (amber): light `rgba(245,158,11,0.18)` / dark `rgba(245,158,11,0.22)`
  - Voters total = multi → `sum(optionStats[].count)`, binary → `up + down`
  - `fontVariant:['tabular-nums']`, weight 800, ~11px
- [ ] **Hairline divider** between zones: `borderTopWidth:1` — light `rgba(67,56,202,0.12)` / dark `rgba(148,163,184,0.18)`
- [ ] **Zone 2 — context line:** `flexDirection:'row'`, `justifyContent:'space-between'`, `alignItems:'center'`, `gap:10`, `paddingVertical:8`, `paddingHorizontal:14`, faint tint bg (light `rgba(21,20,27,0.025)` / dark `rgba(255,255,255,0.03)`)
  - **Status text** (`numberOfLines={1}`, ellipsis):
    - Open: `⏳ Ends in Xd Yh` — color `#312e81` (light) / `#818cf8` (dark), weight 700
    - Closed: `🏆 {winnerSummary}` — color `#b45309` (light) / `#fcd34d` (dark)
    - Fallback: `Voting open` when no end date
  - **"See details ›"** `Pressable` (right-aligned, `flexShrink:0`): weight 800, same accent color; pressed → accent tint bg, `borderRadius:8`; toggle label/arrow when details panel open

#### Voters modal

- [ ] **Non-blocking floating panel** — use an absolutely-positioned `View` with `pointerEvents="box-none"` + inner card `pointerEvents="auto"`. **Do NOT use `<Modal>`** (blocks interaction with the page behind).
  - `zIndex` below the nav tabs so nav stays on top
- [ ] **FlatList** inside the card: `data` = accumulated voters, `onEndReached` fetches next page (`skip = data.length, take = 10`), `onEndReachedThreshold={0.3}`, `ListFooterComponent` for spinner / "That's everyone" row
- [ ] **Pagination guard:** monotonic request id to discard stale responses; `hasMore = lastPage.length === 10`
- [ ] **Each row:** Avatar (36px circle, gradient initial fallback, "?" for anonymous) · display name · relative time · option-chip (color-coded by `selectedOptionIndex % 4`) shown only in all-voters view
- [ ] **Header chip:** "Voted by" + loaded count (`N` or `N+` if more remain)
- [ ] **Search box:** `TextInput`, debounced 300ms, re-queries with `search` variable (reset to page 0); clear "×" button; `autoCapitalize="none"`
- [ ] **Close:** ×-button + `BackHandler` on Android (no outside-tap-close needed)
- [ ] **Notification hover pressed state:** use theme map (`light: #f7f7f7`, `dark: rgba(255,255,255,0.06)`, unread pressed: `rgba(0,149,246,0.18)`)

**APIs:** `VOTERS_BY_POST(postId, optionIndex, search, skip, take)` — already in shared; `profileImageUrl` already returned

---

### ✅ PHASE 15 — Unvote + Vote-Status Layout (COMPLETE 2026-06-02)

**Source docs:** `phase2-vote-bar-layout-and-unvote.md`

- [ ] **Single-tap unvote:** if user taps their already-chosen option → call `REMOVE_VOTE(postId)` mutation; else → `VOTE_POST(index)`
- [ ] **Unified engine:** one in-flight guard `voteInFlight` + one pending-intent slot (`pendingVoteRef`, int where `-1` = withdraw) shared by vote and unvote. When mutation resolves: if a newer intent queued, fire it instead of applying result. This prevents vote → unvote → vote flicker.
- [ ] **Optimistic state wins:** when a local optimistic snapshot exists, render from it — including explicit `null` (withdraw) — never coalesce with `?? serverVote`
- [ ] **Add `REMOVE_VOTE` mutation** to `packages/shared/src/graphql/feed.ts`:
  ```graphql
  mutation RemoveVote($postId: ID!) { removeVote(postId: $postId) { ... VoteResultFields } }
  ```
- [ ] **Status/countdown placement** (open compare posts): status sits beside the "Vote anonymously" toggle row (`justifyContent:'space-between'`). For closed/binary posts: falls back into Zone 2 of the action bar (Phase 14).

**APIs:** `REMOVE_VOTE` (new backend mutation — backend must be deployed first)

---

### ✅ PHASE 16 — Comments UX + Discuss Panel + Cache Policy (COMPLETE 2026-06-02)

**Source docs:** `phase2-comment-ux.md`, `discuss-panel-ux-overhaul.md`, `comment-load-performance.md`

- [ ] **Newest comment on top:** sort top-level comments by `createdAt` **descending**; keep replies **ascending** within each thread. Apply to both feed card Discuss sheet and post detail screen.
- [ ] **Return key to post:** set `returnKeyType="send"` + `onSubmitEditing={submitComment}` on the comment `TextInput`; factor submit into a single no-arg function used by both the key and the "Post" button.
- [ ] **Replies remain oldest-first** within their thread (don't invert replies).
- [ ] **Optimistic comment timestamp = "now"** so it sorts to the top immediately without extra logic.
- [ ] **Discuss toggle label:** show **"Hide"** when the panel is open (was static "Discuss").
- [ ] **Show more:** preview newest 5 comments, render a **"Show N more comments ▾"** button; on expand, `FlatList.scrollToEnd()` (or `scrollToIndex`) after render.
- [ ] **Apollo cache policy:** change `COMMENTS_BY_POST` fetch policy to `cache-and-network` (first load from cache instantly, then revalidates); use `cache-first` for subsequent pagination. Was `network-only`.

**No new APIs — backend N+1 batch fix is server-side; mobile just benefits from faster responses.**

---

### ✅ PHASE 17 — Notifications Enhancements (COMPLETE 2026-06-02)

**Source docs:** `phase4-notifications.md`, `vote-notifications-anonymous-privacy.md`

- [ ] **Actor avatar in notification rows:** request `latestActorAvatar` from `MY_NOTIFICATIONS` and `NEW_NOTIFICATION_SUB`. Show `Image` 36×36 `borderRadius:18` when URL exists; fall back to type emoji.
- [ ] **Anonymous vote privacy:** when `latestActorId` is null (anonymous vote notification), show **no avatar** and no actor name — only emoji icon. Already flagged as needed in existing mobile notification screen.
- [ ] **Grouped notification resurface:** when the real-time sub delivers an update for a notification `id` already in the list → remove from current position, prepend to top, set `read: false`, update `body` and `createdAt`.
- [ ] **Friend request Accept/Reject UI state on notification row:** after tapping Accept or Decline, show inline state `"Accepted ✓"` or `"Rejected"` on the row (no spinner-only, no row disappears). Do not refetch the whole list; update local state.
- [ ] **Comment deep-link:** backend now stores `commentId` on `POST_COMMENT` / `COMMENT_REPLY` / `COMMENT_REACTION` notifications. When tapping: `router.push('/post/[id]', { postId, commentId })` → post detail opens → comments sheet → `FlatList.scrollToIndex` to the target comment; highlight the row briefly.
- [ ] Add `commentId` to `MY_NOTIFICATIONS` query selection in `packages/shared/src/graphql/notifications.ts`.

**APIs:** `MY_NOTIFICATIONS` (add `commentId`, `latestActorAvatar`), `NEW_NOTIFICATION_SUB` (add `latestActorAvatar`), `RESPOND_FRIEND_REQUEST`

---

### ✅ PHASE 18 — Message Reactions (COMPLETE 2026-06-02)

**Source docs:** `phase5-message-reactions.md`

- [x] `reactions { emoji count }` and `viewerReaction` already in `GET_MESSAGES` / `SEND_MESSAGE` / `MESSAGE_RECEIVED` in shared package
- [x] `REACT_MESSAGE(messageId, emoji)` mutation already in shared messages.ts (emoji `null` = remove)
- [x] `MESSAGE_REACTION_CHANGED` subscription already in shared messages.ts
- [x] **Long-press bubble** (480ms) → show emoji picker row (6 emojis: 👍 ❤️ 😂 😮 😢 🔥) above the bubble — dark pill, viewer's current emoji highlighted
- [x] Tapping same emoji = remove (sends `emoji: null`)
- [x] **Reaction strip** under each bubble: aggregated counts, viewer's pick highlighted with indigo border + bg tint
- [x] Optimistic update: immediate local state update + server mutation; `MESSAGE_REACTION_CHANGED` sub corrects from server
- [x] Works on both text and image bubbles (Pressable wrapper on both)
- [x] `MESSAGE_REACTION_EMOJIS` constant imported from shared package

**APIs:** `REACT_MESSAGE`, `MESSAGE_REACTION_CHANGED` (backend deployed)

---

### ✅ PHASE 19 — Profile Redesign (Grid Cards + Voted Tab) (COMPLETE 2026-06-02)

**Source docs:** `profile-drops-grid-and-search-thumbs.md`, `profile-stats-voted-tab-compact-post.md`

#### Profile grid card component

- [x] Create `mobile/components/ProfileCompareCard.tsx` — variants: `'drops' | 'voted' | 'kept'`
  - **Media strip:** `height:120`, flex row, up to 4 `Image`s each `flex:1` `resizeMode="cover"`, `+N` badge absolute bottom-right (`rgba(0,0,0,0.55)` pill)
  - **Title:** single-line ellipsis, 0.78rem bold, fallback "Untitled compare"
  - **Category + option chips** (drops/voted only): muted text + accent tint pill chips
  - **Stats footer** (drops/voted only): `flexWrap:'wrap'` row — 🗳️ `totalVotes` · 💬 `commentCount` · ❤️ `hypeCount` · 🔖 `saveCount`; tabular nums, weight 700, ~11px; 0-counts still render
  - **Status pill** (`borderRadius:999`, uppercase, weight 800, 10px): Live = green text `#15803d` + animated pulse dot `#22c55e` 6px / Ended = muted text + lock icon (no red emoji dot)
  - **Status positioned** at **bottom-left under the stats row** (not on image, not beside stats)
  - **Edit button** (drops only, `canEdit`): absolute top-right `34×34` `borderRadius:10`; `Pressable` with `stopPropagation` so it doesn't navigate
  - Kept variant: lighter footer — only `{n} votes` muted text + Open/Closed pill (no full stats)
- [x] **Grid layout:** `flexWrap:'wrap'` 2-column View inside nested ScrollView, `gap:10`, `padding:14`
- [x] Replace current drop list rows with grid cards on **Drops** tab (edit button → navigates to post)
- [x] Replace current kept list rows with grid cards on **Kept** tab

#### Voted tab

- [x] Add **"Voted"** third tab to own profile screen (tabs: ✦ Drops / 🔖 Kept / 🗳️ Voted)
- [x] Add `MY_VOTED_POSTS(anonymousOnly: Boolean)` query to `packages/shared/src/graphql/profile.ts`
- [x] Segmented filter **All votes / 👻 Anonymous** above the grid (pill container, two `Pressable`s)
- [x] Filter drives `anonymousOnly` variable; Apollo `fetchPolicy: 'cache-and-network'`; refetches on toggle
- [x] Voted cards: same `ProfileCompareCard variant="voted"`, no edit affordance
- [x] Empty states differentiated for all vs anonymous filter

**APIs:** `MY_VOTED_POSTS(anonymousOnly)` — backend deployed

---

### ✅ PHASE 20 — Post Detail Polish + Ke Jitbe Per-Card Branding (COMPLETE 2026-06-02)

**Source docs:** `post-detail-copy-link-and-layout.md`, `platform-posts-ke-jitbe-branding.md`

#### Post detail

- [x] **Copy link button** in post detail header (headerRight: "🔗 Copy link")
  - Tap: `Clipboard.setStringAsync(postWebUrl(id))` → `https://www.kejitbe.app/post/${id}` (via `postWebUrl`, respects `EXPO_PUBLIC_WEB_ORIGIN`)
  - Shows toast "Copied ✓" via `useToast`
  - Installed `expo-clipboard ~56.0.3`
- [x] **Full-width compare images** — cells already full-width (`(SCREEN_W-2)/2` each), added height cap `Math.min(IMG_W*1.55, SCREEN_H*0.58)` so tall images don't dominate; `contentFit="cover"`
- [x] Phone full-width (mobile single-column; no tablet maxWidth needed)

#### Platform posts (Ke Jitbe branding)

- [x] `postType` already mapped in shared `mapGqlPostToFeedView.ts` (`type?.toLowerCase()` → `postType`); `type` field present in shared `feed.ts`
- [x] `FeedPostCard` header: logo + "Ke Jitbe" + "Platform" pill badge already present; **applied** the `platformCard` accent border/bg style to card container (was defined but unused)
- [x] Card: accent border (1.5px `accentLight`) + tinted bg (`accent + "14"`) for platform posts — both feed card and post detail card
- [x] Post detail header: logo + "Platform" pill badge added; meta now **time-only** (removed "Platform poll ·" prefix per spec)
- [x] No Ke Jitbe section banner / Bengali tagline present in mobile (grep clean) — only the legitimate topbar app title

**Deps:** `expo-clipboard ~56.0.3` installed (new native module — required full rebuild)

---

### ✅ PHASE 21 — Admin Posts Management Tab (COMPLETE 2026-06-02)

**Source docs:** `admin-post-management.md`

- [x] Added **Posts** tab (📝) to admin navigator (`admin/_layout.tsx`)
- [x] New screen `admin/posts.tsx`:
  - Search bar (caption + option labels, server-side via `query.search`, 350ms debounce)
  - Filter chip rows (horizontal scroll, not stacked selects): Status (All/Published/Scheduled), Voting (All/Live/Closed), Category (from CATEGORIES)
  - Sort chip row: Created/Updated/Votes/Caption + Order Desc/Asc
  - **Reset** button shown when filters non-default
  - `FlatList` 20/page with Prev/Next pagination + "Showing X–Y of N" + count query
  - Each row: 2-image thumb strip + caption + short ID + category + 🗳️/💬/❤️/🔖 counts + Published/Scheduled & Live/Closed pills + ends-relative-time + author PersonLink + "edited by" lastEditedBy PersonLink + updatedAt
  - Tap row (or 👁 View) → `/post/[id]`
  - **✏️ Edit** → `/edit-post?postId=` · **🗑** → DELETE_POST with Alert confirm
  - **"+ New"** → `/tabs/create?platform=1` (create screen reads `platform` param → pre-checks Platform-wide)
- [x] Added `ADMIN_PLATFORM_POSTS`, `ADMIN_PLATFORM_POSTS_COUNT` to `packages/shared/src/graphql/admin.ts`
- [x] `PersonLink` component (avatar + name → `/profile/[id]`, `admin` variant = purple avatar) with its own Pressable so it doesn't trigger row navigation

**APIs:** `ADMIN_PLATFORM_POSTS(query, skip, take)`, `ADMIN_PLATFORM_POSTS_COUNT(filter)`, `DELETE_POST`, `CATEGORIES` — backend deployed

---

## PHASE PRIORITY ORDER (react_change_2)

| Phase | Priority | Effort | Dependencies |
|-------|----------|--------|--------------|
| 14 — Action bar + voters modal | 🔴 High | Large | Backend `votersByPost` search/pagination (deployed) |
| 15 — Unvote + status layout | 🔴 High | Medium | Backend `removeVote` (deployed) |
| 16 — Comments UX + cache | 🟠 Medium | Small | None (backend N+1 fix is server-side) |
| 17 — Notifications enhancements | 🟠 Medium | Medium | Backend `commentId`, `latestActorAvatar` (deployed) |
| 18 — Message reactions | 🟠 Medium | Medium | Backend reactions (deployed) |
| 19 — Profile grid + voted tab | 🟡 Medium | Large | Backend `myVotedPosts` (new) |
| 20 — Post detail polish + branding | 🟡 Low | Small | expo-clipboard dep |
| 21 — Admin posts tab | 🟢 Low | Medium | Add queries to shared package |

---

## SHARED GRAPHQL STATUS (`packages/shared/src/graphql/`)

| File | Status |
|---|---|
| auth.ts | ✅ Complete |
| feed.ts | ✅ Complete |
| campaigns.ts | ✅ Complete |
| comments.ts | ✅ Complete |
| friends.ts | ✅ Complete (includes GET_USER_PROFILE) |
| notifications.ts | ✅ Complete |
| profile.ts | ✅ Complete (includes USER_POSTS) |
| upload.ts | ✅ Complete (GET_IMAGE_UPLOAD_URL) |
| messages.ts | ✅ Complete (reactions, viewerReaction, REACT_MESSAGE, MESSAGE_REACTION_CHANGED all present) |
| admin.ts | ✅ Complete (ADMIN_PLATFORM_POSTS + ADMIN_PLATFORM_POSTS_COUNT added) |
| worldcup.ts | ✅ Phase 1 — added |
| profile.ts | ⚠️ Phase 19 — needs `MY_VOTED_POSTS(anonymousOnly)` |
| notifications.ts | ⚠️ Phase 17 — needs `commentId`, `latestActorAvatar` on MY_NOTIFICATIONS + sub |
| feed.ts | ⚠️ Phase 15 — needs `REMOVE_VOTE` mutation |

---

## NEW DEPS TO INSTALL (when phase starts)

```bash
# Phase 2
cd mobile && npx expo install expo-image-picker

# Phase 8
cd mobile && npm install @shopify/flash-list

# Phase 9
cd mobile && npm install react-native-markdown-display

# Phase 12 — DONE
# cd mobile && npx expo install expo-notifications
# cd mobile && npm install @react-native-community/netinfo

# Phase 13 — DONE (no extra deps needed; expo-audio already installed)

# Phase 20
cd mobile && npx expo install expo-clipboard
```

---

## KNOWN BUGS / CRASHES

### RedBox: `addViewAt` — child already has a parent (2026-05-29 ~18:00)

**Screenshot:** [`addviewat-crash-reference.png`](./addviewat-crash-reference.png) (project root)

**Error (verbatim):**
```
addViewAt: failed to insert view [72] into parent [78] at index 0

The specified child already has a parent. You must call removeView() on the child's parent first.
```

**Stack trace (top frames):**
| # | Function | File |
|---|----------|------|
| 1 | `addViewAt` | `SurfaceMountingManager.kt:336` |
| 2 | `execute` | `IntBufferBatchMountItem.kt:122` |
| 3 | `executeOrEnqueue` | `MountItemDispatcher.kt:340` |
| 4 | `dispatchMountItems` | `MountItemDispatcher.kt:246` |
| 5 | `tryDispatchMountItems` | `MountItemDispatcher.kt:93` |
| 6 | `doFrameGuarded` | `FabricUIManager.java:1528` |
| 7 | `doFrame` | `GuardedFrameCallback.kt:42` |
| 8 | `frameCallback$lambda$1` | `ReactChoreographer.kt:59` |

**What it means:** React Native **Fabric (New Architecture)** tried to mount a native view that was **already attached** to another parent. Common causes: conditional render that moves the same component between parents, Modal + nested views, duplicate keys, or rapid navigation/state updates during mount.

**Likely screens to check:** Create post (`tabs/create.tsx`), post detail modals/bottom sheets, tab navigator + overlay components.

**Status:** ✅ Fixed (2026-05-29).

**Fixes applied:**
1. Removed `removeClippedSubviews={true}` from FlatList in `tabs/index.tsx` — caused native view detachment races during navigation.
2. ~~`PostDetailScreen` uses `PostDetailCard` (inline, subscription-free) instead of `FeedPostCard`~~ **(REVERTED 2026-06-02)** — `PostDetailScreen` now reuses `FeedPostCard` with `variant="detail"` for exact visual parity. The dual-mount subscription conflict is avoided by passing `skip: isDetail` to the `POST_VOTE_UPDATED` `useSubscription` (the detail instance never opens a second sub on the same postId). If the `addViewAt` crash recurs on post detail, re-check this.
3. `tabs/_layout.tsx`: Added `listeners: { tabPress: guardedTabPress }` to all protected tabs — intercepts press before screen mounts, preventing native view ops on redirect to login.
4. All protected tab screens (`create`, `profile`, `keeps`, `messages`): moved all hooks before auth check; replaced `<Redirect>` with `useEffect` + `router.replace`.

---

## BUILD LOG

| Date | Phase | Notes |
|---|---|---|
| 2026-05-29 | Phase 0 | Foundation complete, APK installed |
| 2026-05-29 | Phase 0 | Theme toggle working dark/light |
| 2026-05-29 | Phase 1 | Auth screens complete, APK installed |
| 2026-05-29 | Phase 2 | Create post with real image picker + S3 upload — APK built ✅ |
| 2026-05-29 | Phase 3 | Post detail + comments + voters bottom sheet — code complete, APK not yet installed |
| 2026-05-29 | UX Audit | Full web CSS audit done — 20 animation/interaction patterns documented in MOBILE_PROGRESS.md, Phase 2.5 added |
| 2026-05-29 | Bug fix | `addViewAt` crash fixed — Rules of Hooks in tab screens, tab press interception, PostDetailCard |
| 2026-05-29 | Bug fix | Image upload `expo-file-system/legacy` import + Android `content://` URI copy step |
| 2026-05-29 | Bug fix | Auth redirect for unregistered users — all protected tabs + post navigation |
| 2026-05-29 | Phase 2.5 | Vote-pop spring, flash overlay, badge entrance, cell dim, animated split bar, pill action chips |
| 2026-05-29 | Phase 3 | Toast feedback, bell wired to notifications, voters "All" tab fix — APK ✅ |
| 2026-05-29 | Phase 4 | Notifications screen (already built) — bell button wired ✅ |
| 2026-05-29 | Phase 5 | Edit profile — avatar upload, display name, bio, interest tags — APK ✅ |
| 2026-05-29 | Bug fix | Profile images: added authorProfileImageUrl to FEED_POSTS/GET_POST_BY_ID/MY_SAVED_POSTS queries, mapped in mapGqlPostToFeedView, voter avatars in post detail |
| 2026-05-29 | Phase 6 | Friends system — 3-tab screen (Suggestions/Requests/Friends), online dots, DM button, unfriend, search — APK not yet installed |
| 2026-05-29 | Phase 7 | Other user profile — avatar, bio, interests, friendship button, posts grid, author taps wired everywhere — APK not yet installed |
| 2026-05-29 | Phase 8 | Full messaging — conversation list with unread badges, new DM modal, chat screen with pagination/typing/emoji/image upload/seen receipts/presence — APK not yet installed |
| 2026-05-29 | Phase 9 | Campaign detail — hero, meta, rules EN/BN, group standings, fixture cards with live/score/vote — APK not yet installed |
| 2026-05-30 | Bug fix | App crash fixed: replaced `expo-av` (VideoViewModule Kotlin type incompatibility) with `expo-audio`; added `multiDexEnabled true` + `lint { abortOnError false }` to Gradle |
| 2026-05-30 | Bug fix | Chat keyboard gap: replaced `react-native` `KeyboardAvoidingView` with `react-native-keyboard-controller` version + added `KeyboardProvider` to `_layout.tsx` — fixes edge-to-edge dismiss gap on Android |
| 2026-05-30 | Bug fix | Chat sound: switched from `expo-av` to `expo-audio` `useAudioPlayer`, `seekTo(0).then(() => play())` for reliable replay; vibration on incoming messages |
| 2026-05-30 | Bug fix | Feed post author avatar: cross-reference approach (same as web) — `ME` + `MY_FRIENDS` + `FRIEND_SUGGESTIONS` + `FRIEND_REQUESTS` lookup by username/email |
| 2026-05-30 | Bug fix | Post detail: vote anonymous text was black on dark theme (undefined color override) — fixed to `colors.text`/`colors.accent`; LIVE SPLIT colors now use theme palette |
| 2026-05-30 | Feature | Post detail: added action chips row (DISCUSS, SHARE, HYPE, KEEP, VOTERS) matching feed card — HYPE/KEEP with optimistic mutations, VOTERS opens bottom sheet |
| 2026-05-30 | Phase 6–9 | All phases marked complete — APK built and installed ✅ |
| 2026-05-30 | Phase 10 | Scheduled posts screen — countdown, cancel, subscription refetch, link from profile |
| 2026-05-30 | Phase 11 | Admin panel — 4-tab navigator: Users (list/search/paginate/invite/broadcast), Invitations (filter/resend/cancel/invite-admin), Campaigns (list/toggle/create/edit), World Cup (sync/post/process/winners/mark-paid) |
| 2026-05-30 | Phase 12 | Push notifications — expo-notifications, permission request, Expo push token, REGISTER_PUSH_TOKEN, foreground/background handlers, offline banner with netinfo — APK ✅ |
| 2026-05-30 | Phase 13 | Polish — multi-option (3+) voting grid in FeedPostCard, ⋯ menu (delete + extend voting), post scheduling toggle in Create screen, role switching chips in profile — APK ✅ |
| 2026-06-02 | Planning | react_change_2 analyzed — Phases 14–21 added to MOBILE_PROGRESS.md (action bar, unvote, comments, notifications, message reactions, profile grid, post detail, admin posts) |
| 2026-06-02 | Phase 18 | Message reactions — long-press picker (6 emojis), optimistic updates, reaction strip under bubbles, MESSAGE_REACTION_CHANGED sub, works on text + image bubbles |
| 2026-06-02 | Phase 19 | Profile redesign — ProfileCompareCard component (drops/voted/kept variants), 2-col grid, live pulse dot, stats footer, 3rd Voted tab with All/Anonymous segmented filter — APK ✅ |
| 2026-06-02 | Phase 20 | Post detail copy-link button (expo-clipboard + postWebUrl), compare image 58% height cap, platform Ke Jitbe branding applied (accent card border/bg + Platform pill badge in detail header, time-only meta) — APK ✅ |
| 2026-06-02 | Detail parity | Full-page post now renders the **actual `FeedPostCard`** (`variant="detail"`) for exact feed parity — removed the separate `PostDetailCard`/`VotersPanel`/`ExtendSheet` (~590 lines). Detail variant: skips POST_VOTE_UPDATED sub (avoids dual-mount crash), hides Full-page chip, Comments chip scrolls to comments, delete pops back. — APK ✅ |
| 2026-06-02 | Icons | Rail icons reworked: Share→**🔗 Copy link** (clipboard + Android toast), Full page→**↗️**, hype fixed from broken `♥`/`♡` dingbat → **❤️** (dim when inactive), VOTED badge `♥`→`✓`. Detail header keeps 🔗 Copy link. |
| 2026-06-02 | Phase 21 | Admin Platform Posts tab — shared ADMIN_PLATFORM_POSTS(+count) queries, `admin/posts.tsx` (search/status/voting/category/sort chip filters, paginated list, stats, status pills, author + lastEditedBy PersonLinks, View/Edit/Delete, + New platform post → create?platform=1) — APK ✅ |
