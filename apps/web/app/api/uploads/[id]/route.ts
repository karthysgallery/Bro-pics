import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { getSignedReadUrl } from '../../../../lib/storage-url';
import { checkRateLimit } from '../../../../lib/rate-limit';
import type { Upload } from '@bro-pics/shared';

/**
 * BE-08: lets the editor re-fetch an upload's status/dimensions/preview
 * URL by id — e.g. resuming a session where the original POST /api/uploads
 * response was lost to a network blip after the write actually succeeded.
 * Same ownership model as GET /api/media/url (session match, staff role,
 * or the caller's own uid on the doc), since this returns a freshly-signed
 * display URL too.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('uploads').doc(id).get();
  if (!doc.exists) {
    return NextResponse.json({ error: `Unknown uploadId: ${id}`, code: 'not_found' }, { status: 404 });
  }
  const upload = doc.data() as Upload;

  const sessionId = request.headers.get('X-Session-Id');
  const staffUid = await getStaffUserIdFromAuthHeader(request);
  const userId = staffUid ? null : await getUserIdFromAuthHeader(request);

  const authorized = staffUid !== null || sessionId === upload.sessionId || (userId !== null && userId === upload.userId);
  if (!authorized) {
    return NextResponse.json({ error: 'Not authorized to access this upload', code: 'forbidden' }, { status: 403 });
  }

  const previewUrl = upload.status === 'ready' ? await getSignedReadUrl(upload.originalPath) : null;

  return NextResponse.json(
    {
      id: upload.id,
      status: upload.status,
      widthPx: upload.widthPx,
      heightPx: upload.heightPx,
      mime: upload.mime,
      previewUrl,
    },
    { status: 200 }
  );
}
