# Single post page — Copy link + layout polish

**Date:** 2026-06-01  
**Web files changed:**
- `src/pages/PostDetailPage.tsx`
- `src/lib/postPermalink.ts` (unchanged helper; used here)
- `src/index.css` — `.ig-post-detail*`, compare full-width rules

**Related:** [profile-stats-voted-tab-compact-post.md](./2026-06-01_profile-stats-voted-tab-compact-post.md) (58vh media cap origin); feed card share uses same permalink helper in `FeedPostCard.tsx`.

---

## What changed on web

### Copy link (`/post/:id`)

The top bar no longer shows the full long URL (overflow / poor UX on mobile web).

| Element | Behavior |
|---------|----------|
| **← Back** | `navigate(-1)` |
| **Post link** | Label only; full URL in `title` tooltip |
| **Copy link** | `navigator.clipboard.writeText(postPermalink(postId))` |
| **Copied ✓** | Button label for 2s after success |

Permalink format (via `postPermalink`):

```
https://www.kejitbe.app/post/{postId}
```

Respects Vite `BASE_URL` when the app is not deployed at domain root.

### Layout (same pass)

- Compare images **full card width** on detail (fixed empty space when `aspect-ratio: 4/3` + `max-height` shrank width).
- More padding on header, caption, footer; page `max-width: 640px` centered.

---

## CSS classes (`index.css`)

| Class | Role |
|-------|------|
| `.ig-post-detail` | Page wrapper, padding, max-width |
| `.ig-post-detail-bar` | Top bar (back + link actions) |
| `.ig-post-detail-back` | Back pill button |
| `.ig-post-detail-link-wrap` | Flex row for label + copy |
| `.ig-post-detail-url` | “Post link” label |
| `.ig-post-detail-copy` | Copy link pill button |

Detail compare overrides: `.ig-post-detail .ig-post-media-wrap--compare` → `width: 100%`, explicit `height` / `clamp`, cells `flex: 1 1 50%`.

---

## Mobile implementation instructions

1. **Post detail screen** (`mobile/app/post/[id].tsx` or equivalent):
   - Header row: Back + **Copy link** (no full URL `TextInput`).
2. **URL builder** — port `postPermalink` logic:
   - Production: `https://www.kejitbe.app/post/${id}` (or env `EXPO_PUBLIC_WEB_ORIGIN`).
   - Do not hardcode localhost in release builds.
3. **Clipboard** — `expo-clipboard` or `@react-native-clipboard/clipboard`:
   ```ts
   await Clipboard.setStringAsync(permalink);
   ```
   Show toast / temporary “Copied ✓” on the button (2s), same as web.
4. **Share (optional)** — feed card may already use `Share.share()`; detail screen can add a second “Share” action later; web detail is **copy-only** in the top bar (feed card still has share icon via `handleSharePostLink`).
5. **Layout** — apply full-width compare strip on detail:
   - `flexDirection: 'row'`, each image `flex: 1`, `maxHeight: ~58%` of window height (`useWindowDimensions`), `resizeMode: 'cover'`.
   - Avoid fixed `aspectRatio` on the row container if it leaves horizontal gap (same bug as web).

---

## Relevant web code

```tsx
// PostDetailPage.tsx
const permalink = postId ? postPermalink(postId) : "";

const copyPermalink = useCallback(async () => {
  if (!permalink) return;
  try {
    await navigator.clipboard.writeText(permalink);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  } catch {
    /* ignore */
  }
}, [permalink]);
```

```ts
// postPermalink.ts
export function postPermalink(postId: string): string {
  const path = `/post/${postId}`;
  const base = import.meta.env.BASE_URL ?? "/";
  if (base === "/") return `${window.location.origin}${path}`;
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${window.location.origin}${normalized}${path}`;
}
```

---

## Notes / gotchas

- **Clipboard API** on web requires secure context (HTTPS); silent fail if blocked.
- **Deep links** — copied URL opens web `/post/:id`; native app universal links are a separate task.
- **Feed vs detail** — `FeedPostCard` with `showPermalinkToolbar={false}` on detail; share chip on action bar still copies/shares via `handleSharePostLink` — two entry points, same permalink.
- No backend changes.

---

## QA

1. Open `/post/{id}` → **Copy link** → paste in notes → correct URL.
2. Button shows **Copied ✓** then reverts.
3. Tooltip / long-press on “Post link” shows full URL (web `title` attribute).
4. Binary compare fills card width (no white strip on the right).
