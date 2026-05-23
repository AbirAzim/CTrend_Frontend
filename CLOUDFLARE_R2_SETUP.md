# Cloudflare R2 Image Upload Integration — CTrend

**Architecture**: User device → Frontend (React) → requests presigned URL from Backend (DigitalOcean) → Frontend uploads directly to Cloudflare R2 → R2 URL saved via GraphQL mutation.

This keeps the image bytes off your backend server entirely — the backend only generates a short-lived signed URL and stores the final URL string.

---

## Overview of the Full Flow

```
[User picks image]
        │
        ▼
[Frontend requests presigned URL]  ──GraphQL mutation──▶  [Backend on DigitalOcean]
                                                                    │
                                                    generates presigned PUT URL
                                                    using R2 S3-compatible API
                                                                    │
        ◀──────────────────────────────────────────────────────────┘
        │  { uploadUrl, publicUrl }
        ▼
[Frontend PUTs image bytes directly to R2]
        │
        ▼
[Frontend sends publicUrl in createPost GraphQL mutation]
        │
        ▼
[Backend saves publicUrl to database — done]
```

---

## Section 1 — Cloudflare R2 Bucket Setup

### 1.1 Create a Cloudflare Account & Enable R2

1. Go to https://dash.cloudflare.com and sign up / log in.
2. In the left sidebar click **R2 Object Storage**.
3. If first time, click **Purchase R2** — the free tier covers 10 GB storage + 1 million operations/month, no credit card charge until exceeded.

### 1.2 Create the Bucket

1. Click **Create bucket**.
2. **Bucket name**: `ctrend-images` (lowercase, hyphens only — this name appears in URLs).
3. **Location**: choose the region closest to your DigitalOcean backend (e.g. `ENAM` for US East, `WEUR` for Western Europe).
4. Click **Create bucket**.

### 1.3 Configure CORS (Critical — without this browser uploads will fail)

1. Inside your bucket, go to **Settings** tab → scroll to **CORS Policy**.
2. Click **Edit CORS policy** and paste:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://your-production-frontend-domain.com"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> Replace `https://your-production-frontend-domain.com` with your actual frontend URL. During development `http://localhost:5173` covers Vite's default port.

3. Click **Save**.

### 1.4 Make the Bucket Publicly Readable (for serving images)

1. Still in bucket **Settings**, find **Public access**.
2. Enable **Allow Access** — this lets anyone read objects (images) via URL.
3. Note the **Public bucket URL**, it looks like:
   ```
   https://pub-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.r2.dev
   ```
   Save this — you'll use it to construct public image URLs.

> **Optional but recommended**: connect a custom domain (e.g. `images.ctrend.app`) in the **Custom Domains** section for cleaner URLs.

### 1.5 Generate R2 API Credentials

These credentials allow your **backend** to generate presigned URLs.

1. In the Cloudflare dashboard, go to **R2 Object Storage** → **Manage R2 API Tokens** (top right).
2. Click **Create API token**.
3. Settings:
   - **Token name**: `ctrend-backend`
   - **Permissions**: `Object Read & Write`
   - **Specify bucket**: select `ctrend-images` (restrict to one bucket)
   - **TTL**: No expiry (or set a long expiry and rotate manually)
4. Click **Create API Token**.
5. **Copy and save immediately** — you will not see the secret again:
   - `Access Key ID` → e.g. `abc123...`
   - `Secret Access Key` → e.g. `xyz789...`

### 1.6 Find Your Cloudflare Account ID

1. In the Cloudflare dashboard, click any zone or go to the **Overview** page of your account.
2. In the right sidebar you'll see **Account ID** — copy it.
   - Format: `a1b2c3d4e5f6...` (32 hex characters)

The R2 endpoint your backend will connect to is:
```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

---

## Section 2 — Backend Changes (Node.js / GraphQL on DigitalOcean)

Your backend is at `https://seashell-app-stt6c.ondigitalocean.app/`.

### 2.1 Install Required Packages

SSH into your backend or run in its source repo:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

> R2 is S3-compatible, so the official AWS SDK works — you just point it at the R2 endpoint.

### 2.2 Add Environment Variables to DigitalOcean

1. Go to https://cloud.digitalocean.com → **Apps** → your backend app.
2. Click **Settings** → **App-Level Environment Variables** → **Edit**.
3. Add these variables:

