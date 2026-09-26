import { NextRequest, NextResponse } from 'next/server';
import { searchProductsPage, searchCategoriesPage } from '../../../lib/firestore-products';
import { getPopularSearches } from '../../../lib/firestore-settings';
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
    // [BE-23] Nothing typed yet — offer curated popular searches instead
    // of an empty box. Empty until an admin curates settings/search
    // (getPopularSearches' own doc comment).
    const popularSearches = await getPopularSearches();
    return NextResponse.json({ products: [], categories: [], popularSearches });
  }

  const [{ products }, categories] = await Promise.all([
    searchProductsPage(query, {}, 1),
    searchCategoriesPage(query),
  ]);
  return NextResponse.json({
    products: products.slice(0, 6).map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
    categories: categories.slice(0, 3).map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    popularSearches: [],
  });
}
