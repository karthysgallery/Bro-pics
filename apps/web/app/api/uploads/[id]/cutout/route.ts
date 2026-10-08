import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { logger, type Upload } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// A cold start loads the model (~20 s) before the ~10 s cut-out itself.
const CUTOUT_TIMEOUT_MS = 120_000;

/** The private service that runs background removal (the print renderer). */
function cutoutServiceUrl(): string | null {
  const url = (process.env.CUTOUT_SERVICE_URL || process.env.PRINT_RENDER_URL || '').trim();
  return url ? url.replace(/\/$/, '') : null;
}

const isLocal = (url: string) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(url);

/** Identity token for the service's URL, from the Cloud Run metadata server (none for a local service). */
async function idToken(audience: string): Promise<string | null> {
  if (isLocal(audience)) return null;
  const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!res.ok) throw new Error(`No identity token for the cut-out service (${res.status})`);
  return res.text();
}

/**
 * Removes the background from one of the customer's own photos (for a photo
 * space the design marks "cut out"). The result is a new upload — a
 * transparent PNG owned by the same customer — that the editor then uses in
 * place of the original. Same ownership rule as the upload's other routes.
 */
export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly', code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid upload id', code: 'invalid' }, { status: 400 });

  const snap = await getFirestore(getAdminApp()).collection('uploads').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'Upload not found', code: 'not_found' }, { status: 404 });
  const upload = snap.data() as Upload;
  const sessionId = request.headers.get('X-Session-Id');
  const userId = await getUserIdFromAuthHeader(request);
  const authorized = (sessionId !== null && sessionId === upload.sessionId) || (userId !== null && userId === upload.userId);
  if (!authorized) return NextResponse.json({ error: 'Not authorized to access this upload', code: 'forbidden' }, { status: 403 });
  if (upload.status !== 'ready') return NextResponse.json({ error: 'Upload is not ready', code: 'not_ready' }, { status: 409 });

  const service = cutoutServiceUrl();
  if (!service) {
    return NextResponse.json({ error: 'Background removal is not available right now.', code: 'unavailable' }, { status: 503 });
  }
  try {
    const token = await idToken(service);
    const res = await fetch(`${service}/cutout/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: '{}',
      signal: AbortSignal.timeout(CUTOUT_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { uploadId?: string; widthPx?: number; heightPx?: number; error?: string; code?: string };
    if (res.ok && body.uploadId) {
      return NextResponse.json({ uploadId: body.uploadId, widthPx: body.widthPx, heightPx: body.heightPx }, { status: 200 });
    }
    if (res.status === 422) return NextResponse.json({ error: body.error ?? 'No people were found in this photo.', code: 'no_subject' }, { status: 422 });
    logger.warn('Cut-out service refused', { uploadId: id, status: res.status, error: body.error });
    return NextResponse.json({ error: 'The background could not be removed right now.', code: 'failed' }, { status: 502 });
  } catch (err) {
    logger.error('Cut-out service unreachable', { uploadId: id, error: String(err) });
    return NextResponse.json({ error: 'The background could not be removed right now.', code: 'failed' }, { status: 502 });
  }
}
