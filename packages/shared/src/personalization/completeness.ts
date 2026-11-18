import { chosenCalendarDate, parseCalendarDate } from './calendar';
import { parseSpotifyLink } from './spotify';
import { dpiTier } from '../dpi/calculate';
import { ENGLISH_ONLY_MESSAGE, isEnglishText } from './english-text';
import { cropRectInOriginalPx, effectiveDpi, slotAspectRatio, type PrintSizeIn } from './geometry';
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
export interface CompletenessOptions {
  /** The frame size being bought; DPI is judged at that size (see canvasPrintWidthIn). */
  printSizeIn?: PrintSizeIn;
  /** Whether a low-resolution photo must be accepted before buying. Defaults to LOW_RES_CONFIRMATION_REQUIRED. */
  requireLowResConfirmation?: boolean;
}

/**
 * Feature flag: must a customer accept each low-resolution photo ("Print anyway" popup at Add to cart) before
 * buying? Switched OFF on 2026-11-18 at the owner's request: the product page shows a short print-quality notice
 * by the buy buttons instead, and low-resolution photos only add a non-blocking warning. Set back to true to
 * bring the popup (LowResDialog) and the "Print this photo anyway" tick back: the code is all still in place.
 */
export const LOW_RES_CONFIRMATION_REQUIRED = false;

export function checkCompleteness(template: PersonalizationTemplate, state: PersonalizationState, options: CompletenessOptions = {}): Completeness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const slots: SlotStatus[] = [];
  const requireLowRes = options.requireLowResConfirmation ?? LOW_RES_CONFIRMATION_REQUIRED;

  const photosByWhatsApp = state.photosVia === 'whatsapp';
  for (const slot of template.photoSlots) {
    const photo = state.slots[slot.id];
    if (!photo && photosByWhatsApp) {
      // The customer sends this photo on WhatsApp after ordering: not missing, just not here yet.
      slots.push({ slotId: slot.id, filled: false, required: slot.required });
      continue;
    }
    if (!photo) {
      slots.push({ slotId: slot.id, filled: false, required: slot.required });
      if (slot.required) blockers.push(`Add a photo for “${slot.label}”.`);
      else warnings.push(`“${slot.label}” is empty (optional).`);
      continue;
    }
    const aspect = slotAspectRatio(slot, template.canvas);
    const crop = cropRectInOriginalPx(photo.width, photo.height, photo.rotation, aspect, photo.transform);
    const dpi = effectiveDpi(crop, slot, template.canvas, options.printSizeIn);
    const tier = dpiTier(dpi, { minDpi: slot.minDpi, recommendedDpi: slot.recommendedDpi });
    const status: SlotStatus = { slotId: slot.id, filled: true, required: slot.required, dpi, tier };
    if (tier === 'red') {
      status.message = 'Your photo may appear low quality in the final print.';
      if (photo.confirmedLowDpi) warnings.push(`“${slot.label}”: low-resolution photo accepted.`);
      else if (!requireLowRes) warnings.push(`“${slot.label}”: low-resolution photo; it may print soft.`);
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
    if (slot.spotifyCode && value && !parseSpotifyLink(value)) blockers.push(`“${slot.label}”: paste a Spotify link (open.spotify.com/…).`);
    else if (!isEnglishText(value)) blockers.push(`“${slot.label}”: ${ENGLISH_ONLY_MESSAGE}`);
  }

  for (const slot of template.calendarSlots ?? []) {
    const picked = state.dates?.[slot.id]?.date;
    if (picked !== undefined && !parseCalendarDate(picked)) blockers.push(`“${slot.label}”: pick a valid date.`);
    else if (slot.required && !chosenCalendarDate(slot, state)) blockers.push(`Pick a date for “${slot.label}”.`);
  }

  return { complete: blockers.length === 0, blockers, warnings, slots };
}
