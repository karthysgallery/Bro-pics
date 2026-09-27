import { dpiTier } from '@bro-pics/shared';

export interface SlotCompletionResult {
  complete: boolean;
  reason?: string;
}

/**
 * [FE-12] A required text zone with no value yet blocks Add to Cart, the
 * same way an empty photo slot already does — checked separately from
 * `validateSlotsComplete` since it has nothing to do with photos/DPI.
 */
export function validateTextFieldsComplete(
  zones: Array<{ fieldKey: string; label: string; required?: boolean }>,
  textFields: Map<string, { value: string }>
): SlotCompletionResult {
  for (const zone of zones) {
    if (zone.required && !(textFields.get(zone.fieldKey)?.value ?? '').trim()) {
      return { complete: false, reason: `"${zone.label}" is required` };
    }
  }
  return { complete: true };
}

/**
 * A personalization is ready to add to cart when every slot has an
 * uploaded, positioned photo, and every slot's DPI is at least amber —
 * unless the customer has explicitly confirmed proceeding with THAT
 * slot's red-tier (low-quality) photo via its own confirmedLowDpi flag.
 * Confirmation is per-slot and per-photo: it must never silently apply to
 * a different slot, or survive a replacement photo in the same slot.
 */
export function validateSlotsComplete(
  slotCount: number,
  customizationsBySlot: Map<number, { effectiveDpi: number; confirmedLowDpi: boolean }>
): SlotCompletionResult {
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const customization = customizationsBySlot.get(slotIndex);
    if (!customization) {
      return { complete: false, reason: `Slot ${slotIndex + 1} has no photo yet` };
    }
    if (dpiTier(customization.effectiveDpi) === 'red' && !customization.confirmedLowDpi) {
      return { complete: false, reason: `Slot ${slotIndex + 1} photo DPI is too low for a sharp print` };
    }
  }
  return { complete: true };
}
