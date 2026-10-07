import type { Combo, Variant } from '@bro-pics/shared';

export interface ComboProblem {
  /** The included item the problem is about; absent for a problem with the combo as a whole. */
  itemId?: string;
  message: string;
}

export interface ComboPublishDeps {
  loadProduct(productId: string): Promise<{ title: string; isActive?: boolean; status?: string; personalizationTemplateId?: string | null } | null>;
  loadVariant(variantId: string): Promise<Variant | null>;
  /** The variant has a current frame template (the standard editor can open for it). */
  hasFrameTemplate(variantId: string): Promise<boolean>;
  /** The collage-engine template exists and has a published version. */
  hasPublishedTemplate(templateId: string): Promise<boolean>;
}

/**
 * Everything that must be true before customers can see and buy a combo. A combo that
 * can't be completed (a frame with no editor, an item that is out of stock or switched
 * off) would only fail at the last step, so it is stopped here instead of being published.
 */
export async function checkComboPublishable(combo: Pick<Combo, 'items' | 'price' | 'mrp' | 'name' | 'coverImageUrl'>, deps: ComboPublishDeps): Promise<ComboProblem[]> {
  const problems: ComboProblem[] = [];
  if (!combo.name.trim()) problems.push({ message: 'Give the combo a name.' });
  if (!combo.coverImageUrl.trim()) problems.push({ message: 'Add a cover image.' });
  if (combo.price <= 0) problems.push({ message: 'The combo price must be more than zero.' });
  if (combo.price > combo.mrp) problems.push({ message: 'The combo price cannot be higher than the MRP.' });

  for (const item of combo.items) {
    const product = await deps.loadProduct(item.productId);
    if (!product) {
      problems.push({ itemId: item.id, message: 'This product no longer exists.' });
      continue;
    }
    const name = item.label || product.title;
    if (product.isActive === false || product.status === 'draft' || product.status === 'archived') {
      problems.push({ itemId: item.id, message: `${name} is not on sale.` });
    }
    const variant = await deps.loadVariant(item.variantId);
    if (!variant || variant.productId !== item.productId) {
      problems.push({ itemId: item.id, message: `${name}: the chosen size no longer exists.` });
      continue;
    }
    if (!variant.isActive) problems.push({ itemId: item.id, message: `${name} (${variant.sizeLabel}) is switched off.` });
    else if (variant.stockStatus !== 'in_stock') problems.push({ itemId: item.id, message: `${name} (${variant.sizeLabel}) is out of stock.` });

    const templateId = (variant as Variant & { personalizationTemplateId?: string | null }).personalizationTemplateId ?? product.personalizationTemplateId ?? null;
    const hasEditor = templateId ? await deps.hasPublishedTemplate(templateId) : await deps.hasFrameTemplate(item.variantId);
    if (!hasEditor) {
      problems.push({ itemId: item.id, message: `${name} (${variant.sizeLabel}) has no photo template yet, so customers couldn't personalize it.` });
    }
  }
  return problems;
}
