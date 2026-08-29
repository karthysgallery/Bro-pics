import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { HomepageSection, Product } from '@bro-pics/shared';

function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

export async function getActiveHomepageSections(): Promise<HomepageSection[]> {
  const db = getFirestore(getAdminApp());
  const now = new Date();
  const snapshot = await db
    .collection('homepageSections')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();

  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as HomepageSection;
      return {
        ...data,
        startsAt: toDateOrNull(data.startsAt),
        endsAt: toDateOrNull(data.endsAt),
      };
    })
    .filter((section) => {
      if (section.startsAt && section.startsAt > now) return false;
      if (section.endsAt && section.endsAt < now) return false;
      return true;
    });
}

export async function getBestSellingProducts(limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .orderBy('ratingCount', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as Product);
}

export async function getFeaturedProducts(categoryId: string, limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .where('categoryId', '==', categoryId)
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as Product);
}
