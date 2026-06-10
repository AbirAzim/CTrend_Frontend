export type ForceUpdateServerMessage = {
  minRequiredVersionCode: number;
  title: string;
  body: string;
};

type GraphqlErrorLike = {
  message?: string;
  extensions?: Record<string, unknown>;
};

let serverForcedUpdate: ForceUpdateServerMessage | null = null;
const listeners = new Set<() => void>();

function parseVersionExt(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function messageFromExtensions(ext: Record<string, unknown>): ForceUpdateServerMessage {
  return {
    minRequiredVersionCode: parseVersionExt(ext.minAndroidVersionCode),
    title: String(ext.title ?? "Update required"),
    body: String(
      ext.body ??
        "A newer version of Ke Jitbe is available. Please update from Google Play.",
    ),
  };
}

/** True when an ANDROID_UPDATE_REQUIRED error was applied. */
export function applyForceUpdateFromGraphqlErrors(
  errors: readonly GraphqlErrorLike[] | undefined,
): boolean {
  for (const err of errors ?? []) {
    const ext = err.extensions;
    if (ext?.code === "ANDROID_UPDATE_REQUIRED") {
      setForceUpdateFromGraphqlError(messageFromExtensions(ext));
      return true;
    }
  }
  return false;
}

/**
 * Backend returns ANDROID_UPDATE_REQUIRED with HTTP 500. Apollo surfaces that as
 * networkError (not graphQLErrors), so we must read errors from the response body.
 */
export function applyForceUpdateFromApolloNetworkError(networkError: unknown): boolean {
  if (!networkError || typeof networkError !== "object") return false;
  const ne = networkError as {
    result?: { errors?: GraphqlErrorLike[] };
    bodyText?: string;
  };
  if (applyForceUpdateFromGraphqlErrors(ne.result?.errors)) return true;
  if (ne.bodyText) {
    try {
      const parsed = JSON.parse(ne.bodyText) as { errors?: GraphqlErrorLike[] };
      return applyForceUpdateFromGraphqlErrors(parsed.errors);
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function setForceUpdateFromGraphqlError(msg: ForceUpdateServerMessage): void {
  serverForcedUpdate = msg;
  listeners.forEach((fn) => fn());
}

export function getForceUpdateFromGraphqlError(): ForceUpdateServerMessage | null {
  return serverForcedUpdate;
}

export function subscribeForceUpdateFromGraphqlError(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearForceUpdateFromGraphqlError(): void {
  serverForcedUpdate = null;
  listeners.forEach((fn) => fn());
}
