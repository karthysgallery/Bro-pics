import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { CustomizationSchema } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const db = getFirestore(getAdminApp());
  const docRef = db.collection('customizations').doc();

  const parsed = CustomizationSchema.safeParse({ ...body, id: docRef.id });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}
