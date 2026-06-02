import type { ImageContentPosition } from 'expo-image';

/** Default center crop (matches CSS object-position 50% 50%). */
export const DEFAULT_IMAGE_FOCAL = 50;

export function clampFocal(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_IMAGE_FOCAL;
	return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * expo-image `contentPosition` equivalent of CSS `object-position: x% y%`.
 * Used with `contentFit="cover"` so the focal point stays in frame.
 */
export function imageContentPosition(
	focalX?: number | null,
	focalY?: number | null,
): ImageContentPosition {
	return {
		left: `${clampFocal(focalX ?? DEFAULT_IMAGE_FOCAL)}%`,
		top: `${clampFocal(focalY ?? DEFAULT_IMAGE_FOCAL)}%`,
	};
}

export function hasCustomFocal(
	focalX?: number | null,
	focalY?: number | null,
): boolean {
	const x = clampFocal(focalX ?? DEFAULT_IMAGE_FOCAL);
	const y = clampFocal(focalY ?? DEFAULT_IMAGE_FOCAL);
	return x !== DEFAULT_IMAGE_FOCAL || y !== DEFAULT_IMAGE_FOCAL;
}
