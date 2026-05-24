import { readStoredToken } from "./authStorage";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function uploadBaseUrl(): string {
  const gqlUrl = import.meta.env.VITE_GRAPHQL_HTTP as string;
  // Strip trailing /graphql (or any trailing path) to get the API root.
  return gqlUrl.replace(/\/graphql\/?$/, "");
}

export function useImageUpload() {
  async function uploadImage(file: File): Promise<string> {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error("Only JPEG, PNG, WebP, GIF, or AVIF images are allowed.");
    }
    if (file.size > MAX_BYTES) {
      throw new Error("Image must be under 10 MB.");
    }

    const token = readStoredToken();
    const body = new FormData();
    body.append("file", file);

    let res: Response;
    try {
      res = await fetch(`${uploadBaseUrl()}/uploads/image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
    } catch (networkErr) {
      console.error("[upload] network error:", networkErr);
      throw new Error("Upload failed — check your connection and try again.");
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[upload] server error:", res.status, text);
      throw new Error(
        `Upload failed (${res.status})${text ? `: ${text}` : ""}. Please try again.`,
      );
    }

    const json = (await res.json()) as { url?: string; publicUrl?: string };
    const publicUrl = json.url ?? json.publicUrl;
    if (!publicUrl) {
      throw new Error("Upload succeeded but no URL was returned.");
    }
    return publicUrl;
  }

  return { uploadImage };
}
