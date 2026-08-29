import { getActiveHomepageSections, getBestSellingProducts, getFeaturedProducts } from '../../lib/firestore-homepage';
import { getActiveCategories } from '../../lib/firestore-categories';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../lib/firebase-admin';
import { renderHomeSection } from '../../components/home/registry';
import type { Review } from '@bro-pics/shared';

export const revalidate = 60;

async function getApprovedReviews(limit: number): Promise<Review[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('status', '==', 'approved').limit(limit).get();
  return snapshot.docs.map((doc) => doc.data() as Review);
}

export default async function HomePage() {
  const sections = await getActiveHomepageSections();
  const categories = await getActiveCategories();
  const bestSellers = await getBestSellingProducts(8);
  const featuredSection = sections.find((s) => s.type === 'featured_collection');
  const featured = featuredSection?.config?.categoryId
    ? await getFeaturedProducts(featuredSection.config.categoryId as string, 8)
    : [];
  const reviews = await getApprovedReviews(12);

  return (
    <div>
      {sections.map((section) =>
        renderHomeSection(section, { categories, bestSellers, featured, reviews })
      )}
    </div>
  );
}
