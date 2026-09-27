'use client';

import type { RotationDeg } from '@bro-pics/shared';

export interface PersonalizationDraftSlot {
  slotIndex: number;
  // Only the upload id, never the ephemeral originalUrl — the whole point
  // of this draft surviving a refresh (possibly hours later) is that a
  // fresh signed URL gets re-minted on restore via GET /api/uploads/{id}
  // (BE-08), never a stored one that's likely already expired.
  uploadId: string;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: RotationDeg;
  confirmedLowDpi: boolean;
}

export interface PersonalizationDraft {
  savedAt: string;
  activeSlotIndex: number;
  selectedClipartId: string | null;
  slots: PersonalizationDraftSlot[];
  textFields: Array<{ key: string; value: unknown }>;
}

// [FE-11] Well under BE-35's 30-day anonymous upload/customization cleanup
// window — a draft older than this is more likely to point at an already
// garbage-collected upload than to still be something worth restoring.
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function draftKey(productId: string, variantId: string): string {
  return `bropics_personalization_draft:${productId}:${variantId}`;
}

export function saveDraft(productId: string, variantId: string, draft: Omit<PersonalizationDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(draftKey(productId, variantId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Private browsing / storage quota / disabled localStorage — draft
    // autosave is a convenience, never something a customer's checkout
    // should be blocked by.
  }
}

export function loadDraft(productId: string, variantId: string): PersonalizationDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(productId, variantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersonalizationDraft;
    if (!parsed.savedAt || !Array.isArray(parsed.slots) || parsed.slots.length === 0) return null;
    const age = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(age) || age > DRAFT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(productId: string, variantId: string): void {
  try {
    localStorage.removeItem(draftKey(productId, variantId));
  } catch {
    // Same tolerance as saveDraft above.
  }
}
