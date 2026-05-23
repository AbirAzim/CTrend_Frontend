# Backend Changes — Cloudflare R2 Integration

**Backend**: `https://seashell-app-stt6c.ondigitalocean.app/` (DigitalOcean App Platform, Node.js/GraphQL)

This document covers every change needed in the backend repo only. For Cloudflare bucket setup and frontend wiring, see `CLOUDFLARE_R2_SETUP.md`.

---

## 1 — Install Dependencies

In your backend repo root:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid
```

| Package | Purpose |
|---------|---------|
| `@aws-sdk/client-s3` | S3-compatible client — works with R2 by pointing at the R2 endpoint |
| `@aws-sdk/s3-request-presigner` | Generates short-lived signed PUT URLs |
| `uuid` | Creates unique, collision-proof object keys |

If your project uses TypeScript:

```bash
npm install -D @types/uuid
```

---

## 2 — Environment Variables

### 2.1 Local development (`.env`)

Add to your backend `.env` file:

```env
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4   # 32-char hex from Cloudflare dashboard
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=ctrend-images
R2_PUBLIC_URL=https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
```

### 2.2 DigitalOcean App Platform

1. Open https://cloud.digitalocean.com → **Apps** → your backend app.
2. Go to **Settings** → **App-Level Environment Variables** → **Edit**.
3. Add each variable from the table below. Mark `R2_SECRET_ACCESS_KEY` as **Encrypted** so it is never shown in logs.

| Variable | Example value | Encrypted? |
|----------|--------------|------------|
| `CLOUDFLARE_ACCOUNT_ID` | `a1b2c3d4...` | No |
| `R2_ACCESS_KEY_ID` | `abc123...` | No |
| `R2_SECRET_ACCESS_KEY` | `xyz789...` | **Yes** |
| `R2_BUCKET_NAME` | `ctrend-images` | No |
| `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` | No |

4. Click **Save** — DigitalOcean triggers a redeploy automatically.

> Never commit these values to git. If you already have a `.env` file tracked, add it to `.gitignore` now.

---

## 3 — R2 Client Module

Create this file once and import it wherever you need R2 access.

**`src/lib/r2Client.js`** (or `r2Client.ts`):

```js
import { S3Client } from '@aws-sdk/client-s3';

if (!process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');
if (!process.env.R2_ACCESS_KEY_ID)      throw new Error('R2_ACCESS_KEY_ID is not set');
if (!process.env.R2_SECRET_ACCESS_KEY)  throw new Error('R2_SECRET_ACCESS_KEY is not set');

export const r2 = new S3Client({
  region: 'auto',   // R2 requires the literal string 'auto'
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,            // REQUIRED — without this, SDK v3 generates virtual-hosted URLs
                                   // (bucket.accountid.r2.cloudflarestorage.com) which R2 doesn't
                                   // support on the main endpoint, causing CORS failures.
  requestChecksumCalculation: 'WHEN_REQUIRED',  // REQUIRED for newer SDK v3 (3.310+)
                                   // Default changed to 'WHEN_SUPPORTED' which auto-adds CRC32 to
                                   // presigned URLs via x-amz-sdk-checksum-algorithm=CRC32.
                                   // R2 doesn't understand this SDK-internal param and returns 403
                                   // (signature mismatch). Setting WHEN_REQUIRED disables it.
                                   // Note: ChecksumAlgorithm: undefined on PutObjectCommand alone
                                   // is NOT sufficient in newer SDK versions.
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
```

The three guard throws will crash the process at startup with a clear message rather than silently failing on the first upload attempt.

---

## 4 — GraphQL Schema Changes

### 4.1 New type and mutation

Add to your type definitions (SDL):

```graphql
type PresignedUploadUrl {
  uploadUrl: String!   # Frontend PUTs image bytes here (expires in 5 min)
  publicUrl: String!   # Permanent public URL — save this in the DB
  key: String!         # R2 object key, useful for deletion later
}

type Mutation {
  # --- existing mutations stay here ---

  getImageUploadUrl(
    filename:    String!   # Original filename e.g. "photo.jpg" — used to infer extension
    contentType: String!   # MIME type e.g. "image/jpeg" — set on the R2 object
  ): PresignedUploadUrl!
}
```

### 4.2 Allowed content types

You should validate `contentType` in the resolver (Section 5) against this list:

```
image/jpeg
image/png
image/webp
image/gif
image/avif
```

Reject anything else so users cannot request a presigned URL for arbitrary file types.

---

## 5 — Resolver Implementation

### 5.1 `getImageUploadUrl` resolver

```js
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl }     from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 }    from 'uuid';
import { r2 }               from '../lib/r2Client.js';

const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const CONTENT_TYPE_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'image/avif': 'avif',
};

