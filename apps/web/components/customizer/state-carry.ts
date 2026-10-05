import { createEmptyState, type PersonalizationState, type PersonalizationTemplate } from '@bro-pics/shared';

const IDENTITY = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Moves a customer's work onto another template: a newer version of the same
 * design, or a different layout chosen for another frame size. Nothing they
 * did is silently lost when it still fits:
 *  - same design: photos and text stay on the slots with the same ids, framing kept;
 *  - other design: photos fill the new slots in order (framing reset, since the
 *    slot shapes differ), and text moves to fields with the same id.
 * Returns the new state and how many photos had no slot left.
 */
export function carryOverState(prev: PersonalizationState, next: PersonalizationTemplate): { state: PersonalizationState; dropped: number } {
  const state = createEmptyState(next.id, next.version);
  const sameDesign = prev.templateId === next.id;
  let dropped = 0;

  if (sameDesign) {
    const ids = new Set(next.photoSlots.map((s) => s.id));
    for (const [slotId, photo] of Object.entries(prev.slots)) {
      if (ids.has(slotId)) state.slots[slotId] = photo;
      else dropped++;
    }
  } else {
    const photos = Object.entries(prev.slots)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, photo]) => photo);
    next.photoSlots.forEach((slot, i) => {
      const photo = photos[i];
      if (photo) state.slots[slot.id] = { ...photo, transform: IDENTITY, rotation: 0, confirmedLowDpi: false };
    });
    dropped = Math.max(0, photos.length - next.photoSlots.length);
  }

  const textIds = new Set(next.textSlots.map((s) => s.id));
  for (const [id, text] of Object.entries(prev.texts)) {
    if (textIds.has(id)) state.texts[id] = text;
  }
  return { state, dropped };
}

/** Which slots a batch of new photos goes into: the chosen slot first, then the empty ones in order. */
export function planPhotoTargets(
  template: Pick<PersonalizationTemplate, 'photoSlots'>,
  state: Pick<PersonalizationState, 'slots'>,
  count: number,
  preferredSlotId?: string | null
): { targets: string[]; overflow: number } {
  const targets: string[] = [];
  if (preferredSlotId && template.photoSlots.some((s) => s.id === preferredSlotId)) targets.push(preferredSlotId);
  for (const slot of template.photoSlots) {
    if (targets.length >= count) break;
    if (!state.slots[slot.id] && !targets.includes(slot.id)) targets.push(slot.id);
  }
  return { targets: targets.slice(0, count), overflow: Math.max(0, count - targets.length) };
}
