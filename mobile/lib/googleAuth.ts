import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

let configured = false;

export function isGoogleSignInConfigured(): boolean {
  return Boolean(webClientId);
}

function ensureConfigured(): void {
  if (!webClientId || configured) return;
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  configured = true;
}

export async function signInWithGoogleIdToken(): Promise<string> {
  if (!webClientId) {
    throw new Error(
      "Google sign-in is not configured (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).",
    );
  }
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (isCancelledResponse(result)) {
    throw new Error("Google sign-in was cancelled.");
  }
  const idToken = result.data.idToken;
  if (!idToken) {
    const tokens = await GoogleSignin.getTokens();
    if (!tokens.idToken) {
      throw new Error("Google did not return an ID token.");
    }
    return tokens.idToken;
  }
  return idToken;
}

export function googleSignInErrorMessage(err: unknown): string {
  if (isErrorWithCode(err)) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      return "Google sign-in was cancelled.";
    }
    if (err.code === statusCodes.IN_PROGRESS) {
      return "Google sign-in is already in progress.";
    }
    if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return "Google Play Services is not available on this device.";
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return "Google sign-in failed.";
}
