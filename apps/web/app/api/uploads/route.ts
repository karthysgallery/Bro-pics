import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../lib/image-probe';
import { findVariantById } from '../../../lib/variant-lookup';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { checkRateLimit } from '../../../lib/rate-limit';
import { withTimeout, TimeoutError } from '../../../lib/with-timeout';
import { UploadSchema, type Upload } from '@bro-pics/shared';

// A 4K photo (largest realistic phone/DSLR output before intentional
// abuse) is well under 30 MB even uncompressed-ish; 40 MB gives real
// headroom while still bounding memory (the whole file gets buffered —
// Buffer.from(await file.arrayBuffer()) below — before decode even starts).
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const DECODE_TIMEOUT_MS = 20_000;

function errorResponse(code: string, error: string, status: number): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  // Content-Length is client-reported and not itself trustworthy for
  // anything security-critical, but rejecting an obviously-oversized
  // request on this header alone — before Next.js buffers the whole body
  // into memory to parse formData() — is a cheap, real DoS mitigation. The
  // actual Blob.size check below (after parsing) is the one that matters
  // for correctness; this is purely an early-exit optimization.
  const contentLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse('file_too_large', `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, 413);
  }

  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return errorResponse('missing_session_id', 'Missing X-Session-Id header', 400);
  }
  const userId = await getUserIdFromAuthHeader(request);

  const formData = await request.formData();
  const file = formData.get('file');
  const variantIdRaw = formData.get('variantId');
  if (!(file instanceof Blob) || typeof variantIdRaw !== 'string') {
    return errorResponse('missing_fields', 'Missing file or variantId', 400);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse('file_too_large', `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`, 413);
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  // The variant must still exist (an unknown variantId is a real client
  // error), but its minUploadPx is no longer used to hard-reject the
  // upload here — a low-resolution photo is still accepted and stored;
  // the editor's own DPI-tier badge (computed from the ACTUAL crop, not
  // just the raw upload) is what tells the customer whether it'll print
  // sharp, with a per-slot "use anyway" override at /api/customizations.
  // Rejecting outright here blocked photos that would have cropped fine.
  const variant = await findVariantById(db, variantIdRaw);
  if (!variant) {
    return errorResponse('unknown_variant', `Unknown variantId: ${variantIdRaw}`, 400);
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let probed;
  try {
    probed = await withTimeout(probeAndStripImage(inputBuffer), DECODE_TIMEOUT_MS, 'Image processing took too long');
  } catch (err) {
    if (err instanceof TimeoutError) {
      return errorResponse('decode_timeout', 'Unable to process image — it took too long to decode', 408);
    }
    return errorResponse(
      'decode_failed',
      'Unable to process image — file may be corrupt or in an unsupported format',
      400
    );
  }

  const uploadRef = db.collection('uploads').doc();
  const uploadId = uploadRef.id;

  const bucket = getStorage(app).bucket();
  const storagePath = `uploads/${sessionId}/${uploadId}/original.jpg`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(probed.strippedBuffer, { contentType: probed.mime });
  const [signedUrl] = await storageFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 });

  const ready: Upload = {
    id: uploadId,
    sessionId,
    ...(userId && { userId }),
    originalPath: storagePath,
    widthPx: probed.widthPx,
    heightPx: probed.heightPx,
    mime: probed.mime,
    bytes: probed.strippedBuffer.byteLength,
    exifStripped: true,
    status: 'ready',
    createdAt: new Date(),
  };
  await uploadRef.set(UploadSchema.parse(ready));

  // The client needs a real, immediately-fetchable URL for the live editing
  // session (canvas image loading) — that's `originalUrl` below, freshly
  // signed on every request and never persisted. Only `originalPath`
  // (already on `ready`) goes to Firestore.
  return NextResponse.json({ ...ready, originalUrl: signedUrl }, { status: 200 });
}
