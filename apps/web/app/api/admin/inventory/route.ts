import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { requirePermission } from '../../../../lib/require-permission';
import { adminApiError } from '../../../../lib/admin-api-error';
import type { Product, Variant, StockStatus } from '@bro-pics/shared';

export interface InventoryVariantItem {
  variantId: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  sku: string;
  sizeLabel: string;
  frameColour: string;
  price: number;
  stockStatus: StockStatus;
  isActive: boolean;
}

export async function GET(request: Request): Promise<NextResponse> {
  const permission = await requirePermission(request, 'catalogue:read');
  if (!permission.ok) {
    return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Catalogue read access required');
  }

  const db = getFirestore(getAdminApp());
  const productsSnap = await db.collection('products').get();

  const items: InventoryVariantItem[] = [];

  for (const productDoc of productsSnap.docs) {
    const product = productDoc.data() as Product;
    const variantsSnap = await productDoc.ref.collection('variants').get();

    variantsSnap.docs.forEach((vDoc) => {
      const v = vDoc.data() as Variant;
      items.push({
        variantId: v.id,
        productId: product.id,
        productTitle: product.title,
        productSlug: product.slug,
        sku: v.sku,
        sizeLabel: v.sizeLabel,
        frameColour: v.frameColour,
        price: v.price,
        stockStatus: v.stockStatus,
        isActive: v.isActive,
      });
    });
  }

  return NextResponse.json({ items });
}
