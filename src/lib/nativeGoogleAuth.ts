import { Capacitor } from "@capacitor/core";
import { GoogleSignIn } from "@capawesome/capacitor-google-sign-in";

let initialized = false;

export function isNativeGoogleAuthAvailable(clientId: string): boolean {
  return Boolean(clientId) && Capacitor.isNativePlatform();
}

async function ensureInitialized(clientId: string): Promise<void> {
  if (initialized) return;
  await GoogleSignIn.initialize({
    clientId,
  });
  initialized = true;
}

export async function getNativeGoogleIdToken(
  clientId: string,
): Promise<string | null> {
  if (!isNativeGoogleAuthAvailable(clientId)) return null;
  await ensureInitialized(clientId);
  const result = await GoogleSignIn.signIn();
  return result.idToken ?? null;
}
