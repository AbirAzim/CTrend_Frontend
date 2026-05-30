# Chat screen — keyboard dismiss gap bug

> **Status:** Open (2026-05-30)  
> **Screen:** `mobile/app/chat/[conversationId].tsx`  
> **Screenshot:** [`chat-keyboard-gap-after-send.png`](./chat-keyboard-gap-after-send.png)

---

## What the user sees

After **sending a message** in a 1:1 chat, when the **software keyboard is closed** (dismissed), a **large empty black area** appears **below the message input bar**. The input bar floats roughly in the lower third of the screen instead of sitting just above the bottom safe area / home indicator.

**Repro steps:**

1. Open a conversation (e.g. Anjon Kundu).
2. Tap the message field — keyboard opens.
3. Type and send a message (↑).
4. Dismiss the keyboard (back gesture, tap outside, or keyboard close button).
5. **Bug:** Huge gap under the input row; chat list does not expand to fill the space.

**Device context (from screenshot):** Android, dark theme, ~12:04, gesture nav (home indicator visible in the gap).

---

## Screenshot notes

| Area | Expected | Actual |
|------|----------|--------|
| Message list | Fills space above input | OK (top ~60–65%) |
| Input bar (emoji, attach, “Message…”, send) | Pinned above bottom inset | Floating too high |
| Below input bar | Minimal padding (`safe area` only) | **~25–30% empty black** |

---

## Likely cause (code review)

File: **`mobile/app/chat/[conversationId].tsx`**

Layout stack:

```
View (screen, flex: 1)
├── Header (paddingTop: insets.top)
└── KeyboardAvoidingView (flex: 1, behavior="padding", keyboardVerticalOffset={insets.top + 62})
    ├── FlatList (inverted messages)
    ├── Typing bar (optional)
    ├── Emoji picker (optional)
    ├── Image preview (optional)
    └── Input bar (paddingBottom: insets.bottom + 8)
```

**Probable issues:**

1. **`KeyboardAvoidingView` + `behavior="padding"` on Android** — padding added while keyboard is open may **not fully reset** after dismiss, leaving extra bottom padding equal to former keyboard height.
2. **`keyboardVerticalOffset={insets.top + 62}`** — fixed offset can mis-account for header height after keyboard hide/show cycles.
3. **Double bottom spacing** — `KeyboardAvoidingView` residual padding **plus** `paddingBottom: insets.bottom + 8` on the input bar.
4. **Send flow** — after send, `TextInput` may stay focused briefly or layout re-measures while list scrolls (`inverted` FlatList), compounding the gap.

Related pattern already documented elsewhere: post detail keeps **modals outside** `KeyboardAvoidingView` to avoid Fabric `addViewAt` parent conflicts (`MOBILE_PROGRESS.md`).

---

## Suggested fixes (for next session)

Try in order:

### A. Use `react-native-keyboard-controller` (Expo-friendly)

```bash
cd mobile && npx expo install react-native-keyboard-controller
```

Wrap chat screen with `KeyboardProvider` + `KeyboardAvoidingView` from that library — often fixes Android sticky padding.

### B. Replace `KeyboardAvoidingView` on Android

```tsx
import { Platform, Keyboard } from "react-native";

// Option: android: null behavior + manual keyboard height listener
const [keyboardHeight, setKeyboardHeight] = useState(0);
useEffect(() => {
  const show = Keyboard.addListener("keyboardDidShow", (e) =>
    setKeyboardHeight(e.endCoordinates.height),
  );
  const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
  return () => { show.remove(); hide.remove(); };
}, []);

// Apply marginBottom: keyboardHeight on input bar only, NOT on whole KAV
```

### C. Android-specific `behavior`

```tsx
behavior={Platform.OS === "ios" ? "padding" : undefined}
```

And use `android:windowSoftInputMode="adjustResize"` in `AndroidManifest` (Expo prebuild / `app.json`).

### D. Shrink `keyboardVerticalOffset`

Test `keyboardVerticalOffset={0}` or only `insets.top` — header is **outside** KAV, so `insets.top + 62` may be double-counting.

### E. `SafeAreaView` for input only

Move input bar **outside** `KeyboardAvoidingView`; only let the message list resize:

```tsx
<View style={{ flex: 1 }}>
  <Header />
  <FlatList style={{ flex: 1 }} ... />
  <InputBar style={{ paddingBottom: insets.bottom }} />
</View>
```

Use keyboard listeners to add `paddingBottom` to FlatList `contentContainerStyle` when keyboard visible.

---

## Verification checklist

- [ ] Open chat → focus input → keyboard open → layout OK
- [ ] Send message → keyboard still open → layout OK
- [ ] Dismiss keyboard → **no gap** under input
- [ ] Rotate / reopen chat — gap does not return
- [ ] With emoji picker open — no extra gap
- [ ] With image attachment preview — no extra gap
- [ ] iOS smoke test (if behavior differs)

---

## Related files

| File | Role |
|------|------|
| `mobile/app/chat/[conversationId].tsx` | **Primary** — chat UI + KAV + input bar |
| `mobile/app/tabs/messages.tsx` | Conversation list |
| `MOBILE_PROGRESS.md` | Phase messaging / known bugs |
| `MOBILE_ANDROID_SESSION.md` | Build/env handoff |

---

## Build log entry (suggested)

```markdown
| 2026-05-30 | Bug | Chat: huge bottom gap after keyboard dismiss — see `chat keyboard gap bug/` |
```