| Key | Value |
|-----|-------|
| `CLOUDFLARE_ACCOUNT_ID` | your 32-char account ID from Section 1.6 |
| `R2_ACCESS_KEY_ID` | Access Key ID from Section 1.5 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key from Section 1.5 |
| `R2_BUCKET_NAME` | `ctrend-images` |
| `R2_PUBLIC_URL` | `https://pub-xxxxxxxx.r2.dev` (from Section 1.4) |

4. Click **Save** — DigitalOcean will redeploy automatically.

### 2.3 Create the R2 Client Module

Create `src/lib/r2Client.js` (or `.ts`) in your backend:

```js
import { S3Client } from '@aws-sdk/client-s3';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
```

### 2.4 Add the GraphQL Schema Type and Mutation

In your GraphQL type definitions, add:

```graphql
type PresignedUploadUrl {
  uploadUrl: String!   # PUT this URL with the raw image bytes
  publicUrl: String!   # Store this in the DB — the permanent image URL
  key: String!         # R2 object key, for reference
}

type Mutation {
  # ... your existing mutations ...

  getImageUploadUrl(
    filename: String!       # original filename e.g. "photo.jpg"
    contentType: String!    # MIME type e.g. "image/jpeg"
  ): PresignedUploadUrl!
}
```

### 2.5 Implement the Resolver

```js
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2 } from '../lib/r2Client.js';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid

const resolvers = {
  Mutation: {
    // ... your existing resolvers ...

    getImageUploadUrl: async (_parent, { filename, contentType }, context) => {
      // Require authentication
      if (!context.user) throw new Error('Not authenticated');

      // Sanitise and build a unique key to avoid collisions
      const ext = filename.split('.').pop().toLowerCase();
      const key = `posts/${context.user.id}/${uuidv4()}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });

      // URL expires in 5 minutes — enough time for the upload
      const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 300 });

      const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

      return { uploadUrl, publicUrl, key };
    },
  },
};
```

> **Security note**: always check `context.user` before generating a presigned URL. An unauthenticated user should never get write access to your bucket.

### 2.6 (Optional) Delete Images on Post Deletion

If posts can be deleted, clean up R2 too:

```js
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

// Inside your deletePost resolver:
const key = post.imageUrl.replace(`${process.env.R2_PUBLIC_URL}/`, '');
await r2.send(new DeleteObjectCommand({
  Bucket: process.env.R2_BUCKET_NAME,
  Key: key,
}));
```

---

## Section 3 — Frontend Changes (React + Apollo)

### 3.1 Add the GraphQL Mutation

Create or add to `src/graphql/upload.ts`:

```ts
import { gql } from '@apollo/client';

export const GET_IMAGE_UPLOAD_URL = gql`
  mutation GetImageUploadUrl($filename: String!, $contentType: String!) {
    getImageUploadUrl(filename: $filename, contentType: $contentType) {
      uploadUrl
      publicUrl
      key
    }
  }
`;
```

### 3.2 Create a Reusable Upload Hook

Create `src/lib/useImageUpload.ts`:

```ts
import { useMutation } from '@apollo/client';
import { GET_IMAGE_UPLOAD_URL } from '../graphql/upload';

interface UploadResult {
  publicUrl: string;
}

export function useImageUpload() {
  const [getUploadUrl] = useMutation(GET_IMAGE_UPLOAD_URL);

  const uploadImage = async (file: File): Promise<UploadResult> => {
    // 1. Get presigned URL from backend
    const { data } = await getUploadUrl({
      variables: {
        filename: file.name,
        contentType: file.type,
      },
    });

    const { uploadUrl, publicUrl } = data.getImageUploadUrl;

    // 2. PUT image bytes directly to R2 — backend never sees the bytes
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    // 3. Return the permanent public URL to store in the post
    return { publicUrl };
  };

  return { uploadImage };
}
```

### 3.3 Wire It Into CreatePostPage

In `src/pages/CreatePostPage.tsx`, integrate the hook:

```tsx
import { useImageUpload } from '../lib/useImageUpload';
import { useMutation } from '@apollo/client';
import { CREATE_POST } from '../graphql/feed';

