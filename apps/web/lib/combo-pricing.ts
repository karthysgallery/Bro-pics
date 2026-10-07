import type { Variant, Combo, OrderItemCombo } from '@bro-pics/shared';
import { COMBO_VARIANT_PREFIX, allocateComboPrice, expandComboFrames, validateComboCart } from '@bro-pics/shared';
import type { CartLineInput, PricedCartLine, UnavailableLine } from './checkout-calc';

export const isComboLine = (line: Pick<CartLineInput, 'variantId'>): boolean => line.variantId.startsWith(COMBO_VARIANT_PREFIX);

export interface ComboPricingDeps {
  loadCombo(comboId: string): Promise<Combo | null>;
  loadVariant(variantId: string): Promise<Variant | null>;
  /** The product exists and is on sale (not draft/archived/switched off). */
  isProductAvailable(productId: string): Promise<boolean>;
}

/** What one combo line in the cart priced to, kept on the order so admin can show the combo as a whole. */
export interface PricedCombo {
  instanceId: string;
  comboId: string;
  version: number;
  name: string;
  slug?: string;
  /** Paise charged for the whole combo (from the catalogue, never from the cart). */
  price: number;
  mrp: number;
  couponsAllowed: boolean;
  frames: Array<{ key: string; label: string; productId: string; variantId: string; allocatedPrice: number }>;
}

/**
 * Expands each Combo Offer line in the cart into one priced line per frame.
 *
 * Everything money-related comes from the catalogue: the combo's price from the combo
 * document, each frame's weight from its variant's own price, and the split is exact
 * (the frame prices add up to the combo price, to the paisa). The cart only says WHICH
 * combo and which frames; it is checked against the combo as it is now, so a combo that
 * was edited, unpublished or whose frames no longer match is refused rather than
 * charged at a stale price.
 */
export async function priceComboLines(
  lines: CartLineInput[],
  deps: ComboPricingDeps
): Promise<{ priced: PricedCartLine[]; combos: PricedCombo[]; unavailable: UnavailableLine[] }> {
  const priced: PricedCartLine[] = [];
  const combos: PricedCombo[] = [];
  const unavailable: UnavailableLine[] = [];

  for (const line of lines) {
    const fail = (reason: UnavailableLine['reason']) => unavailable.push({ variantId: line.variantId, reason });
    const cart = line.combo;
    if (!cart) {
      fail('combo_invalid');
      continue;
    }
    const combo = await deps.loadCombo(cart.comboId);
    if (!combo || combo.status !== 'published') {
      fail('combo_unavailable');
      continue;
    }
    const check = validateComboCart(combo, cart);
    if (!check.ok) {
      fail(check.issue === 'changed' ? 'combo_changed' : 'combo_invalid');
      continue;
    }

    const frames = expandComboFrames(combo);
    const variants: Variant[] = [];
    let blocked = false;
    for (const frame of frames) {
      const variant = await deps.loadVariant(frame.variantId);
      if (!variant || variant.productId !== frame.productId) {
        unavailable.push({ variantId: frame.variantId, reason: 'not_found' });
        blocked = true;
        continue;
      }
      if (!variant.isActive || !(await deps.isProductAvailable(variant.productId))) {
        unavailable.push({ variantId: frame.variantId, reason: 'inactive' });
        blocked = true;
        continue;
      }
      if (variant.stockStatus !== 'in_stock') {
        unavailable.push({ variantId: frame.variantId, reason: 'out_of_stock' });
        blocked = true;
        continue;
      }
      variants.push(variant);
    }
    if (blocked) continue;

    const shares = allocateComboPrice(combo.price, variants.map((v) => v.price));
    const instanceId = line.personalizationId;
    const byKey = new Map(cart.frames.map((f) => [f.key, f]));
    const pricedFrames: PricedCombo['frames'] = [];

    frames.forEach((frame, i) => {
      const variant = variants[i]!;
      const given = byKey.get(frame.key)!;
      const comboMeta: OrderItemCombo = { instanceId, comboId: combo.id, comboName: combo.name, frameKey: frame.key, frameLabel: frame.label };
      priced.push({
        variantId: variant.id,
        productId: variant.productId,
        personalizationId: given.personalizationId,
        title: given.title ?? combo.name,
        unitPrice: shares[i]!,
        qty: 1,
        previewPath: given.previewPath ?? null,
        sku: variant.sku,
        sizeLabel: variant.sizeLabel,
        frameColour: variant.frameColour,
        material: variant.material,
        widthIn: variant.widthIn,
        heightIn: variant.heightIn,
        combo: comboMeta,
      });
      pricedFrames.push({ key: frame.key, label: frame.label, productId: variant.productId, variantId: variant.id, allocatedPrice: shares[i]! });
    });

    combos.push({
      instanceId,
      comboId: combo.id,
      version: combo.version,
      name: combo.name,
      ...(combo.slug && { slug: combo.slug }),
      price: combo.price,
      mrp: combo.mrp,
      couponsAllowed: combo.couponsAllowed,
      frames: pricedFrames,
    });
  }

  return { priced, combos, unavailable };
}
