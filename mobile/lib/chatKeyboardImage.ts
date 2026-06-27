import type { NativeSyntheticEvent } from "react-native";
import { inferImageMimeType } from "./presignedImageUpload";

export type KeyboardImageEvent = NativeSyntheticEvent<{
  uri: string;
  data: string;
  linkUri?: string | null;
  mime?: string | null;
}>;

export type KeyboardImagePayload = { uri: string; mimeType: string };

export function keyboardImagePayload(event: KeyboardImageEvent): KeyboardImagePayload | null {
  const { uri, mime } = event.nativeEvent;
  if (!uri) return null;
  return { uri, mimeType: inferImageMimeType(uri, mime) };
}
