import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import {
  PersonalizationStateSchema,
  buildOrderSnapshot,
  checkCompleteness,
  type OrderPersonalizationSnapshot,
  type PersonalizationState,
  type PrintSizeIn,
} from '@bro-pics/shared';
import { getTemplateVersion } from './personalization-templates';

/** What the browser claims. Nothing in it is trusted until validated below. */
export interface ClaimedPersonalization {
  templateId: string;
  templateVersion: number;
  state: unknown;
}

export type PersonalizationRejection =
  | 'malformed'
  | 'template_unavailable'
  | 'template_not_offered'
  | 'unknown_slot'
  | 'asset_not_found'
  | 'asset_not_owned'
  | 'incomplete';

export class PersonalizationRejectedError extends Error {
  constructor(public readonly code: PersonalizationRejection, message: string, public readonly details?: string[]) {
    super(message);
    this.name = 'PersonalizationRejectedError';
  }
}

/**
 * Turns a cart line's CLAIMED personalization into a trusted order snapshot, or throws
 * PersonalizationRejectedError. Run before any side effect (order number, payment).
 *
 * Trusts none of: the template id/version (loaded from the store; must be PUBLISHED),
 * photo ownership (each assetId must be a ready upload belonging to THIS user),
 * photo dimensions (taken from the upload record, so a spoofed width/height cannot
 * fake a sharp DPI), slot ids, text length, or completeness (re-checked here — the
 * browser's own check is only a convenience).
 */
export interface LineContext {
  /** The template the product/variant actually offers (variant override, else product). */
  offeredTemplateId?: string | null;
  /** The frame size bought, so photo sharpness is judged at that size. */
  printSizeIn?: PrintSizeIn;
}

export async function buildLineSnapshot(
  db: Firestore,
  userId: string,
  claimed: ClaimedPersonalization,
  context: LineContext = {}
): Promise<OrderPersonalizationSnapshot> {
  const parsed = PersonalizationStateSchema.safeParse(claimed.state);
  if (!parsed.success) throw new PersonalizationRejectedError('malformed', 'The personalization data is invalid.');
  const claimedState = parsed.data;
  if (claimedState.templateId !== claimed.templateId || claimedState.templateVersion !== claimed.templateVersion) {
    throw new PersonalizationRejectedError('malformed', 'The personalization does not match its template version.');
  }

  // A design can only be bought on the product it is offered for: otherwise a
  // 30-photo collage could be ordered at a single-photo frame's price.
  if (context.offeredTemplateId !== undefined && context.offeredTemplateId !== claimed.templateId) {
    throw new PersonalizationRejectedError('template_not_offered', 'This design is no longer offered for this frame. Please personalize it again.');
  }

  const template = await getTemplateVersion(db, claimed.templateId, claimed.templateVersion);
  if (!template || template.status !== 'published') {
    throw new PersonalizationRejectedError('template_unavailable', 'This design is no longer available. Please personalize it again.');
  }

  const slotIds = new Set(template.photoSlots.map((s) => s.id));
  const textIds = new Set(template.textSlots.map((s) => s.id));
  for (const id of Object.keys(claimedState.slots)) {
    if (!slotIds.has(id)) throw new PersonalizationRejectedError('unknown_slot', `Unknown photo slot "${id}".`);
  }
  for (const id of Object.keys(claimedState.texts)) {
    if (!textIds.has(id)) throw new PersonalizationRejectedError('unknown_slot', `Unknown text field "${id}".`);
  }
  const calendarIds = new Set((template.calendarSlots ?? []).map((s) => s.id));
  for (const id of Object.keys(claimedState.dates ?? {})) {
    if (!calendarIds.has(id)) throw new PersonalizationRejectedError('unknown_slot', `Unknown calendar "${id}".`);
  }

  // Rebuild the slots from the SERVER'S view of each upload.
  const slots: PersonalizationState['slots'] = {};
  await Promise.all(
    Object.entries(claimedState.slots).map(async ([slotId, photo]) => {
      const snap = await db.collection('uploads').doc(photo.assetId).get();
      if (!snap.exists) throw new PersonalizationRejectedError('asset_not_found', 'One of your photos could not be found. Please upload it again.');
      const upload = snap.data() as { userId?: string; status?: string; widthPx: number; heightPx: number };
      if (upload.status !== 'ready') throw new PersonalizationRejectedError('asset_not_found', 'One of your photos could not be processed. Please upload it again.');
      if (upload.userId !== userId) throw new PersonalizationRejectedError('asset_not_owned', 'One of your photos could not be found. Please upload it again.');
      slots[slotId] = {
        assetId: photo.assetId,
        width: upload.widthPx,
        height: upload.heightPx,
        transform: photo.transform,
        rotation: photo.rotation,
        confirmedLowDpi: photo.confirmedLowDpi,
        // `url` is deliberately dropped: signed links expire and are not part of the record.
      };
    })
  );

  const state: PersonalizationState = { ...claimedState, slots };

  const completeness = checkCompleteness(template, state, { printSizeIn: context.printSizeIn });
  if (!completeness.complete) {
    throw new PersonalizationRejectedError('incomplete', 'Your personalization is not complete.', completeness.blockers);
  }

  return buildOrderSnapshot(template, state);
}
