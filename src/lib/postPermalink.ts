/** Absolute URL for a post permalink (respects Vite `base` when not `/`). */
export function postPermalink(postId: string): string {
  const path = `/post/${postId}`;
  const base = import.meta.env.BASE_URL ?? "/";
  if (base === "/") {
    return `${window.location.origin}${path}`;
  }
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${window.location.origin}${normalized}${path}`;
}
