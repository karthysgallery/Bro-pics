/**
 * [ABE-06] The exact calculation scripts/seed/src/data.ts's own
 * `toPrintPixels` helper has used inline since variants were first
 * seeded — extracted here, byte-identical, so the admin variant write API
 * derives `printWidthPx`/`printHeightPx`/`minUploadPx` the same way
 * instead of drifting. `minUploadPx` mirrors `printWidthPx`: the minimum
 * original-image width (px) needed to hit 300 DPI at this print size,
 * same definition seed already used (`minUploadPx: printWidthPx`).
 */
export interface VariantPrintPixels {
  printWidthPx: number;
  printHeightPx: number;
  minUploadPx: number;
}

export function deriveVariantPrintPixels(widthIn: number, heightIn: number): VariantPrintPixels {
  const printWidthPx = Math.round(widthIn * 300);
  const printHeightPx = Math.round(heightIn * 300);
  return { printWidthPx, printHeightPx, minUploadPx: printWidthPx };
}
