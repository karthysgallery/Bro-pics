import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../../lib/image-probe';
import { checkRateLimit } from '../../../../lib/rate-limit';

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

  const body = await request.json();
  const { personalizationId, slotIndex, dataUrl } = body ?? {};
  if (typeof personalizationId !== 'string' || typeof slotIndex !== 'number' || typeof dataUrl !== 'string') {
    return NextResponse.json({ error: 'Missing personalizationId, slotIndex, or dataUrl' }, { status: 400 });
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
  }
  const [, , base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');

  let probed;
  try {
    probed = await probeAndStripImage(buffer);
  } catch {
    return NextResponse.json(
      { error: 'Unable to process image — file may be corrupt or in an unsupported format' },
      { status: 400 }
    );
  }

  const app = getAdminApp();
  const bucket = getStorage(app).bucket();
  const storagePath = `uploads/${sessionId}/previews/${personalizationId}/slot-${slotIndex}.png`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(probed.strippedBuffer, { contentType: probed.mime });
  const [signedUrl] = await storageFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 });

  // `previewPath` is what callers should persist (Customization, cart line,
  // order item); `previewUrl` is a freshly-signed, never-persisted URL for
  // immediate display right after this upload (e.g. the cart drawer's
  // thumbnail in the same session it was just added).
  return NextResponse.json({ previewPath: storagePath, previewUrl: signedUrl }, { status: 200 });
}