export const uploadResolvers = {
  Mutation: {
    getImageUploadUrl: async (_parent, { filename, contentType }, context) => {

      // 1. Authentication guard — never issue a presigned URL to anonymous users
      if (!context.user) {
        throw new Error('Not authenticated');
      }

      // 2. Content type validation
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      // 3. Build a unique, user-scoped object key
      //    Pattern: posts/<userId>/<uuid>.<ext>
      //    Scoping by userId makes it easy to list or delete a user's files later
      const ext = CONTENT_TYPE_TO_EXT[contentType];
      const key = `posts/${context.user.id}/${uuidv4()}.${ext}`;

      // 4. Build the PutObject command
      const command = new PutObjectCommand({
        Bucket:           process.env.R2_BUCKET_NAME,
        Key:              key,
        ContentType:      contentType,
        ChecksumAlgorithm: undefined, // AWS SDK v3 adds CRC32 by default — disable it or browsers can't PUT
      });

      // 5. Sign the URL — expires in 5 minutes (300 seconds)
      //    unhoistableHeaders prevents the SDK from embedding x-amz-checksum-crc32 in the signed URL
      //    (that header breaks browser fetch() PUT requests)
      const uploadUrl = await getSignedUrl(r2, command, {
        expiresIn: 300,
        unhoistableHeaders: new Set(['x-amz-checksum-crc32']),
      });

      // 6. Construct the permanent public URL
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

      return { uploadUrl, publicUrl, key };
    },
  },
};
```

### 5.2 Merge into your root resolver

If you combine resolvers with `merge` or `lodash.merge`:

```js
import { uploadResolvers } from './resolvers/upload.js';

const resolvers = merge(
  existingResolvers,
  uploadResolvers,
);
```

---

## 6 — Image Deletion on Post Delete

When a post is deleted, clean up the R2 object to avoid orphaned storage.

```js
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { r2 }                  from '../lib/r2Client.js';

// Inside your deletePost resolver, after confirming ownership:
async function deletePostImage(publicUrl) {
  // Strip the base URL to recover the key
  const key = publicUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');

  await r2.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key:    key,
  }));
}
```

Call `deletePostImage(post.imageUrl)` (and `post.imageUrl2` if your comparison posts have two images) before deleting the DB row.

> **Do not block the deletePost response on this.** If R2 deletion fails, the post is still deleted from DB. Log the error and handle orphans with a cleanup job if needed.

---

## 7 — Database Schema Change

Your `posts` table (or equivalent) needs to store the image URL. If it already has an `imageUrl` column you're done. If not, add a migration:

### SQL (PostgreSQL / MySQL)

```sql
-- Add imageUrl column if it doesn't exist
ALTER TABLE posts ADD COLUMN image_url TEXT;

-- If your comparison posts need two images (option A vs option B):
ALTER TABLE posts ADD COLUMN image_url_a TEXT;
ALTER TABLE posts ADD COLUMN image_url_b TEXT;
```

### Mongoose (MongoDB)

```js
// In your Post schema:
const postSchema = new Schema({
  // ... existing fields ...
  imageUrl:  { type: String },   // single image
  imageUrlA: { type: String },   // option A — for comparison posts
  imageUrlB: { type: String },   // option B
});
```

> Expose `imageUrl` (and `imageUrlA` / `imageUrlB`) in your `Post` GraphQL type and `createPost` mutation input so the frontend can pass the R2 public URL when creating a post.

---

## 8 — `createPost` Mutation — Accept the Image URL

Update your existing `createPost` input to accept the URL returned by `getImageUploadUrl`:

```graphql
input CreatePostInput {
  # --- existing fields ---
  caption:    String
  categoryId: ID

  # Add these:
  imageUrl:  String    # for single-image posts
  imageUrlA: String    # for comparison post option A
  imageUrlB: String    # for comparison post option B
}
```

In the resolver, save the provided URL directly to the DB — no further R2 interaction needed at this step.

---

## 9 — Rate Limiting the Upload URL Endpoint

A malicious user could hammer `getImageUploadUrl` to generate thousands of presigned URLs, each allowing a write to your bucket. Add a simple rate limit:

### Option A — in-process with `rate-limiter-flexible` (simple)

```bash
npm install rate-limiter-flexible
```

```js
import { RateLimiterMemory } from 'rate-limiter-flexible';

const uploadLimiter = new RateLimiterMemory({
  points:   10,    // 10 presigned URLs
  duration: 60,    // per 60 seconds per user
});

// Inside getImageUploadUrl resolver, before the S3 call:
try {
  await uploadLimiter.consume(context.user.id);
} catch {
  throw new Error('Too many upload requests — please wait a moment');
}
```

### Option B — DigitalOcean App Platform (no code change)

DigitalOcean's built-in rate limiting can be configured in the App dashboard under **Settings → HTTP Routes** if your plan supports it.

---

## 10 — Checklist Before Deploying

- [ ] `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid` done
- [ ] All 5 environment variables set in DigitalOcean dashboard (Section 2.2)
- [ ] `R2_SECRET_ACCESS_KEY` marked as **Encrypted**
- [ ] `r2Client.js` created (Section 3)
- [ ] `PresignedUploadUrl` type + `getImageUploadUrl` mutation added to SDL (Section 4)
- [ ] Resolver implemented and merged (Section 5)
- [ ] `deletePost` resolver calls `deletePostImage` (Section 6)
- [ ] DB column(s) for image URL exist (Section 7)
- [ ] `createPost` input accepts `imageUrl` (Section 8)
- [ ] Rate limiting added (Section 9)
- [ ] `npm run build` passes with no errors
- [ ] Deployed to DigitalOcean — test `getImageUploadUrl` mutation via Playground

---

## 11 — Quick Smoke Test After Deploy

Run against the live backend URL:

```bash
# 1. Get a presigned URL (replace <TOKEN> with a valid JWT)
curl -X POST https://seashell-app-stt6c.ondigitalocean.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "query": "mutation { getImageUploadUrl(filename: \"test.jpg\", contentType: \"image/jpeg\") { uploadUrl publicUrl key } }"
  }'

# 2. Upload a test image to the returned uploadUrl
curl -X PUT "<uploadUrl from step 1>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/any-image.jpg

# 3. Open publicUrl in a browser — you should see the image
```

All three steps passing means the full backend integration is working.
