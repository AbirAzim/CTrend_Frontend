// Per-category accent color for the mobile category chip. Mirrors the web
// `src/lib/categoryColor.ts` palette/hash so a category looks the same on both
// platforms. Admin-assigned `category.color` (hex) wins; otherwise a stable
// hue is derived from the slug/name. Theme adaptation is computed here in JS
// (React Native has no CSS color-mix).

const CATEGORY_PALETTE: Array<[number, number, number]> = [
  [99, 102, 241], // indigo
  [16, 185, 129], // emerald
  [249, 115, 22], // orange
  [236, 72, 153], // pink
  [14, 165, 233], // sky
  [245, 158, 11], // amber
  [139, 92, 246], // violet
  [20, 184, 166], // teal
  [239, 68, 68], // red
  [132, 204, 22], // lime
  [6, 182, 212], // cyan
  [168, 85, 247], // purple
  [234, 88, 12], // burnt orange
  [13, 148, 136], // deep teal
  [217, 70, 239], // fuchsia
  [59, 130, 246], // blue
];

type CategoryLike =
  | { slug?: string | null; name?: string | null; color?: string | null }
  | null
  | undefined;

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function categoryRgb(cat: CategoryLike): [number, number, number] | null {
  if (!cat) return null;
  if (cat.color) {
    const fromHex = hexToRgb(cat.color);
    if (fromHex) return fromHex;
  }
  const key = (cat.slug || cat.name || '').trim().toLowerCase();
  if (!key) return null;
  return CATEGORY_PALETTE[hashKey(key) % CATEGORY_PALETTE.length];
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] * (1 - t) + b[0] * t),
    Math.round(a[1] * (1 - t) + b[1] * t),
    Math.round(a[2] * (1 - t) + b[2] * t),
  ];
}

const FALLBACK_RGB: [number, number, number] = [100, 116, 139];

function chipColorsFromRgb(
  rgb: [number, number, number],
  isDark: boolean,
): { bg: string; text: string } {
  const [r, g, b] = rgb;
  const bg = `rgba(${r}, ${g}, ${b}, ${isDark ? 0.26 : 0.14})`;
  const t = isDark
    ? mix(rgb, [255, 255, 255], 0.28)
    : mix(rgb, [15, 23, 42], 0.18);
  const text = `rgb(${t[0]}, ${t[1]}, ${t[2]})`;
  return { bg, text };
}

/**
 * Returns `{ bg, text }` colors for the category chip, readable in both themes:
 * light = darkened text on a faint tint, dark = lightened text on a stronger tint.
 * Returns null when the category has no usable name/color.
 */
export function categoryChipColors(
  cat: CategoryLike,
  isDark: boolean,
): { bg: string; text: string } | null {
  const rgb = categoryRgb(cat);
  if (!rgb) return null;
  return chipColorsFromRgb(rgb, isDark);
}

/** Same chip colors as category; falls back to slate when category is missing. */
export function categoryChipColorsOrFallback(
  cat: CategoryLike,
  isDark: boolean,
): { bg: string; text: string } {
  return chipColorsFromRgb(categoryRgb(cat) ?? FALLBACK_RGB, isDark);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The palette as hex strings — used by the admin category color picker. */
export const CATEGORY_PALETTE_HEX: string[] = CATEGORY_PALETTE.map(rgbToHex);

/** Solid accent hex for a category: admin `color` wins, else the hashed palette hue. */
export function categoryColorHex(cat: CategoryLike): string | null {
  const rgb = categoryRgb(cat);
  return rgb ? rgbToHex(rgb) : null;
}
