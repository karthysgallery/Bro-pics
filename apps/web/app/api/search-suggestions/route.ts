import { NextRequest, NextResponse } from 'next/server';
import { searchProductsPage } from '../../../lib/firestore-products';
import { checkRateLimit } from '../../../lib/rate-limit';

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  if (query.trim().length === 0) {
    return NextResponse.json({ products: [] });
  }
  const { products } = await searchProductsPage(query, {}, 1);
  return NextResponse.json({
    products: products.slice(0, 6).map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  });
}
