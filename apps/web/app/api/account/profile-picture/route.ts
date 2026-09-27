import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { probeAndStripImage } from '../../../../lib/image-probe';
import { checkRateLimit } from '../../../../lib/rate-limit';

// [FE-04] Returns the Storage object path only, never a signed URL — this
// used to mint a 7-day signed URL and persist it directly onto the user
// doc, which silently broke a week after every upload. The client now
// resolves a fresh display URL from this path via GET /api/media/url,
// same *Path convention as Upload/Customization (BE-03/04).
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

  return NextResponse.json({ photoPath: storagePath }, { status: 200 });
}
