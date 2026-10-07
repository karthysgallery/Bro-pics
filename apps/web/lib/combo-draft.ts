import { comboProgress, comboVariantId, expandComboFrames, type CartLine, type Combo } from '@bro-pics/shared';

/**
 * A customer's work-in-progress combo, kept on their device until they add the whole combo to the cart.
 * Each frame stores only what the cart line needs (ids, the template claim, a preview path); the
 * photos themselves are already uploaded and referenced by the frame's personalizationId.
 */
export interface SavedFrame {
  personalizationId: string;
  title: string;
  productSlug?: string;
  previewPath?: string;
  personalization?: { templateId: string; templateVersion: number; state: unknown };
}

export interface ComboDraft {
  comboId: string;
  /** The combo version the frames were made for; a changed combo starts a fresh draft. */
  version: number;
  /** Becomes the cart line's personalizationId, so the same combo can be in the cart twice. */
  instanceId: string;
  frames: Record<string, SavedFrame>;
  savedAt: string;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const key = (comboId: string) => `bropics_combo_draft:${comboId}`;

export function newComboDraft(combo: Pick<Combo, 'id' | 'version'>): ComboDraft {
  return { comboId: combo.id, version: combo.version, instanceId: crypto.randomUUID(), frames: {}, savedAt: new Date().toISOString() };
}

/** The saved draft for this combo, or null if there is none, it is stale, or it was made for another version. */
export function loadComboDraft(combo: Pick<Combo, 'id' | 'version' | 'items'>): ComboDraft | null {
  try {
    const raw = window.localStorage.getItem(key(combo.id));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ComboDraft;
    if (draft.comboId !== combo.id || draft.version !== combo.version || typeof draft.instanceId !== 'string') return null;
    if (Date.now() - new Date(draft.savedAt).getTime() > MAX_AGE_MS) return null;
    // Keep only frames the combo still has.
    const keys = new Set(expandComboFrames(combo).map((f) => f.key));
    const frames = Object.fromEntries(Object.entries(draft.frames ?? {}).filter(([k, f]) => keys.has(k) && typeof f?.personalizationId === 'string'));
    return { ...draft, frames };
  } catch {
    return null;
  }
}

export function saveComboDraft(draft: ComboDraft): void {
  try {
    window.localStorage.setItem(key(draft.comboId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {
    // Storage can be blocked (private browsing); the draft is a convenience, never a blocker.
  }
}

export function clearComboDraft(comboId: string): void {
  try {
    window.localStorage.removeItem(key(comboId));
  } catch {
    // ignore
  }
}

/** Records one frame's finished personalization. Pure: returns the new draft. */
export function withSavedFrame(draft: ComboDraft, frameKey: string, frame: SavedFrame): ComboDraft {
  return { ...draft, frames: { ...draft.frames, [frameKey]: frame } };
}

export function completedFrameKeys(draft: ComboDraft | null): Set<string> {
  return new Set(draft ? Object.keys(draft.frames) : []);
}

/** Frame-by-frame progress, ready to render ("Frame 1 completed", "Frame 2 add photos"). */
export function draftProgress(combo: Pick<Combo, 'items'>, draft: ComboDraft | null) {
  return comboProgress(combo, completedFrameKeys(draft));
}

/**
 * The single parent cart line for a finished combo: every frame's own product, variant,
 * personalization and uploads travel inside it. Returns null until every frame is done.
 */
export function buildComboCartLine(combo: Pick<Combo, 'id' | 'slug' | 'name' | 'version' | 'price' | 'items'>, draft: ComboDraft): CartLine | null {
  const frames = expandComboFrames(combo);
  const saved = frames.map((frame) => ({ frame, saved: draft.frames[frame.key] }));
  if (saved.some((s) => !s.saved)) return null;
  const cartFrames = saved.map(({ frame, saved: s }) => ({
    key: frame.key,
    productId: frame.productId,
    variantId: frame.variantId,
    personalizationId: s!.personalizationId,
    title: s!.title,
    ...(s!.productSlug && { productSlug: s!.productSlug }),
    ...(s!.previewPath && { previewPath: s!.previewPath }),
    ...(s!.personalization && { personalization: s!.personalization }),
  }));
  const thumbnail = cartFrames.find((f) => f.previewPath)?.previewPath;
  return {
    variantId: comboVariantId(combo.id),
    personalizationId: draft.instanceId,
    title: combo.name,
    unitPriceSnapshot: combo.price,
    qty: 1,
    ...(thumbnail && { previewPath: thumbnail }),
    combo: { comboId: combo.id, version: combo.version, name: combo.name, slug: combo.slug, frames: cartFrames },
  };
}
