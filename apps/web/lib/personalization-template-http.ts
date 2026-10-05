import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminApiError } from './admin-api-error';
import { TemplateNotFoundError, TemplateStateError } from './personalization-templates';
import type { PersonalizationTemplate } from '@bro-pics/shared';

/** Maps store/validation failures to the right admin HTTP response. */
export function templateErrorResponse(err: unknown): NextResponse {
  if (err instanceof TemplateNotFoundError) return adminApiError(404, 'not_found', err.message);
  if (err instanceof TemplateStateError) return adminApiError(409, 'conflict', err.message);
  if (err instanceof Error && /cannot be published/i.test(err.message)) return adminApiError(422, 'invalid_request', err.message);
  throw err;
}

/**
 * Publish-time asset check: every asset a template references must exist in the media
 * library (media/{assetId}). Resolved up front so validateTemplate can stay synchronous.
 * Legacy-adapter asset ids ("legacy-…") reference existing URLs, not media docs, and are skipped.
 */
export async function buildAssetExists(db: Firestore, template: PersonalizationTemplate): Promise<(assetId: string) => boolean> {
  const ids = new Set<string>();
  for (const layer of template.layers) if (layer.kind === 'fixed') ids.add(layer.asset.assetId);
  for (const slot of template.photoSlots) if (slot.mask) ids.add(slot.mask.assetId);
  const present = new Set<string>();
  await Promise.all(
    [...ids].map(async (id) => {
      if (id.startsWith('legacy-')) return present.add(id);
      const snap = await db.collection('media').doc(id).get();
      if (snap.exists) present.add(id);
    })
  );
  return (assetId) => present.has(assetId);
}
