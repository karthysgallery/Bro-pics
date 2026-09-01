export type DpiTier = 'green' | 'amber' | 'red';

export interface DpiResult {
  effectiveDpi: number;
  tier: DpiTier;
}

export function dpiTier(dpi: number): DpiTier {
  if (dpi >= 300) return 'green';
  if (dpi >= 150) return 'amber';
  return 'red';
}

/**
 * Effective DPI = pixels of the original image actually used inside the
 * printable area / print size in inches (spec §13). cropScale > 1 means
 * the customer has zoomed in, using fewer of the original pixels per inch
 * of print.
 */
export function calculateEffectiveDpi(
  originalWidthPx: number,
  originalHeightPx: number,
  cropScale: number,
  printWidthIn: number,
  printHeightIn: number
): DpiResult {
  const usedWidthPx = originalWidthPx / cropScale;
  const usedHeightPx = originalHeightPx / cropScale;
  const dpiFromWidth = usedWidthPx / printWidthIn;
  const dpiFromHeight = usedHeightPx / printHeightIn;
  const effectiveDpi = Math.min(dpiFromWidth, dpiFromHeight);

  return { effectiveDpi, tier: dpiTier(effectiveDpi) };
}

/**
 * DPI from an editor crop rectangle rather than a single zoom factor.
 * cropRect is in the upload's own original pixel space. The tighter
 * (larger) of the width/height zoom ratios wins, since that's the
 * dimension actually constraining print quality when the crop isn't
 * proportional to the upload's aspect ratio. Delegates to the existing,
 * already-tested calculateEffectiveDpi rather than duplicating its math.
 */
export function effectiveDpiFromCropRect(
  uploadWidthPx: number,
  uploadHeightPx: number,
  cropRect: { width: number; height: number },
  printWidthIn: number,
  printHeightIn: number
): DpiResult {
  const cropScale = Math.max(uploadWidthPx / cropRect.width, uploadHeightPx / cropRect.height);
  return calculateEffectiveDpi(uploadWidthPx, uploadHeightPx, cropScale, printWidthIn, printHeightIn);
}
