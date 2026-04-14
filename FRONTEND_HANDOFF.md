# Frontend handoff (CTrend)

## Feed & post shape: `imageUrls`

The GraphQL `FeedPost` type exposes **`imageUrls: [String!]!`** (ordered list of image URLs).

- **Always request `imageUrls`** in `feedPosts` (and any post-detail query). If the client only reads a legacy `imageUrl` field that mirrors the first image, **additional images never appear** in the UI.
- The home feed maps each post to `FeedPostView.imageUrls` and renders:
  - **One URL** — single full-width image + classic up/down vote bar.
  - **Two URLs** — side-by-side compare; tap a side to vote (sends `votePost` with `selectedOptionIndex` `0` or `1`, matching legacy up/down counts on the API).
  - **Three or more** — horizontal scroll-snap row (swiper-style) for compare-style voting in **demo/mock** mode with per-option counts.

## `CreatePostInput` and `createPost`

The create-post mutation is wired as:

```graphql
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) { … }
}
```

From the **Create post** screen (`/create`), the client sends:

- `caption` — optional string (or `null` if empty).
- `imageUrls` — **array of 1 or more** strings. For a **compare (A/B) post**, send **exactly two** URLs, e.g. `imageUrls: ["https://…/a.jpg", "https://…/b.jpg"]`, so the feed behaves like the demo posts with two images.

On the API, `imageUrls` may be optional on the input type; the product requirement is: for compare posts, require two images in the UI and pass both in `imageUrls`.

## Demo data

With `VITE_USE_MOCK_FEED=true`, the mock feed includes **multi-image** examples (two-image compare and a three-image row) so compare layouts can be tested without the backend.

## CORS, hotlinking, and images

- **GraphQL** uses `VITE_GRAPHQL_HTTP`; local Vite may proxy `/graphql` to the API host (see `vite.config.ts`). That only affects API calls, not `<img>` loads.
- **Hotlinked images** (e.g. Wikimedia, Unsplash, Picsum) load **directly in the browser** via `<img src="…">`. They do not go through the GraphQL proxy unless you build a separate image proxy.
- If images fail to load in production, check **CSP** (`img-src`), **referrer policy**, or any **CDN / domain allowlist** on your hosting — not the Apollo client.
