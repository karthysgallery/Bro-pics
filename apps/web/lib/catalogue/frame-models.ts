import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { DEFAULT_FRAMING_COST_RATES, FrameModelSchema, FramingCostRatesSchema, publicFrameModel, type FrameModel, type FramingCostRates, type PublicFrameModel } from '@bro-pics/shared';

/** frameModels/{id} (server-only: holds cost) and adminSettings/framingCosts. */
export const FRAME_MODELS = 'frameModels';

export async function listFrameModels(db: Firestore, options: { includeInactive?: boolean } = {}): Promise<FrameModel[]> {
  const snap = await db.collection(FRAME_MODELS).get();
  return snap.docs
    .map((d) => FrameModelSchema.safeParse(d.data()))
    .filter((r): r is { success: true; data: FrameModel } => r.success)
    .map((r) => r.data)
    .filter((m) => options.includeInactive || m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The frame models a product offers, in the product's order (default first), as customers may see them. */
export async function publicFrameModelsFor(db: Firestore, ids: readonly string[] | undefined): Promise<PublicFrameModel[]> {
  if (!ids?.length) return [];
  const snaps = await db.getAll(...ids.map((id) => db.collection(FRAME_MODELS).doc(id)));
  return snaps
    .map((s) => (s.exists ? FrameModelSchema.safeParse(s.data()) : null))
    .filter((r): r is { success: true; data: FrameModel } => Boolean(r?.success))
    .map((r) => publicFrameModel(r.data));
}

export async function readFramingCostRates(db: Firestore): Promise<FramingCostRates> {
  const snap = await db.collection('adminSettings').doc('framingCosts').get();
  const parsed = FramingCostRatesSchema.safeParse(snap.data());
  return parsed.success ? parsed.data : DEFAULT_FRAMING_COST_RATES;
}

/** "Teak Classic 1in" → "teak-classic-1in", unique among existing ids. */
export function frameModelIdFrom(name: string, taken: ReadonlySet<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'frame';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * For the product page: the frame models a product offers (no cost), and its sizes ordered so the default
 * model comes first — the page opens on the default frame, and the frame choices list in the owner's order.
 */
export async function frameModelsForProductPage<V extends { frameModelId?: string; widthIn: number; heightIn: number; stockStatus: string }>(
  db: Firestore,
  product: { frameModelIds?: string[] },
  variants: V[]
): Promise<{ frameModels: PublicFrameModel[]; variants: V[] }> {
  const ids = product.frameModelIds ?? [];
  if (!ids.length) return { frameModels: [], variants };
  const frameModels = await publicFrameModelsFor(db, ids);
  const rank = (v: V) => {
    const i = v.frameModelId ? ids.indexOf(v.frameModelId) : -1;
    return i === -1 ? ids.length : i;
  };
  const ordered = [...variants].sort((a, b) => rank(a) - rank(b) || a.widthIn * a.heightIn - b.widthIn * b.heightIn);
  return { frameModels, variants: ordered };
}
