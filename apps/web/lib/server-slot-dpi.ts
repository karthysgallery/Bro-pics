import type { Firestore } from 'firebase-admin/firestore';
import { effectiveDpiFromCropRect, legacySlotDpi, printDimensionsForRotation, type DpiResult, type FrameTemplate } from '@bro-pics/shared';

/** The frame template a customization was built on (single-field query, filtered in memory — no composite index needed). */
export async function loadFrameTemplateVersion(db: Firestore, variantId: string, version: unknown): Promise<FrameTemplate | null> {
  if (typeof version !== 'number') return null;
  const snapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
  return snapshot.docs.map((d) => d.data() as FrameTemplate).find((t) => t.version === version) ?? null;
}

/**
 * Server-trusted photo quality for one slot: upload size from the server's
 * own Upload doc, slot size and thresholds from the server's own template,
 * judged at the slot's real printed size — exactly what the shop shows.
 * Without a template (very old data) it falls back to the whole-frame size,
 * which is stricter, never looser.
 */
export function serverSlotDpi(input: {
  template: FrameTemplate | null;
  slotIndex: number;
  variant: { widthIn: number; heightIn: number };
  upload: { widthPx: number; heightPx: number };
  cropRect: { width: number; height: number };
  rotationDeg: unknown;
}): DpiResult {
  const rotationDeg = typeof input.rotationDeg === 'number' ? input.rotationDeg : 0;
  const slot = input.template?.printableRects?.find((r) => r.slotIndex === input.slotIndex);
  if (input.template && slot) {
    return legacySlotDpi({
      template: input.template,
      slot,
      variant: input.variant,
      uploadWidthPx: input.upload.widthPx,
      uploadHeightPx: input.upload.heightPx,
      cropRect: input.cropRect,
      rotationDeg,
    });
  }
  const { printWidthIn, printHeightIn } = printDimensionsForRotation(input.variant, rotationDeg);
  return effectiveDpiFromCropRect(input.upload.widthPx, input.upload.heightPx, input.cropRect, printWidthIn, printHeightIn);
}
