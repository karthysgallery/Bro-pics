import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../../lib/image-probe';

export async function POST(request: Request): Promise<NextResponse> {
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

  return NextResponse.json({ previewUrl: signedUrl }, { status: 200 });
}
