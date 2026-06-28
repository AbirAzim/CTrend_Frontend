/** Suppress live notification/message sounds until the app UI is ready. */
const APP_LAUNCHED_AT = Date.now();
const STARTUP_QUIET_MS = 2500;
const POST_READY_QUIET_MS = 2000;

let appUiReady = false;
let appUiReadyAt = 0;

/** Call when splash hides and the themed shell is visible. */
export function markAppUiReadyForSounds(): void {
  appUiReady = true;
  appUiReadyAt = Date.now();
}

function inStartupQuietWindow(): boolean {
  if (!appUiReady) return true;
  if (Date.now() - APP_LAUNCHED_AT < STARTUP_QUIET_MS) return true;
  if (Date.now() - appUiReadyAt < POST_READY_QUIET_MS) return true;
  return false;
}

const heardNotificationIds = new Set<string>();
const heardMessageIds = new Set<string>();
const MAX_HEARD = 300;

function remember(set: Set<string>, id: string): boolean {
  if (set.has(id)) return false;
  set.add(id);
  if (set.size > MAX_HEARD) {
    const drop = set.values().next().value;
    if (drop) set.delete(drop);
  }
  return true;
}

export function shouldPlayLiveNotificationSound(notificationId?: string | null): boolean {
  if (inStartupQuietWindow()) return false;
  if (!notificationId) return true;
  return remember(heardNotificationIds, notificationId);
}

export function shouldPlayLiveMessageSound(messageId?: string | null): boolean {
  if (inStartupQuietWindow()) return false;
  if (!messageId) return true;
  return remember(heardMessageIds, messageId);
}
