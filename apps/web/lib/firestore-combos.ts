import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { ComboSchema, type Combo, type Variant } from '@bro-pics/shared';
import { getAdminApp } from './firebase-admin';
import { findVariantById } from './variant-lookup';
import type { ComboPricingDeps } from './combo-pricing';
import type { ComboPublishDeps } from './combo-publish-check';
import { getLatestPublished } from './personalization-templates';

export const COMBOS_COLLECTION = 'combos';

/** A combo document as the app uses it, or null if it is missing or malformed (a broken doc must never reach the shop). */
export function parseCombo(id: string, raw: unknown): Combo | null {
  const parsed = ComboSchema.safeParse({ ...(raw as object), id });
  return parsed.success ? parsed.data : null;
}

export async function getComboById(db: Firestore, id: string): Promise<Combo | null> {
  const snap = await db.collection(COMBOS_COLLECTION).doc(id).get();
  return snap.exists ? parseCombo(snap.id, snap.data()) : null;
}

/** Published combos for the storefront, in the owner's chosen order. */
export async function getPublishedCombos(): Promise<Combo[]> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection(COMBOS_COLLECTION).where('status', '==', 'published').get();
  return snap.docs
    .map((d) => parseCombo(d.id, d.data()))
    .filter((c): c is Combo => c !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getPublishedComboBySlug(slug: string): Promise<Combo | null> {
  const db = getFirestore(getAdminApp());
  const snap = await db.collection(COMBOS_COLLECTION).where('slug', '==', slug).limit(5).get();
  const combos = snap.docs.map((d) => parseCombo(d.id, d.data())).filter((c): c is Combo => c !== null);
  return combos.find((c) => c.status === 'published') ?? null;
}

export async function getAllCombos(db: Firestore): Promise<Combo[]> {
  const snap = await db.collection(COMBOS_COLLECTION).get();
  return snap.docs
    .map((d) => parseCombo(d.id, d.data()))
    .filter((c): c is Combo => c !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** The real lookups behind checkComboPublishable. */
export function firestorePublishDeps(db: Firestore): ComboPublishDeps {
  return {
    async loadProduct(productId) {
      const snap = await db.collection('products').doc(productId).get();
      if (!snap.exists) return null;
      const d = snap.data() as { title?: string; isActive?: boolean; status?: string; personalizationTemplateId?: string | null };
      return { title: d.title ?? productId, isActive: d.isActive, status: d.status, personalizationTemplateId: d.personalizationTemplateId ?? null };
    },
    loadVariant: (variantId) => findVariantById(db, variantId),
    async hasFrameTemplate(variantId) {
      const snap = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
      return snap.docs.some((d) => (d.data() as { isCurrent?: boolean }).isCurrent === true);
    },
    async hasPublishedTemplate(templateId) {
      return (await getLatestPublished(db, templateId)) !== null;
    },
  };
}

/** The real lookups behind priceComboLines. */
export function firestoreComboDeps(db: Firestore): ComboPricingDeps {
  const products = new Map<string, boolean>();
  return {
    loadCombo: (id) => getComboById(db, id),
    loadVariant: (id): Promise<Variant | null> => findVariantById(db, id),
    async isProductAvailable(productId) {
      if (!products.has(productId)) {
        const snap = await db.collection('products').doc(productId).get();
        const data = snap.exists ? (snap.data() as { isActive?: boolean; status?: string }) : null;
        products.set(productId, Boolean(data) && data!.isActive !== false && data!.status !== 'draft' && data!.status !== 'archived');
      }
      return products.get(productId)!;
    },
  };
}
