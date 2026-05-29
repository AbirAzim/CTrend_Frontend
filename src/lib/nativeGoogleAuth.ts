/** Web-only; native Google sign-in lives in the Expo app (`mobile/`). */
export function isNativeGoogleAuthAvailable(clientId: string): boolean {
  void clientId;
  return false;
}

export async function getNativeGoogleIdToken(
  clientId: string,
): Promise<string | null> {
  void clientId;
  return null;
}
