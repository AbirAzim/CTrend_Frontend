// Per-category accent color. Each category gets a distinct hue derived
// deterministically from its slug/name, so colors are stable across renders
// and differ per category without any admin setup. When the backend later
// exposes an admin-assigned `category.color` (hex), that takes precedence.
//
// The returned value is an "R G B" triplet (space-separated) for use in
// `rgb(var(--cat-rgb) / a)` / `color-mix(...)`. Theme adaptation (readable in
// both light + dark) is handled in CSS via color-mix — see `.cx-post-category`.

const CATEGORY_PALETTE: string[] = [
  "99 102 241", // indigo
  "16 185 129", // emerald
  "249 115 22", // orange
  "236 72 153", // pink
  "14 165 233", // sky
  "245 158 11", // amber
  "139 92 246", // violet
  "20 184 166", // teal
  "239 68 68", // red
  "132 204 22", // lime
  "6 182 212", // cyan
  "168 85 247", // purple
  "234 88 12", // burnt orange
  "13 148 136", // deep teal
  "217 70 239", // fuchsia
  "59 130 246", // blue
];

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hexToRgbTriplet(hex: string): string | null {
  const h = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

type CategoryLike = {
  slug?: string | null;
  name?: string | null;
  color?: string | null;
} | null | undefined;

/** Stable "R G B" triplet for a category. Admin `color` (hex) wins; else hashed palette. */
export function categoryColorRgb(cat: CategoryLike): string | null {
  if (!cat) return null;
  if (cat.color) {
    const fromHex = hexToRgbTriplet(cat.color);
    if (fromHex) return fromHex;
  }
  const key = (cat.slug || cat.name || "").trim().toLowerCase();
  if (!key) return null;
  return CATEGORY_PALETTE[hashKey(key) % CATEGORY_PALETTE.length];
}

function rgbTripletToHex(triplet: string): string {
  const parts = triplet.trim().split(/\s+/).map((n) => Number(n));
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Number.isFinite(v) ? v : 0))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`;
}

/** Effective hex color for a category (admin `color`, else derived). For UI pickers. */
export function categoryColorHex(cat: CategoryLike): string | null {
  const rgb = categoryColorRgb(cat);
  return rgb ? rgbTripletToHex(rgb) : null;
}