export default function CreatePostPage() {
  const { uploadImage } = useImageUpload();
  const [createPost] = useMutation(CREATE_POST);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    // Validate file type
    if (!selected.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate size — 10 MB limit
    if (selected.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    setError(null);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // 1. Upload image to R2
      const { publicUrl } = await uploadImage(file);

      // 2. Create post with the image URL
      await createPost({
        variables: {
          imageUrl: publicUrl,
          // ... other post fields
        },
      });

      // 3. Navigate to feed on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {preview && (
        <img src={preview} alt="Preview" style={{ maxWidth: 300 }} />
      )}

      {error && <p className="ig-error">{error}</p>}

      <button type="submit" disabled={!file || uploading}>
        {uploading ? 'Uploading...' : 'Post'}
      </button>
    </form>
  );
}
```

---

## Section 4 — Environment Variables Summary

### Backend (DigitalOcean App — set in dashboard)

```env
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f6...          # 32-char hex
R2_ACCESS_KEY_ID=abc123...
R2_SECRET_ACCESS_KEY=xyz789...
R2_BUCKET_NAME=ctrend-images
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

### Frontend — none required

The frontend only calls your own GraphQL backend to get the presigned URL. It never holds R2 credentials. This is intentional and correct — never put `R2_SECRET_ACCESS_KEY` in the frontend.

---

## Section 5 — Testing the Integration

### 5.1 Test the Presigned URL Generation (backend only)

Use GraphQL Playground or Insomnia against `https://seashell-app-stt6c.ondigitalocean.app/graphql`:

```graphql
mutation {
  getImageUploadUrl(filename: "test.jpg", contentType: "image/jpeg") {
    uploadUrl
    publicUrl
    key
  }
}
```

Expected response:
```json
{
  "data": {
    "getImageUploadUrl": {
      "uploadUrl": "https://ctrend-images.a1b2c3.r2.cloudflarestorage.com/posts/user-id/uuid.jpg?X-Amz-...",
      "publicUrl": "https://pub-xxxx.r2.dev/posts/user-id/uuid.jpg",
      "key": "posts/user-id/uuid.jpg"
    }
  }
}
```

### 5.2 Test the Direct Upload (curl)

Copy `uploadUrl` from the response above and run:

```bash
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/path/to/test.jpg
```

Expected: HTTP 200 with empty body.

### 5.3 Verify the Image is Public

Open `publicUrl` from the response in a browser. You should see the image.

### 5.4 Test End-to-End in the App

1. Start the dev server: `npm run dev`
2. Log in, go to Create Post
3. Pick an image from your device
4. Submit — watch Network tab in DevTools
5. You should see:
   - POST to `/graphql` → `getImageUploadUrl` mutation ✓
   - PUT to `*.r2.cloudflarestorage.com/...` with image bytes ✓
   - POST to `/graphql` → `createPost` mutation with `publicUrl` ✓
6. Navigate to feed — image loads from `pub-xxxx.r2.dev`

---

## Section 6 — Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `CORS error` on PUT to R2 | CORS not configured on bucket | Re-check Section 1.3, ensure your frontend origin is listed |
| `403 Forbidden` on PUT | Presigned URL expired or wrong credentials | Check env vars on DigitalOcean; URL expires in 5 min |
| `SignatureDoesNotMatch` | Wrong `R2_SECRET_ACCESS_KEY` | Regenerate API token in Cloudflare, update env var |
| `NoSuchBucket` | Wrong `R2_BUCKET_NAME` | Verify bucket name exactly matches in Cloudflare dashboard |
| Image URL `404` | Bucket not set to public | Re-check Section 1.4, enable public access |
| `Content-Type mismatch` | Frontend not sending `Content-Type` header on PUT | Ensure `headers: { 'Content-Type': file.type }` is in the fetch call |
| Upload works but image broken | File sent as base64 instead of binary | Use `body: file` (the `File` object directly), not `body: btoa(...)` |

---

## Section 7 — Cost Estimate for CTrend

**R2 Free Tier (per month)**:
- 10 GB storage
- 1,000,000 Class A operations (writes/deletes)
- 10,000,000 Class B operations (reads)
- **Egress: always free**

**Beyond free tier**:
- Storage: $0.015 / GB
- Class A ops: $4.50 / million
- Class B ops: $0.36 / million
- Egress: $0.00

For a typical social app with ~1,000 active users posting a few images a week, you'll stay well within the free tier for many months.
