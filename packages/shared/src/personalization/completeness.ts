import { dpiTier } from '../dpi/calculate';
import { cropRectInOriginalPx, effectiveDpi, slotAspectRatio } from './geometry';
import type { PersonalizationState } from './state';
import type { PersonalizationTemplate } from './template-schema';

export interface SlotStatus {
  slotId: string;
  filled: boolean;
  required: boolean;
  /** Effective print resolution of the visible region, when filled. */
  dpi?: number;
  tier?: 'green' | 'amber' | 'red';
  /** Customer-facing explanation when this slot blocks or warns. */
  message?: string;
}

export interface Completeness {
  /** True when the design can be added to the cart. */
  complete: boolean;
  /** Customer-facing reasons it can't be (empty required slots, unaccepted low-res photos, missing text). */
  blockers: string[];
  /** Non-blocking notes (optional slot empty, accepted low-res photo). */
  warnings: string[];
  slots: SlotStatus[];
}

/**
 * Is this personalization ready to buy? One function, used by the editor's
 * Continue button, add-to-cart and the server's order validation — so the
 * rules cannot differ between the screen and the check that actually matters.
 *
 * A red-tier (low-resolution) photo blocks only until the customer has
 * explicitly accepted the warning for THAT photo ("don't block unnecessarily").
 */
export function checkCompleteness(template: PersonalizationTemplate, state: PersonalizationState): Completeness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const slots: SlotStatus[] = [];

  for (const slot of template.photoSlots) {
    const photo = state.slots[slot.id];
    if (!photo) {
      slots.push({ slotId: slot.id, filled: false, required: slot.required });
      if (slot.required) blockers.push(`Add a photo for “${slot.label}”.`);
      else warnings.push(`“${slot.label}” is empty (optional).`);
      continue;
    }
    const aspect = slotAspectRatio(slot, template.canvas);
    const crop = cropRectInOriginalPx(photo.width, photo.height, photo.rotation, aspect, photo.transform);
    const dpi = effectiveDpi(crop, slot, template.canvas);
    const tier = dpiTier(dpi);
    const status: SlotStatus = { slotId: slot.id, filled: true, required: slot.required, dpi, tier };
    if (tier === 'red') {
      status.message = 'Your photo may appear low quality in the final print.';
      if (photo.confirmedLowDpi) warnings.push(`“${slot.label}”: low-resolution photo accepted.`);
      else blockers.push(`“${slot.label}”: this photo is too low-resolution for a sharp print. Use a larger photo, or confirm to continue anyway.`);
    } else if (tier === 'amber') {
      status.message = 'This photo is acceptable but not perfectly sharp at this size.';
    }
    slots.push(status);
  }

  for (const slot of template.textSlots) {
    const value = (state.texts[slot.id]?.value ?? slot.defaultValue).trim();
    if (slot.required && !value) blockers.push(`Enter “${slot.label}”.`);
    if (value.length > slot.maxLength) blockers.push(`“${slot.label}” is too long (max ${slot.maxLength} characters).`);
  }

  return { complete: blockers.length === 0, blockers, warnings, slots };
}
