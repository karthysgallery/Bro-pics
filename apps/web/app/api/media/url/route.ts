import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader, getStaffUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { getSignedReadUrl } from '../../../../lib/storage-url';
import { checkRateLimit } from '../../../../lib/rate-limit';

// Only `uploads/{sessionId}/...` objects (originals and their previews) are
// ever resolved through this route — print-files/returns are staff/server
// concerns with their own access paths, never exposed to arbitrary client
// requests here.
const ALLOWED_PATH_PATTERN = /^uploads\/[^/]+\/.+$/;

async function canAccessPath(request: Request, path: string): Promise<boolean> {
  const segments = path.split('/');
  const pathSessionId = segments[1];

  const sessionId = request.headers.get('X-Session-Id');
  if (sessionId && sessionId === pathSessionId) return true;

  const staffUid = await getStaffUserIdFromAuthHeader(request);
  if (staffUid) return true;

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) return false;

  const db = getFirestore(getAdminApp());
  const [uploadSnap, customizationSnap] = await Promise.all([
    db.collection('uploads').where('originalPath', '==', path).limit(1).get(),
    db.collection('customizations').where('previewPath', '==', path).limit(1).get(),
  ]);
  if (!uploadSnap.empty && uploadSnap.docs[0].data().userId === userId) return true;
  if (!customizationSnap.empty && customizationSnap.docs[0].data().userId === userId) return true;
  return false;
}

export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');
  if (!path || !ALLOWED_PATH_PATTERN.test(path) || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid or missing path' }, { status: 400 });
  }

  if (!(await canAccessPath(request, path))) {
    return NextResponse.json({ error: 'Not authorized to access this file' }, { status: 403 });
  }

  const url = await getSignedReadUrl(path);
  return NextResponse.json({ url }, { status: 200 });
}
