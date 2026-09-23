import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../../../../lib/image-probe';
import { getUserIdFromAuthHeader } from '../../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../../lib/rate-limit';
import { withTimeout, TimeoutError } from '../../../../../../lib/with-timeout';
import type { Order } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

// [BE-19] Evidence photos for a return request. Same size/format
// hardening as /api/uploads (probeAndStripImage strips EXIF and validates
// real image bytes, never trusting the client-reported MIME) — this isn't
// a customization photo headed for print, so no variant/DPI concerns
// apply, just "is this actually a decodable image, safely re-encoded."
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const DECODE_TIMEOUT_MS = 20_000;

function errorResponse(code: string, error: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return errorResponse('unauthenticated', 'Sign in required', 401);
  }

  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse('file_too_large', `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, 413);
  }

  const { orderId } = await params;
  const db = getFirestore(getAdminApp());
  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists || (orderSnap.data() as Order).userId !== userId) {
    return errorResponse('unknown_order', `Unknown orderId: ${orderId}`, 404);
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return errorResponse('missing_fields', 'Missing file', 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse('file_too_large', `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, 413);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let probed;
  try {
    probed = await withTimeout(probeAndStripImage(inputBuffer), DECODE_TIMEOUT_MS, 'Image processing took too long');
  } catch (err) {
    if (err instanceof TimeoutError) {
      return errorResponse('decode_timeout', 'Unable to process image — it took too long to decode', 408);
    }
    return errorResponse('decode_failed', 'Unable to process image — file may be corrupt or in an unsupported format', 400);
  }

  const app = getAdminApp();
  const bucket = getStorage(app).bucket();
  // .doc() with no id allocates a fresh id client-side with no network
  // call or document actually created — same "get a fresh id" idiom this
  // codebase already uses (see e.g. the staff-advance route's eventRef).
  const evidenceId = db.collection('returns').doc().id;
  const storagePath = `returns/${orderId}/${evidenceId}/evidence.jpg`;
  await bucket.file(storagePath).save(probed.strippedBuffer, { contentType: probed.mime });

  return NextResponse.json({ path: storagePath }, { status: 200 });
}
