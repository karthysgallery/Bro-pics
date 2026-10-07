import { effectiveDpiFromCropRect, printDimensionsForRotation, type DpiResult, type DpiThresholds } from '../dpi/calculate';

/**
 * Where a frame template's printed artwork lands on the physical paper.
 *
 * A frame template is authored on a square editor canvas (all rects are
 * fractions of it) and shows a lot that is NOT printed — the wooden frame,
 * the wall. Only the template's print area is printed, fitted inside the
 * variant's paper (turned to the area's orientation, aspect kept, centred).
 * Everything — the print renderer, the shop's photo-quality badge and the
 * server's quality check — derives sizes from this one function, so they
 * cannot disagree.
 *
 * Units follow the paper you pass in: inches for DPI maths, pixels for
 * rendering.
 */

export interface FractionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PaperSize {
  width: number;
  height: number;
}

export interface PrintLayout {
  /** Paper size, turned to the print area's orientation. */
  paperWidth: number;
  paperHeight: number;
  /** The template's printed region, in editor-canvas fractions. */
  area: FractionRect;
  /** Paper units per 1.0 of editor canvas (the same on both axes — nothing is stretched). */
  unitsPerCanvas: number;
  /** Margin from the paper's edge to the print area, when the shapes differ. */
  offsetX: number;
  offsetY: number;
}

type SlotRect = FractionRect & { widthMm?: number; heightMm?: number; minDpi?: number; recommendedDpi?: number };

export interface LegacyPrintTemplate {
  printableRects: ReadonlyArray<SlotRect & { slotIndex: number }>;
  printArea?: FractionRect | null;
  textZones?: ReadonlyArray<FractionRect & { label?: string; fieldKey?: string }>;
}

/** The explicit print area, or the box around every photo slot. */
export function legacyPrintArea(template: Pick<LegacyPrintTemplate, 'printableRects' | 'printArea'>): FractionRect {
  if (template.printArea && template.printArea.width > 0 && template.printArea.height > 0) return template.printArea;
  const rects = template.printableRects;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function legacyPrintLayout(template: Pick<LegacyPrintTemplate, 'printableRects' | 'printArea'>, paper: PaperSize): PrintLayout {
  const area = legacyPrintArea(template);
  let { width: w, height: h } = paper;
  // Same orientation rule as template-v2's canvasPrintWidthIn: a portrait
  // design goes on portrait paper whichever way round the size is written.
  if (w !== h && area.width !== area.height && h > w !== area.height > area.width) [w, h] = [h, w];
  const unitsPerCanvas = Math.min(w / area.width, h / area.height);
  return {
    paperWidth: w,
    paperHeight: h,
    area,
    unitsPerCanvas,
    offsetX: (w - area.width * unitsPerCanvas) / 2,
    offsetY: (h - area.height * unitsPerCanvas) / 2,
  };
}

/** A canvas-fraction rect in paper units (may fall partly off the paper if outside the print area). */
export function rectOnPaper(rect: FractionRect, layout: PrintLayout): FractionRect {
  return {
    x: layout.offsetX + (rect.x - layout.area.x) * layout.unitsPerCanvas,
    y: layout.offsetY + (rect.y - layout.area.y) * layout.unitsPerCanvas,
    width: rect.width * layout.unitsPerCanvas,
    height: rect.height * layout.unitsPerCanvas,
  };
}

const EPSILON = 0.002;

/** Fully inside the print area (tiny rounding tolerance). */
export function isInsidePrintArea(rect: FractionRect, area: FractionRect): boolean {
  return (
    rect.x >= area.x - EPSILON &&
    rect.y >= area.y - EPSILON &&
    rect.x + rect.width <= area.x + area.width + EPSILON &&
    rect.y + rect.height <= area.y + area.height + EPSILON
  );
}

/** A slot's physical printed size in inches: its own mm size when set, otherwise its share of the paper. */
export function slotPrintSizeIn(slot: SlotRect, layout: PrintLayout): { widthIn: number; heightIn: number } {
  if (slot.widthMm && slot.heightMm) return { widthIn: slot.widthMm / 25.4, heightIn: slot.heightMm / 25.4 };
  return { widthIn: slot.width * layout.unitsPerCanvas, heightIn: slot.height * layout.unitsPerCanvas };
}

export function slotThresholds(slot: Pick<SlotRect, 'minDpi' | 'recommendedDpi'> | undefined): DpiThresholds {
  return { minDpi: slot?.minDpi, recommendedDpi: slot?.recommendedDpi };
}

/**
 * Effective print resolution of one photo slot: the photo's pixels that
 * actually land in the slot (after crop/zoom/rotation) over the slot's
 * real printed size, judged against that slot's own thresholds.
 */
export function legacySlotDpi(input: {
  template: Pick<LegacyPrintTemplate, 'printableRects' | 'printArea'>;
  slot: SlotRect;
  variant: { widthIn: number; heightIn: number };
  uploadWidthPx: number;
  uploadHeightPx: number;
  cropRect: { width: number; height: number };
  rotationDeg: number;
}): DpiResult {
  const layout = legacyPrintLayout(input.template, { width: input.variant.widthIn, height: input.variant.heightIn });
  const size = slotPrintSizeIn(input.slot, layout);
  const { printWidthIn, printHeightIn } = printDimensionsForRotation({ widthIn: size.widthIn, heightIn: size.heightIn }, input.rotationDeg);
  return effectiveDpiFromCropRect(input.uploadWidthPx, input.uploadHeightPx, input.cropRect, printWidthIn, printHeightIn, slotThresholds(input.slot));
}

/** Plain-language problems an admin should fix before customers order this size. */
export function legacyTemplatePrintWarnings(template: LegacyPrintTemplate, variant: { widthIn: number; heightIn: number }): string[] {
  const warnings: string[] = [];
  const layout = legacyPrintLayout(template, { width: variant.widthIn, height: variant.heightIn });
  const areaAspect = layout.area.width / layout.area.height;
  const paperAspect = layout.paperWidth / layout.paperHeight;
  if (Math.abs(areaAspect / paperAspect - 1) > 0.02) {
    warnings.push(
      `The printed area is ${areaAspect.toFixed(2)}:1 but the ${variant.widthIn}×${variant.heightIn} in paper is ${paperAspect.toFixed(2)}:1, so the print gets white margins. Make the printed area (or the photo slots) the paper's shape.`
    );
  }
  template.printableRects.forEach((r) => {
    if (!isInsidePrintArea(r, layout.area)) warnings.push(`Photo ${r.slotIndex + 1} is partly outside the printed area and will be cut off.`);
  });
  (template.textZones ?? []).forEach((z) => {
    if (!isInsidePrintArea(z, layout.area)) {
      warnings.push(`Text “${z.label ?? z.fieldKey ?? 'text'}” is outside the printed area, so it will NOT be printed. Move it inside, or widen the printed area.`);
    }
  });
  return warnings;
}
