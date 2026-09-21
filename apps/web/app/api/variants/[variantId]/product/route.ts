import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { findVariantById } from '../../../../../lib/variant-lookup';
import { checkRateLimit } from '../../../../../lib/rate-limit';

interface RouteParams {
  params: Promise<{ variantId: string }>;
}

// variants are a subcollection of products, so there's no way to resolve
// "which product does this bare variantId belong to" from the client SDK
// without a collectionGroup query — and this app already has exactly that
// index (registered for findVariantById's checkout-side use) via
// firebase-admin. No auth is required: a variant's productId/stock status
// isn't sensitive, it's the same data the storefront already shows
// publicly. Used by "move to wishlist" cart actions (which only have a
// variantId to work from — CartItem carries no productId) and by the cart
// drawer's live stock-status badges (a cart line's own stockStatus can go
// stale between add-to-cart and checkout).
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { variantId } = await params;
  const db = getFirestore(getAdminApp());
  const variant = await findVariantById(db, variantId);
  if (!variant) {
    return NextResponse.json({ error: `Unknown variantId: ${variantId}` }, { status: 404 });
  }

  return NextResponse.json(
    { productId: variant.productId, stockStatus: variant.stockStatus, isActive: variant.isActive },
    { status: 200 }
  );
}
