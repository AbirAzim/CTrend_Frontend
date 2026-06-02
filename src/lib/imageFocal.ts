/** Default center crop (CSS object-position / background-position). */
export const DEFAULT_IMAGE_FOCAL = 50;

export function clampFocal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_FOCAL;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function imageObjectPosition(
  focalX?: number | null,
  focalY?: number | null,
): string {
  return `${clampFocal(focalX ?? DEFAULT_IMAGE_FOCAL)}% ${clampFocal(focalY ?? DEFAULT_IMAGE_FOCAL)}%`;
}

export function hasCustomFocal(
  focalX?: number | null,
  focalY?: number | null,
): boolean {
  const x = clampFocal(focalX ?? DEFAULT_IMAGE_FOCAL);
  const y = clampFocal(focalY ?? DEFAULT_IMAGE_FOCAL);
  return x !== DEFAULT_IMAGE_FOCAL || y !== DEFAULT_IMAGE_FOCAL;
}
