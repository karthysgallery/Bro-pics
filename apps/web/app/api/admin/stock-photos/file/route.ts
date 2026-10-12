import { NextResponse } from 'next/server';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { fetchStockPhoto, StockPhotosError } from '../../../../../lib/catalogue/stock-photos';
import { adminApiError } from '../../../../../lib/admin-api-error';

/**
 * Hands a chosen stock picture to the admin's browser from this site, so it can be saved to the media library
 * like an uploaded photo (a picture from another site could not be drawn on a canvas). Stock photo addresses only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const target = new URL(request.url).searchParams.get('u') ?? '';
  try {
    const { bytes, type } = await fetchStockPhoto(target);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
  } catch (e) {
    if (e instanceof StockPhotosError) return adminApiError(e.status === 413 ? 400 : e.status, e.status === 400 || e.status === 413 ? 'invalid_request' : 'internal', e.message);
    return adminApiError(502, 'internal', 'That picture could not be fetched. Choose another.');
  }
}
