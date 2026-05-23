import { useMutation } from "@apollo/client";
import { GET_IMAGE_UPLOAD_URL } from "../graphql/upload";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// CRC32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32ToBase64(buffer: ArrayBuffer): string {
  let crc = 0xffffffff;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  // Encode as big-endian 4-byte base64
  const b = new Uint8Array(4);
  b[0] = (crc >>> 24) & 0xff;
  b[1] = (crc >>> 16) & 0xff;
  b[2] = (crc >>> 8) & 0xff;
  b[3] = crc & 0xff;
  return btoa(String.fromCharCode(...b));
}

export function useImageUpload() {
  const [getUploadUrl] = useMutation(GET_IMAGE_UPLOAD_URL);

  async function uploadImage(file: File): Promise<string> {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Only JPEG, PNG, WebP, GIF, or AVIF images are allowed.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("Image must be under 10 MB.");
    }

    const { data } = await getUploadUrl({
      variables: { filename: file.name, contentType: file.type },
    });

    const { uploadUrl, publicUrl } = data.getImageUploadUrl;

    // Read file as ArrayBuffer so we can compute CRC32 for R2's required header
    const buffer = await file.arrayBuffer();
    const checksum = crc32ToBase64(buffer);

    // Debug logging — open DevTools console, then try uploading to see these.
    // Copy the curl command to test R2 directly (bypasses browser CORS).
    console.debug("[R2 upload] presigned URL:", uploadUrl);
    console.debug("[R2 upload] checksum:", checksum);
    console.debug(
      `[R2 upload] test with curl:\ncurl -X PUT '${uploadUrl}' \\\n  -H 'Content-Type: ${file.type}' \\\n  -H 'x-amz-checksum-crc32: ${checksum}' \\\n  --data-binary @/path/to/your-image.jpg`
    );

    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "x-amz-checksum-crc32": checksum,
        },
        body: buffer,
      });
    } catch (networkErr) {
      // "Failed to fetch" = CORS preflight blocked OR no network.
      // Open DevTools → Network → filter "r2.cloudflarestorage.com" to see the failed OPTIONS/PUT.
      console.error("[R2 upload] Network/CORS error:", networkErr);
      throw new Error(
        "Upload blocked — likely a CORS issue on the R2 bucket. " +
        "Check the browser DevTools Network tab for a failed request to r2.cloudflarestorage.com " +
        "and verify the bucket CORS policy in the Cloudflare dashboard."
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[R2 upload] Error response:", res.status, text);
      throw new Error(`Upload failed (${res.status})${text ? `: ${text}` : ""}. Please try again.`);
    }

    return publicUrl as string;
  }

  return { uploadImage };
}
