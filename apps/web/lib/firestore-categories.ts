import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { serializeDoc } from './serialize-doc';
import type { Category } from '@bro-pics/shared';

export async function getActiveCategories(): Promise<Category[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('categories')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();
  return snapshot.docs.map((doc) => serializeDoc(doc.data() as Category));
}
