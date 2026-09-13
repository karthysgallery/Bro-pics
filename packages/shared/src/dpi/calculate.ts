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

/**
 * At 90°/270° rotation, the crop rect's width/height axes (in the ORIGINAL
 * image's own pixel space) are swapped relative to the print's physical
 * width/height axes — a 90°-rotated photo's "width" in image-space maps to
 * the print's HEIGHT axis. Both the client editor (live DPI badge) and the
 * server (/api/customizations, on persist) need this exact same swap so the
 * DPI tier the customer sees always matches what gets persisted. Centralized
 * here after a second-round review caught the server's fix (Finding 4)
 * having no counterpart on the client (Finding: client DPI axis swap gap).
 */
export function printDimensionsForRotation(
  variant: { widthIn: number; heightIn: number },
  rotationDeg: number
): { printWidthIn: number; printHeightIn: number } {
  const rotationSwapsAxes = rotationDeg === 90 || rotationDeg === 270;
  return {
    printWidthIn: rotationSwapsAxes ? variant.heightIn : variant.widthIn,
    printHeightIn: rotationSwapsAxes ? variant.widthIn : variant.heightIn,
  };
}
