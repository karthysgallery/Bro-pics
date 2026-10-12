import { NextResponse } from 'next/server';
import { catalogueGuard } from '../../../../lib/catalogue/guard';
import { searchStockPhotos, StockPhotosError } from '../../../../lib/catalogue/stock-photos';
import { adminApiError } from '../../../../lib/admin-api-error';

/** Admin → product photos: search free stock pictures (Pixabay or Pexels) to use as sample photos. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const orientation = url.searchParams.get('orientation');
  try {
    const photos = await searchStockPhotos(url.searchParams.get('q') ?? '', {
      orientation: orientation === 'portrait' || orientation === 'landscape' || orientation === 'square' ? orientation : undefined,
      page: Math.max(1, Number(url.searchParams.get('page')) || 1),
    });
    return NextResponse.json({ photos });
  } catch (e) {
    if (e instanceof StockPhotosError) return adminApiError(e.status, e.status === 400 ? 'invalid_request' : e.status === 429 ? 'rate_limited' : 'internal', e.message);
    return adminApiError(502, 'internal', 'The free photo service could not be reached. Try again in a moment.');
  }
}
