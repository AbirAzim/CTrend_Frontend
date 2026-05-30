import * as Linking from "expo-linking";

export function postPermalink(postId: string): string {
  return Linking.createURL(`/post/${postId}`);
}
