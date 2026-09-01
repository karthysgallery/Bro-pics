import { dpiTier } from '@bro-pics/shared';

export interface SlotCompletionResult {
  complete: boolean;
  reason?: string;
}

/**
 * A personalization is ready to add to cart when every slot has an
 * uploaded, positioned photo, and every slot's DPI is at least amber —
 * unless the customer has explicitly confirmed proceeding with a
 * red-tier (low-quality) photo via allowLowDpi.
 */
export function validateSlotsComplete(
  slotCount: number,
  customizationsBySlot: Map<number, { effectiveDpi: number }>,
  allowLowDpi: boolean
): SlotCompletionResult {
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const customization = customizationsBySlot.get(slotIndex);
    if (!customization) {
      return { complete: false, reason: `Slot ${slotIndex + 1} has no photo yet` };
    }
    if (dpiTier(customization.effectiveDpi) === 'red' && !allowLowDpi) {
      return { complete: false, reason: `Slot ${slotIndex + 1} photo DPI is too low for a sharp print` };
    }
  }
  return { complete: true };
}
