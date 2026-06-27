import * as FileSystem from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";
import { Platform } from "react-native";

export type UploadUrlData = {
  getImageUploadUrl: { uploadUrl: string; publicUrl: string; key?: string };
};

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export function inferImageMimeType(
  uri: string,
  mimeType?: string | null,
  fileName?: string | null,
): string {
  if (mimeType && ALLOWED_MIME.has(mimeType)) return mimeType;
  const probe = (fileName ?? uri).toLowerCase();
  if (probe.endsWith(".gif")) return "image/gif";
  if (probe.endsWith(".png")) return "image/png";
  if (probe.endsWith(".webp")) return "image/webp";
  if (probe.endsWith(".avif")) return "image/avif";
  if (probe.endsWith(".jpg") || probe.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

export function mimeTypeFromAsset(asset: ImagePickerAsset): string {
  return inferImageMimeType(asset.uri, asset.mimeType, asset.fileName);
}

export async function uploadPresignedImage(
  getUploadUrl: (vars: {
    variables: { filename: string; contentType: string };
  }) => Promise<{ data?: UploadUrlData | null }>,
  uri: string,
  mimeType: string,
  fileName?: string,
): Promise<string> {
  const contentType = ALLOWED_MIME.has(mimeType) ? mimeType : "image/jpeg";
  const ext = contentType.split("/")[1] ?? "jpg";
  const filename = fileName ?? `chat_${Date.now()}.${ext}`;

  const { data } = await getUploadUrl({ variables: { filename, contentType } });
  if (!data?.getImageUploadUrl) throw new Error("Could not get upload URL");

  const { uploadUrl, publicUrl } = data.getImageUploadUrl;
  let uploadUri = uri;
  if (Platform.OS === "android" && !uri.startsWith("file://")) {
    uploadUri = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: uploadUri });
  }

  const res = await FileSystem.uploadAsync(uploadUrl, uploadUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": contentType },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return publicUrl;
}
