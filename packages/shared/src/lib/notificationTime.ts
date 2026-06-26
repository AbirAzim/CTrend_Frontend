/** When a grouped notification badge updates, `updatedAt` is bumped — use for sort + display. */
export function notificationActivityAt(n: {
  updatedAt?: string | null;
  createdAt: string;
}): string {
  return n.updatedAt ?? n.createdAt;
}
