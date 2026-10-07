import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import type { Combo, FrameTemplate, PersonalizationTemplate, Product, ProductMedia, Variant } from '@bro-pics/shared';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import { getFrameTemplatesByProductId, getPersonalizationTemplatesByVariant } from './firestore-product-detail';

/** What the combo page shows for one included product: enough for a card, nothing heavy. */
export interface ComboItemCard {
  itemId: string;
  quantity: number;
  /** The heading: the owner's label, else the product title. */
  label: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  imageUrl: string | null;
  imageAlt: string;
  variantId: string;
  variantLabel: string;
  /** What the frame costs on its own, for "worth" comparisons. */
  variantPrice: number;
  inStock: boolean;
}

async function loadItemParts(combo: Pick<Combo, 'items'>) {
  const db = getFirestore(getAdminApp());
  return Promise.all(
    combo.items.map(async (item) => {
      const [productSnap, variantSnap] = await Promise.all([
        db.collection('products').doc(item.productId).get(),
        db.collection('products').doc(item.productId).collection('variants').doc(item.variantId).get(),
      ]);
      const product = productSnap.exists ? serializeDoc({ ...(productSnap.data() as Product), id: productSnap.id }) : null;
      const variant = variantSnap.exists ? serializeDoc(variantSnap.data() as Variant) : null;
      return { item, product, variant };
    })
  );
}

export async function getComboItemCards(combo: Pick<Combo, 'items'>): Promise<ComboItemCard[]> {
  const parts = await loadItemParts(combo);
  return parts.flatMap(({ item, product, variant }) => {
    if (!product || !variant) return [];
    return [
      {
        itemId: item.id,
        quantity: item.quantity,
        label: item.label || product.title,
        productId: product.id,
        productTitle: product.title,
        productSlug: product.slug,
        imageUrl: product.primaryImageUrl || null,
        imageAlt: product.seo?.imageAlt || product.title,
        variantId: variant.id,
        variantLabel: `${variant.sizeLabel} · ${variant.frameColour}`,
        variantPrice: variant.price,
        inStock: variant.isActive !== false && variant.stockStatus === 'in_stock',
      },
    ];
  });
}

/** Everything the product's own editor needs to personalize one frame of a combo. */
export interface ComboFrameData {
  product: Product;
  /** Only the size this combo includes, so the editor offers no other. */
  variants: Variant[];
  media: ProductMedia[];
  templatesByVariant: Record<string, FrameTemplate>;
  personalizationTemplatesByVariant: Record<string, PersonalizationTemplate>;
}

export async function getComboFrameData(combo: Pick<Combo, 'items'>, itemId: string): Promise<ComboFrameData | null> {
  const item = combo.items.find((i) => i.id === itemId);
  if (!item) return null;
  const db = getFirestore(getAdminApp());
  const [parts] = await loadItemParts({ items: [item] });
  if (!parts?.product || !parts.variant) return null;
  const product = parts.product;
  const variants = [parts.variant];
  const [mediaSnap, templatesByVariant, personalizationTemplatesByVariant] = await Promise.all([
    db.collection('products').doc(product.id).collection('media').orderBy('sortOrder', 'asc').get(),
    getFrameTemplatesByProductId(product.id),
    getPersonalizationTemplatesByVariant(product, variants),
  ]);
  return {
    product,
    variants,
    media: mediaSnap.docs.map((d) => serializeDoc(d.data() as ProductMedia)),
    templatesByVariant,
    personalizationTemplatesByVariant,
  };
}
