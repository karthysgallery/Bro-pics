import type { Combo, ComboItem } from '@bro-pics/shared';

/** "1,299.50" → 129950 paise; null when it isn't a positive amount. */
export function rupeesToPaise(text: string): number | null {
  const value = Number.parseFloat(text.replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function paiseToRupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/**
 * A readable, stable id for an included item ("a4", "6x8_in"): it becomes part of the frame's web
 * address, so it is derived from the size once and then never changes when the item is edited.
 */
export function newItemId(hint: string, taken: readonly string[]): string {
  const base = hint.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 18) || 'frame';
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}_${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface ComboFormState {
  name: string;
  slug: string;
  slugEdited: boolean;
  description: string;
  coverImageUrl: string;
  coverImageAlt: string;
  price: string;
  mrp: string;
  badge: string;
  sortOrder: string;
  couponsAllowed: boolean;
  status: Combo['status'];
  items: ComboItem[];
}

export const BLANK_COMBO: ComboFormState = {
  name: '', slug: '', slugEdited: false, description: '', coverImageUrl: '', coverImageAlt: '', price: '', mrp: '',
  badge: '', sortOrder: '0', couponsAllowed: false, status: 'draft', items: [],
};

export function formFromCombo(combo: Combo): ComboFormState {
  return {
    name: combo.name, slug: combo.slug, slugEdited: true, description: combo.description, coverImageUrl: combo.coverImageUrl,
    coverImageAlt: combo.coverImageAlt ?? '', price: paiseToRupees(combo.price), mrp: paiseToRupees(combo.mrp), badge: combo.badge ?? '',
    sortOrder: String(combo.sortOrder), couponsAllowed: combo.couponsAllowed, status: combo.status, items: combo.items,
  };
}

/** The request body for the admin API, or the first thing wrong with the form, in the owner's words. */
export function bodyFromForm(form: ComboFormState): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  if (!form.name.trim()) return { ok: false, error: 'Give the combo a name.' };
  if (!form.slug.trim()) return { ok: false, error: 'The web address is empty.' };
  const price = rupeesToPaise(form.price);
  if (price === null) return { ok: false, error: 'Enter the combo price in rupees.' };
  const mrp = rupeesToPaise(form.mrp);
  if (mrp === null) return { ok: false, error: 'Enter the MRP in rupees (or use the total worth button).' };
  if (mrp < price) return { ok: false, error: 'The MRP cannot be lower than the combo price.' };
  if (form.items.length === 0) return { ok: false, error: 'Add at least one frame to the combo.' };
  if (form.items.some((i) => !i.productId || !i.variantId)) return { ok: false, error: 'Choose a product and size for every included frame.' };
  const sortOrder = Number.parseInt(form.sortOrder, 10);
  return {
    ok: true,
    body: {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description,
      coverImageUrl: form.coverImageUrl,
      coverImageAlt: form.coverImageAlt,
      price,
      mrp,
      items: form.items.map((i) => ({ id: i.id, productId: i.productId, variantId: i.variantId, quantity: i.quantity, ...(i.label?.trim() && { label: i.label.trim() }) })),
      couponsAllowed: form.couponsAllowed,
      badge: form.badge.trim(),
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    },
  };
}
