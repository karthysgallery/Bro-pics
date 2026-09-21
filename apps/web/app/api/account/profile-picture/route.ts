import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { probeAndStripImage } from '../../../../lib/image-probe';
import { checkRateLimit } from '../../../../lib/rate-limit';

// Same signed-URL-expiry limitation as every other uploaded image in this
// app (order preview thumbnails, personalization uploads) — GCS V4 signed
// URLs cap at 7 days, so this can't be made "permanent" the way a public
// bucket URL would be. Matches existing behavior rather than being a new
// gap; a real fix (public read for this one path, or re-signing on every
// read) is a Storage-rules change, out of scope here.
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let probed;
  try {
    probed = await probeAndStripImage(buffer);
  } catch {
    return NextResponse.json(
      { error: 'Unable to process image — file may be corrupt or in an unsupported format' },
      { status: 400 }
    );
  }

  const bucket = getStorage(getAdminApp()).bucket();
  // A fixed path (not a fresh id per upload) — a new profile picture
  // overwrites the last one rather than accumulating orphaned files.
  const storagePath = `profile-pictures/${userId}/photo.jpg`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(probed.strippedBuffer, { contentType: probed.mime });
  const [signedUrl] = await storageFile.getSignedUrl({
    action: 'read',
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ photoUrl: signedUrl }, { status: 200 });
}
