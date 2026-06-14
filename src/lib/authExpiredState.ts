const listeners = new Set<() => void>();
let _expired = false;

export function signalAuthExpired(): void {
  if (_expired) return;
  _expired = true;
  listeners.forEach((fn) => fn());
}

export function clearAuthExpired(): void {
  _expired = false;
}

export function onAuthExpired(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
