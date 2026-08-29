import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { Category } from '@bro-pics/shared';

export async function getActiveCategories(): Promise<Category[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('categories')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();
  return snapshot.docs.map((doc) => doc.data() as Category);
}
