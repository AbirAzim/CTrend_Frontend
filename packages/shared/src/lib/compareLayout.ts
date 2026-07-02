export type CompareLayout = "horizontal" | "vertical";

/** Normalize API / form values to a feed-safe compare layout. */
export function normalizeCompareLayout(raw?: string | null): CompareLayout {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "vertical" ? "vertical" : "horizontal";
}

export function isVerticalCompareLayout(layout?: CompareLayout | string | null): boolean {
  return normalizeCompareLayout(layout) === "vertical";
}

/** GraphQL mutation input (uppercase enum). */
export function toGqlCompareLayout(layout: CompareLayout): "HORIZONTAL" | "VERTICAL" {
  return layout === "vertical" ? "VERTICAL" : "HORIZONTAL";
}

/**
 * Feed cell width÷height (matches FeedPostCard compare cells).
 * Binary side-by-side → 4:5 portrait; stacked → 16:9 landscape; 3+ → square.
 */
export function compareCellAspectRatio(layout: CompareLayout, optionCount: number): number {
  if (optionCount >= 3) return 1;
  return layout === "vertical" ? 16 / 9 : 4 / 5;
}

/**
 * CompareImageCropper frame height÷width — inverse of {@link compareCellAspectRatio}.
 */
export function compareCropAspect(layout: CompareLayout, optionCount: number): number {
  const wOverH = compareCellAspectRatio(layout, optionCount);
  return 1 / wOverH;
}
