import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { PageSchema, FaqItemSchema, type Page, type FaqItem } from '@bro-pics/shared';

/**
 * [FE-28] ABE-18 built the write API (POST/PATCH /api/admin/pages,
 * /api/admin/faqs) but deliberately left reading these collections into
 * the public `(content)` pages out of scope — this is that read side.
 * Each page's `generateMetadata` and its default export both call this
 * with the same slug, so it runs the Firestore read twice per request —
 * this codebase's React version has no working `cache()` export to dedupe
 * that (confirmed: it throws "cache is not a function" here), and this is
 * a low-traffic static page, not a hot path worth adding a caching layer
 * of its own for.
 *
 * Returns null (never throws to the caller) for "no CMS content yet" —
 * every `(content)/*\/page.tsx` caller treats that as "render my existing
 * hardcoded copy", the same safe-default-until-configured convention as
 * getShippingSettings/getGstSettings/getHeaderSettings etc. An unpublished
 * page (isPublished: false — a draft an admin is still editing) is
 * treated the same as absent, never shown to a visitor.
 */
export async function getPageBySlug(slug: string): Promise<Page | null> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('pages').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  const page = PageSchema.parse(snapshot.docs[0].data());
  return page.isPublished ? page : null;
}

/**
 * [FE-28] Same reasoning as getPageBySlug above, for the FAQ page's
 * `faqs` collection. Sorted by sortOrder within each section — the
 * public page then groups by `section`, in first-seen order (whichever
 * section the lowest-sortOrder item belongs to comes first).
 */
export async function getActiveFaqs(): Promise<FaqItem[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('faqs').where('isActive', '==', true).get();
  return snapshot.docs
    .map((d) => FaqItemSchema.parse(d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
