/** Output orientation & canvas resolution helpers */

export type Orientation = 'portrait' | 'landscape';
/** User preference: auto follows the source image */
export type OrientationMode = 'auto' | Orientation;

export interface CanvasSize {
  width: number;
  height: number;
  orientation: Orientation;
  /** e.g. "9:16" or "16:9" */
  label: string;
}

/** Standard export resolutions */
export const PORTRAIT_SIZE = { width: 1080, height: 1920 } as const;
export const LANDSCAPE_SIZE = { width: 1920, height: 1080 } as const;

export function detectOrientation(
  image: { naturalWidth: number; naturalHeight: number } | null | undefined,
): Orientation {
  if (!image?.naturalWidth || !image.naturalHeight) return 'portrait';
  return image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait';
}

export function resolveOrientation(
  mode: OrientationMode,
  image?: { naturalWidth: number; naturalHeight: number } | null,
): Orientation {
  if (mode === 'auto') return detectOrientation(image);
  return mode;
}

export function resolveCanvasSize(
  mode: OrientationMode,
  image?: { naturalWidth: number; naturalHeight: number } | null,
): CanvasSize {
  const orientation = resolveOrientation(mode, image);
  if (orientation === 'landscape') {
    return {
      width: LANDSCAPE_SIZE.width,
      height: LANDSCAPE_SIZE.height,
      orientation,
      label: '16:9',
    };
  }
  return {
    width: PORTRAIT_SIZE.width,
    height: PORTRAIT_SIZE.height,
    orientation,
    label: '9:16',
  };
}

export function orientationLabel(mode: OrientationMode, resolved: Orientation): string {
  if (mode === 'auto') {
    return resolved === 'landscape' ? '自動 · 橫式' : '自動 · 直式';
  }
  return mode === 'landscape' ? '橫式' : '直式';
}
