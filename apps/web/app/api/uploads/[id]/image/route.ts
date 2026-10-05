import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from '../../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { parseRequestedWidth, readStorageImage } from '../../../../../lib/image-proxy';
import type { Upload } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * A customer's own uploaded photo, served from this origin so the editor canvas
 * can draw and export it (a restored draft, or re-editing a cart line).
 * Same ownership rule as GET /api/uploads/[id]: the uploading session, the
 * signed-in owner, or staff. Never cached publicly.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'image');
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid upload id' }, { status: 400 });

  const snap = await getFirestore(getAdminApp()).collection('uploads').doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: 'Upload not found' }, { status: 404 });
  const upload = snap.data() as Upload;

  const sessionId = request.headers.get('X-Session-Id');
  const staffUid = await getStaffUserIdFromAuthHeader(request);
  const userId = staffUid ? null : await getUserIdFromAuthHeader(request);
  const authorized = staffUid !== null || (sessionId !== null && sessionId === upload.sessionId) || (userId !== null && userId === upload.userId);
  if (!authorized) return NextResponse.json({ error: 'Not authorized to access this upload' }, { status: 403 });
  if (upload.status !== 'ready') return NextResponse.json({ error: 'Upload is not ready' }, { status: 409 });

  const width = parseRequestedWidth(new URL(request.url).searchParams.get('w'), 2000);
  try {
    const image = await readStorageImage(upload.originalPath, width);
    return new NextResponse(new Uint8Array(image.body), {
      status: 200,
      headers: { 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=600' },
    });
  } catch {
    return NextResponse.json({ error: 'Image could not be read' }, { status: 404 });
  }
}
