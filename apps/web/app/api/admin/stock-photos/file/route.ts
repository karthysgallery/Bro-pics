import { NextResponse } from 'next/server';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { isStockPhotoUrl } from '../../../../../lib/catalogue/stock-photos';
import { adminApiError } from '../../../../../lib/admin-api-error';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Hands a chosen stock picture to the admin's browser from this site, so it can be saved to the media library
 * like an uploaded photo (a picture from another site could not be drawn on a canvas). Stock photo addresses only.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const target = new URL(request.url).searchParams.get('u') ?? '';
  if (!isStockPhotoUrl(target)) return adminApiError(400, 'invalid_request', 'Only pictures from the free photo service can be used here.');
  const res = await fetch(target, { signal: AbortSignal.timeout(15_000), redirect: 'error' }).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.startsWith('image/')) return adminApiError(502, 'internal', 'That picture could not be fetched. Choose another.');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return adminApiError(413, 'invalid_request', 'That picture is too large. Choose another.');
  return new NextResponse(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' } });
}
