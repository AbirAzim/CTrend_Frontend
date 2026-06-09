// Followed World Cup team (mobile) — persisted in AsyncStorage and shared
// across the World Cup screen and the floating feed widget via a tiny store.
// AsyncStorage is async, so we keep a synchronous in-memory cache (hydrated
// once on load) for useSyncExternalStore to read.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const KEY = "ctrend_wc_team";

let current: string | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

// Hydrate once.
void AsyncStorage.getItem(KEY)
  .then((v) => {
    hydrated = true;
    if (v && v !== current) {
      current = v;
      notify();
    }
  })
  .catch(() => {
    hydrated = true;
  });

export function getFollowedTeam(): string | null {
  return current;
}

export function isHydrated(): boolean {
  return hydrated;
}

export function setFollowedTeam(teamName: string | null): void {
  current = teamName;
  notify();
  if (teamName) void AsyncStorage.setItem(KEY, teamName).catch(() => {});
  else void AsyncStorage.removeItem(KEY).catch(() => {});
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useFollowedTeam(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
