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
