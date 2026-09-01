import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import type { FrameTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ variantId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { variantId } = await params;
  const db = getFirestore(getAdminApp());
  // frameTemplates is a subcollection of products/{id}; querying across all
  // products' frame-template subcollections by variantId requires a
  // collection-group query, which needs the composite index added in
  // Task 5's seed step (see firestore.indexes.json).
  const snapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
  const templates = snapshot.docs.map((doc) => doc.data() as FrameTemplate);
  return NextResponse.json(templates, { status: 200 });
}
