import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { PageSchema, FaqItemSchema, fillLegalTokens, isApproved, isLegalSlug, isVisibleToPublic, publicationBlockers, type Page, type FaqItem } from '@bro-pics/shared';
import { loadLegalValues } from './legal-values';
import { withDates } from './firestore-dates';

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
  const page = PageSchema.parse(withDates(snapshot.docs[0].data()));
  // Drafts are never shown. A legal page is shown only while an administrator's approval of THIS exact text stands.
  if (!isVisibleToPublic(page)) return null;
  // Business facts are filled in from the saved settings at the moment of viewing, so they can never be stale or
  // hard-coded. If anything is still unfilled, or an internal note is left in the text, the page is not shown at all.
  const filled = fillLegalTokens(page.bodyHtml, await loadLegalValues());
  const blockers = publicationBlockers(filled);
  if (isLegalSlug(slug) && (blockers.length > 0 || !isApproved(page))) return null;
  if (!isLegalSlug(slug) && blockers.some((b) => b.startsWith('Contains an internal note'))) return null;
  return { ...page, bodyHtml: filled };
}

/**
 * Slugs of the legal pages a visitor can actually read right now (published, approved for this exact text, nothing
 * unfilled). The footer shows a link only for these, so it never points at a holding notice.
 */
export async function getLiveLegalSlugs(): Promise<string[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('pages').get();
  const values = await loadLegalValues();
  const live: string[] = [];
  for (const doc of snapshot.docs) {
    const parsed = PageSchema.safeParse(withDates(doc.data()));
    if (!parsed.success) continue;
    const page = parsed.data;
    if (!isLegalSlug(page.slug) || !isVisibleToPublic(page) || !isApproved(page)) continue;
    if (publicationBlockers(fillLegalTokens(page.bodyHtml, values)).length > 0) continue;
    live.push(page.slug);
  }
  return live;
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
