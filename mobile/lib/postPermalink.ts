import * as Linking from "expo-linking";

/** Deep link that opens the post inside the native app (exp:// / ctrend://). */
export function postPermalink(postId: string): string {
  return Linking.createURL(`/post/${postId}`);
}

/** Public web URL — what users paste into a browser / share externally. */
const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN ?? "https://kejitbe.app";

export function postWebUrl(postId: string): string {
  return `${WEB_ORIGIN}/post/${postId}`;
}
