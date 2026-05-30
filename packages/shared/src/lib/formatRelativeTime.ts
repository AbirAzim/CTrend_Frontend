export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(seconds);
  const past = seconds >= 0;

  if (abs < 60) return past ? "just now" : "in a few seconds";
  const minutes = Math.round(abs / 60);
  if (abs < 3600) return past ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(abs / 3600);
  if (abs < 86400) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(abs / 86400);
  if (abs < 7 * 86400) return past ? `${days}d ago` : `in ${days}d`;
  const weeks = Math.round(abs / (7 * 86400));
  if (abs < 30 * 86400) return past ? `${weeks}w ago` : `in ${weeks}w`;
  const months = Math.round(abs / (30 * 86400));
  if (abs < 365 * 86400) return past ? `${months}mo ago` : `in ${months}mo`;
  const years = Math.round(abs / (365 * 86400));
  return past ? `${years}y ago` : `in ${years}y`;
}
