import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../lib/image-probe';
import { findVariantById } from '../../../lib/variant-lookup';
import { UploadSchema, type Upload } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const variantIdRaw = formData.get('variantId');
  if (!(file instanceof Blob) || typeof variantIdRaw !== 'string') {
    return NextResponse.json({ error: 'Missing file or variantId' }, { status: 400 });
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  // minUploadPx must come from the server-fetched variant, never the
  // client — a client can otherwise send an arbitrarily low value (or a
  // non-numeric one, silently passing via `x < NaN` being false) to bypass
  // the resolution-quality gate entirely. See Finding 7 in review.
  const variant = await findVariantById(db, variantIdRaw);
  if (!variant) {
    return NextResponse.json({ error: `Unknown variantId: ${variantIdRaw}` }, { status: 400 });
  }
  const minUploadPx = variant.minUploadPx;

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

  if (probed.widthPx < minUploadPx || probed.heightPx < minUploadPx) {
    const rejected: Upload = {
      id: uploadId,
      sessionId,
      // UploadSchema requires a non-empty originalUrl even for rejected
      // uploads (no dedicated "no file" representation) — the file was
      // never written to storage, so this is a sentinel, not a real URL.
      originalUrl: 'rejected://not-uploaded',
      widthPx: probed.widthPx,
      heightPx: probed.heightPx,
      mime: probed.mime,
      bytes: probed.strippedBuffer.byteLength,
      exifStripped: true,
      status: 'rejected',
    };
    await uploadRef.set(UploadSchema.parse(rejected));
    return NextResponse.json(rejected, { status: 422 });
  }

  const bucket = getStorage(app).bucket();
  const storagePath = `uploads/${sessionId}/${uploadId}/original.jpg`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(probed.strippedBuffer, { contentType: probed.mime });
  const [signedUrl] = await storageFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 });

  const ready: Upload = {
    id: uploadId,
    sessionId,
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
