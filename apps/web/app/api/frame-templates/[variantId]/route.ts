import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { checkRateLimit } from '../../../../lib/rate-limit';
import type { FrameTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ variantId: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { variantId } = await params;
  const db = getFirestore(getAdminApp());
  // frameTemplates is a subcollection of products/{id}; querying across all
  // products' frame-template subcollections by variantId requires a
  // collection-group query, which needs the composite index added in
  // Task 5's seed step (see firestore.indexes.json).
  const snapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
  const templates = snapshot.docs.map((doc) => doc.data() as FrameTemplate);

  // Once template versioning is real (see the backend requirements doc —
  // admin template edits create a new doc rather than mutating one), a
  // variant can have several version docs. Filtered/sorted here in memory
  // rather than a `.where('isCurrent', '==', true)` query, which would need
  // a new composite index (variantId + isCurrent) that doesn't exist —
  // today's single-field `variantId` query needs no new index. The current
  // version is returned first (callers read templates[0]); falls back to
  // the highest version number if none is explicitly marked current, so a
  // data inconsistency degrades to "probably right" rather than an empty
  // editor.
  const sorted = [...templates].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return b.version - a.version;
  });
  return NextResponse.json(sorted, { status: 200 });
}
