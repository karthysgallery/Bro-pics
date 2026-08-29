import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface VariantForDenormalization {
  price: number;
  sizeLabel: string;
  frameColour: string;
  material: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'backorder';
  isActive: boolean;
}

export interface ProductDenormalizedFields {
  availableSizes: string[];
  availableColours: string[];
  availableMaterials: string[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
}

export function calculateDenormalizedFields(
  variants: VariantForDenormalization[]
): ProductDenormalizedFields {
  const active = variants.filter((v) => v.isActive);

  if (active.length === 0) {
    return {
      availableSizes: [],
      availableColours: [],
      availableMaterials: [],
      minPrice: 0,
      maxPrice: 0,
      inStock: false,
    };
  }

  const prices = active.map((v) => v.price);
  return {
    availableSizes: [...new Set(active.map((v) => v.sizeLabel))],
    availableColours: [...new Set(active.map((v) => v.frameColour))],
    availableMaterials: [...new Set(active.map((v) => v.material))],
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    inStock: active.some((v) => v.stockStatus === 'in_stock'),
  };
}

/**
 * Thin Cloud Function glue: on any write to a product's variants
 * subcollection, re-reads all sibling variants and writes the
 * recalculated denormalized fields onto the parent product doc. Not
 * unit-tested directly (it's a few lines of Admin SDK read/write around
 * the pure, fully-tested calculateDenormalizedFields above); exercised
 * live via the Firestore emulator when this trigger fires during manual
 * verification of the category listing page in Task 9.
 */
export const onVariantWritten = onDocumentWritten(
  'products/{productId}/variants/{variantId}',
  async (event) => {
    const { productId } = event.params;
    const db = getFirestore();

    const variantsSnapshot = await db.collection('products').doc(productId).collection('variants').get();
    const variants = variantsSnapshot.docs.map((doc) => doc.data() as VariantForDenormalization);

    const denormalized = calculateDenormalizedFields(variants);
    await db.collection('products').doc(productId).update(denormalized as Record<string, any>);
  }
);
