import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { MediaUsageRef } from '@bro-pics/shared';

/**
 * [ABE-11] Nothing calls these yet — no admin write API references a
 * `MediaAsset` by id today (ABE-10's own status note: `products/{id}/media`
 * migrating to reference `MediaAsset.id` is future work). This is the
 * plumbing a future consumer (a product-media write API, a homepage-
 * banner picker, etc.) calls when it attaches/detaches a media asset, so
 * `usageRefs` — and therefore the archive-warning check in
 * `app/api/admin/media/[id]/route.ts` — is accurate once something does.
 *
 * `arrayUnion`/`arrayRemove` compare array elements by deep equality, so
 * adding the same {resource, resourceId} pair twice is a no-op rather
 * than a duplicate entry — no separate read-then-check needed.
 */
export async function addMediaUsageRef(db: Firestore, mediaId: string, ref: MediaUsageRef): Promise<void> {
  await db.collection('media').doc(mediaId).update({ usageRefs: FieldValue.arrayUnion(ref) });
}

export async function removeMediaUsageRef(db: Firestore, mediaId: string, ref: MediaUsageRef): Promise<void> {
  await db.collection('media').doc(mediaId).update({ usageRefs: FieldValue.arrayRemove(ref) });
}
