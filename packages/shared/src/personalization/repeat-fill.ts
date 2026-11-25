import type { PersonalizationState } from './state';
import type { PersonalizationTemplate } from './template-schema';

/**
 * Fills the empty photo spaces by repeating the customer's photos (a mosaic
 * with more spaces than photos). Each space gets the least-used photo that is
 * not already in a neighbouring space, so the same picture never sits side by
 * side (and, when there are enough photos, not within two spaces), with ties broken by a fixed per-space shuffle so
 * a few photos over many spaces do not form a pattern. Cut-out spaces are neither a source nor a target: a
 * cut-out belongs only where the design asked for one. Photos still uploading
 * are not repeated.
 *
 * Pure and deterministic: the shop preview and the print renderer both call it on a design that fills by repeating
 * (template.repeatToFill), so the same state always gives the same mosaic. Change it only with that in mind: an
 * order placed earlier is printed with whatever this function does at print time.
 */
export function repeatPhotosIntoEmpty(
  template: Pick<PersonalizationTemplate, 'photoSlots'> & Partial<Pick<PersonalizationTemplate, 'minPhotos'>>,
  state: PersonalizationState
): { state: PersonalizationState; filled: number } {
  // On an "at least N photos" collage the required spaces are main photos (a cut-out, a photo in a heart): only the
  // collage cells take part.
  const regular = template.photoSlots.filter((s) => !s.removeBackground && !(template.minPhotos !== undefined && s.required));
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
  // Neighbours within `reach` spaces (sides and corners at 1.6; two spaces away at 2.6).
  const near = (a: (typeof regular)[number], b: (typeof regular)[number], reach: number) => {
    const ca = centre(a);
    const cb = centre(b);
    return Math.abs(ca.x - cb.x) < reach * Math.max(a.width, b.width) && Math.abs(ca.y - cb.y) < reach * Math.max(a.height, b.height);
  };
  // A fixed per-space shuffle for ties, so a few photos over many spaces do not form a repeating pattern.
  const hash = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  let filled = 0;
  for (const slot of regular) {
    if (slots[slot.id]) continue;
    // Prefer a photo not used within two spaces; failing that, not side by side; failing that, any.
    let pool = sources;
    for (const reach of [2.6, 1.6]) {
      const blocked = new Set(regular.filter((o) => o !== slot && slots[o.id] && near(slot, o, reach)).map((o) => slots[o.id]!.assetId));
      const free = sources.filter((p) => !blocked.has(p.assetId));
      if (free.length > 0) {
        pool = free;
        break;
      }
    }
    const pick = pool.reduce((best, p) => {
      const d = uses.get(p.assetId)! - uses.get(best.assetId)!;
      return d < 0 || (d === 0 && hash(slot.id + p.assetId) < hash(slot.id + best.assetId)) ? p : best;
    });
    slots[slot.id] = { ...pick, transform: { scale: 1, offsetX: 0, offsetY: 0 }, confirmedLowDpi: false };
    uses.set(pick.assetId, uses.get(pick.assetId)! + 1);
    filled++;
  }
  return filled === 0 ? { state, filled } : { state: { ...state, slots }, filled };
}
