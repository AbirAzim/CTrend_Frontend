# S3 Image Upload — Setup Guide

Your bucket name is already known: **ctrend**
You need to complete 4 steps in AWS, then give me 3 values.

---

## STEP 1 — Find your AWS Region

1. Go to your S3 bucket `ctrend` in the AWS console
2. Click the **Properties** tab
3. Look at the first field — **"Bucket ARN"**
   - It looks like: `arn:aws:s3:::ctrend`
   - The region is NOT in that ARN — look at the **browser URL bar** instead
   - It will contain something like `region=us-east-1` or `ap-south-1`
4. Or: click on the bucket name, look at the URL:
   `https://s3.console.aws.amazon.com/s3/buckets/ctrend?region=YOUR-REGION-HERE`

**Write down the region** (e.g. `ap-south-1`, `us-east-1`, etc.)

---

## STEP 2 — Create an IAM user with upload-only permission

This gives the frontend a key that can ONLY upload to S3, nothing else.

1. Go to **AWS Console → search "IAM" → click IAM**
2. In the left sidebar click **"Users"**
3. Click the orange **"Create user"** button
4. **User name:** type `ctrend-frontend-upload` → click Next
5. On the permissions page — click **"Attach policies directly"**
6. Do NOT search for existing policies. Instead click **"Create inline policy"** (small link at bottom right)
7. On the policy editor page, click the **"JSON"** tab
8. **Delete everything** in the box and paste this exactly:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::ctrend/*"
    }
  ]
}
```

9. Click **Next** → give the policy any name like `ctrend-s3-upload` → click **Create policy**
10. You'll be back on the user creation screen. Click **Next** → **Create user**

**Now get the access keys:**

11. Click on the user you just created (`ctrend-frontend-upload`)
12. Click the **"Security credentials"** tab
13. Scroll down to **"Access keys"** section → click **"Create access key"**
14. Select **"Application running outside AWS"** → click Next → click **Create access key**
15. You will see:
    - **Access key ID** — looks like `AKIAIOSFODNN7EXAMPLE`
    - **Secret access key** — looks like `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

> ⚠️ **Copy both now.** AWS will never show the secret again after you close this page.

---

## STEP 3 — Configure CORS on the bucket

This allows your browser to send files directly to S3 (without this, every upload will be blocked).

1. Go back to **S3 → ctrend bucket**
2. Click the **"Permissions"** tab
3. Scroll down to **"Cross-origin resource sharing (CORS)"**
4. Click **"Edit"**
5. **Delete everything** in the box and paste this:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://c-trend.vercel.app"
    ],
    "ExposeHeaders": ["ETag"]
  }
]
```

6. Replace `your-production-domain.com` with your real deployed URL (or leave it for now if not deployed yet)
7. Click **"Save changes"**

---

## STEP 4 — Make uploaded images publicly viewable

Without this, images upload successfully but nobody can see them in the feed.

**Part A — Turn off the block:**

1. In your `ctrend` bucket → **Permissions** tab
2. Click **"Block public access (bucket settings)"** → click **"Edit"**
3. **Uncheck** the checkbox that says "Block all public access"
4. Click **Save changes** → type `confirm` in the box → click **Confirm**

**Part B — Add a bucket policy:**

5. Still on the **Permissions** tab, scroll to **"Bucket policy"** → click **"Edit"**
6. **Delete everything** in the box and paste this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ctrend/*"
    }
  ]
}
```

7. Click **"Save changes"**

---

## FINAL — Give me these 3 values

Once all 4 steps are done, send me:

```
Region:          (from Step 1, e.g. ap-south-1)
Access Key ID:   (from Step 2, e.g. AKIAIOSFODNN7EXAMPLE)
Secret Key:      (from Step 2, e.g. wJalrXUtnFEMI/...)
```

I will then implement the image upload in the app (file picker + paste + drag and drop).
