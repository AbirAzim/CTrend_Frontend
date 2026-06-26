/** Suppress live notification/message sounds briefly after cold start. */
const APP_LAUNCHED_AT = Date.now();
const STARTUP_QUIET_MS = 2500;

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
  if (Date.now() - APP_LAUNCHED_AT < STARTUP_QUIET_MS) return false;
  if (!notificationId) return true;
  return remember(heardNotificationIds, notificationId);
}

export function shouldPlayLiveMessageSound(messageId?: string | null): boolean {
  if (Date.now() - APP_LAUNCHED_AT < STARTUP_QUIET_MS) return false;
  if (!messageId) return true;
  return remember(heardMessageIds, messageId);
}
