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
