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

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "x-amz-checksum-crc32": checksum,
      },
      body: buffer,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status})${text ? `: ${text}` : ""}. Please try again.`);
    }

    return publicUrl as string;
  }

  return { uploadImage };
}
