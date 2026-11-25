import type { PersonalizationState } from './state';
import type { PersonalizationTemplate } from './template-schema';

/**
 * Fills the empty photo spaces by repeating the customer's photos (a mosaic
 * with more spaces than photos). Each space gets the least-used photo that is
 * not already in a neighbouring space, so the same picture never sits side by
 * side or forms a stripe. Cut-out spaces are neither a source nor a target: a
 * cut-out belongs only where the design asked for one. Photos still uploading
 * are not repeated.
 *
 * Pure and deterministic: the shop preview and the print renderer both call it on a design that fills by repeating
 * (template.repeatToFill), so the same state always gives the same mosaic. Change it only with that in mind: an
 * order placed earlier is printed with whatever this function does at print time.
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
