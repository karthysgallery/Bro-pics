import { createEmptyState, type PersonalizationState, type PersonalizationTemplate } from '@bro-pics/shared';

const IDENTITY = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * Moves a customer's work onto another template: a newer version of the same
 * design, or a different layout chosen for another frame size. Nothing they
 * did is silently lost when it still fits:
 *  - same design: photos and text stay on the slots with the same ids, framing kept;
 *  - other design: photos fill the new slots in order (framing reset, since the
 *    slot shapes differ), and text and calendar dates move to fields with the same id.
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
  const calendarIds = new Set((next.calendarSlots ?? []).map((s) => s.id));
  const dates = Object.entries(prev.dates ?? {}).filter(([id]) => calendarIds.has(id));
  if (dates.length > 0) state.dates = Object.fromEntries(dates);
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

/**
 * Fills the empty photo spaces by repeating the customer's photos (a mosaic
 * with more spaces than photos). Each space gets the least-used photo that is
 * not already in a neighbouring space, so the same picture never sits side by
 * side or forms a stripe. Cut-out spaces are neither a source nor a target: a
 * cut-out belongs only where the design asked for one. Photos still uploading
 * are not repeated.
 */
export function repeatPhotosIntoEmpty(
  template: Pick<PersonalizationTemplate, 'photoSlots'>,
  state: PersonalizationState
): { state: PersonalizationState; filled: number } {
  const regular = template.photoSlots.filter((s) => !s.removeBackground);
  const seen = new Set<string>();
  const sources = regular
    .map((s) => state.slots[s.id])
    .filter((p): p is NonNullable<typeof p> => p !== undefined && !p.assetId.startsWith('local:'))
    .filter((p) => (seen.has(p.assetId) ? false : (seen.add(p.assetId), true)));
  if (sources.length === 0) return { state, filled: 0 };

  const slots = { ...state.slots };
  const uses = new Map(sources.map((p) => [p.assetId, 0]));
  for (const p of Object.values(slots)) if (uses.has(p.assetId)) uses.set(p.assetId, uses.get(p.assetId)! + 1);
  const centre = (s: (typeof regular)[number]) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 });
  // Neighbours: spaces whose centres are within about one and a half spaces (sides and corners).
  const near = (a: (typeof regular)[number], b: (typeof regular)[number]) => {
    const ca = centre(a);
    const cb = centre(b);
    return Math.abs(ca.x - cb.x) < 1.6 * Math.max(a.width, b.width) && Math.abs(ca.y - cb.y) < 1.6 * Math.max(a.height, b.height);
  };
  let filled = 0;
  for (const slot of regular) {
    if (slots[slot.id]) continue;
    const blocked = new Set(regular.filter((o) => o !== slot && slots[o.id] && near(slot, o)).map((o) => slots[o.id]!.assetId));
    const pool = sources.filter((p) => !blocked.has(p.assetId));
    const pick = (pool.length > 0 ? pool : sources).reduce((best, p) => (uses.get(p.assetId)! < uses.get(best.assetId)! ? p : best));
    slots[slot.id] = { ...pick, transform: { scale: 1, offsetX: 0, offsetY: 0 }, confirmedLowDpi: false };
    uses.set(pick.assetId, uses.get(pick.assetId)! + 1);
    filled++;
  }
  return filled === 0 ? { state, filled } : { state: { ...state, slots }, filled };
}
