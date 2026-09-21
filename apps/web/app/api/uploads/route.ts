import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../lib/image-probe';
import { findVariantById } from '../../../lib/variant-lookup';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { checkRateLimit } from '../../../lib/rate-limit';
import { UploadSchema, type Upload } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }
  const userId = await getUserIdFromAuthHeader(request);

  const formData = await request.formData();
  const file = formData.get('file');
  const variantIdRaw = formData.get('variantId');
  if (!(file instanceof Blob) || typeof variantIdRaw !== 'string') {
    return NextResponse.json({ error: 'Missing file or variantId' }, { status: 400 });
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
    return NextResponse.json({ error: `Unknown variantId: ${variantIdRaw}` }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  let probed;
  try {
    probed = await probeAndStripImage(inputBuffer);
  } catch {
    return NextResponse.json(
      { error: 'Unable to process image — file may be corrupt or in an unsupported format' },
      { status: 400 }
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
    originalUrl: signedUrl,
    widthPx: probed.widthPx,
    heightPx: probed.heightPx,
    mime: probed.mime,
    bytes: probed.strippedBuffer.byteLength,
    exifStripped: true,
    status: 'ready',
  };
  await uploadRef.set(UploadSchema.parse(ready));

  return NextResponse.json(ready, { status: 200 });
}
