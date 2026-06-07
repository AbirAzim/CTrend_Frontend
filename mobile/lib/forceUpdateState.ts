export type ForceUpdateServerMessage = {
  minRequiredVersionCode: number;
  title: string;
  body: string;
};

let serverForcedUpdate: ForceUpdateServerMessage | null = null;
const listeners = new Set<() => void>();

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
