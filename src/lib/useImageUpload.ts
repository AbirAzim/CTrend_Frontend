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

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}). Please try again.`);
    }

    return publicUrl as string;
  }

  return { uploadImage };
}
