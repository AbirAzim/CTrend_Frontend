// Followed World Cup team — persisted in localStorage and shared across the
// World Cup page and the floating feed widget via a tiny subscribe store so the
// widget reacts instantly when the page changes the selection.

import { useSyncExternalStore } from "react";

const KEY = "ctrend_wc_team";

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getFollowedTeam(): string | null {
  return read();
}

export function setFollowedTeam(teamName: string | null): void {
  try {
    if (teamName) localStorage.setItem(KEY, teamName);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / privacy mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab updates.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFollowedTeam(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
