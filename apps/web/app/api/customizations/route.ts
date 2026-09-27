import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { findVariantById } from '../../../lib/variant-lookup';
import { getUserIdFromAuthHeader } from '../../../lib/verify-id-token';
import { checkRateLimit } from '../../../lib/rate-limit';
import { CustomizationSchema, CURRENT_SCHEMA_VERSION } from '@bro-pics/shared';
import { effectiveDpiFromCropRect, printDimensionsForRotation } from '@bro-pics/shared';
import type { Upload, FrameTemplate, Customization } from '@bro-pics/shared';
import { fontFamilyForKey } from '../../../lib/text-personalization-options';

// [FE-12] The client only ever sends the RESOLVED CSS font-family string
// (fontFamilyForKey's output), never the raw key — this maps a template
// zone's admin-facing allowedFonts (font keys, the same identifiers
// TEXT_FONT_OPTIONS uses) to the resolved strings a submission could
// actually match, so a template author never has to know or type a CSS
// var() string.
function resolvedAllowedFontFamilies(allowedFonts: string[]): Set<string> {
  return new Set(allowedFonts.map((key) => fontFamilyForKey(key)));
}

/**
 * [FE-12] Validates submitted textFieldsJson against the pinned template
 * version's own textZones — required/maxLength/allowedFonts/allowedColors
 * were previously enforced only client-side (the input's own maxLength
 * attribute, the picker only ever offering allowed choices), so a direct
 * API call bypassing the UI could submit an empty required field, an
 * over-length string, or an arbitrary font/colour. minFontSizePx/
 * maxFontSizePx are deliberately NOT checked here — nothing in this
 * payload represents a rendered font size at all (the canvas auto-fits
 * one from the zone's own pixel dimensions); those two fields are a
 * rendering-time constraint on EditorCanvas, not a submission shape.
 */
function validateTextFieldsAgainstTemplate(
  template: FrameTemplate,
  textFieldsJson: Record<string, { value: string; fontFamily: string; color: string }> | undefined
): string | null {
  for (const zone of template.textZones) {
    const field = textFieldsJson?.[zone.fieldKey];
    if (zone.required && !field?.value.trim()) {
      return `"${zone.label}" is required`;
    }
    if (!field) continue;
    if (field.value.length > zone.maxLength) {
      return `"${zone.label}" exceeds its ${zone.maxLength}-character limit`;
    }
    if (zone.allowedFonts && zone.allowedFonts.length > 0) {
      if (!resolvedAllowedFontFamilies(zone.allowedFonts).has(field.fontFamily)) {
        return `"${zone.label}" was given a font not allowed for this template`;
      }
    }
    if (zone.allowedColors && zone.allowedColors.length > 0 && !zone.allowedColors.includes(field.color)) {
      return `"${zone.label}" was given a colour not allowed for this template`;
    }
  }
  return null;
}

/**
 * [FE-16/FE-24] Fetches every Customization doc sharing a personalizationId
 * (one per slot for a multi-slot collage) — the read side "re-edit from
 * cart" and "reorder" both need, to rehydrate the editor or rebuild a
 * fresh cart line from a previously-saved personalization. Session/owner
 * scoped the same way GET /api/uploads/{id} is: a session-id header match,
 * or the caller's own uid on every returned doc.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'read');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const personalizationId = searchParams.get('personalizationId');
  if (!personalizationId) {
    return NextResponse.json({ error: 'Missing personalizationId', code: 'missing_personalization_id' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('customizations').where('personalizationId', '==', personalizationId).get();
  if (snapshot.empty) {
    return NextResponse.json({ error: `Unknown personalizationId: ${personalizationId}`, code: 'not_found' }, { status: 404 });
  }

  const docs = snapshot.docs.map((d) => d.data() as Customization);
  const sessionId = request.headers.get('X-Session-Id');
  const userId = await getUserIdFromAuthHeader(request);
  const authorized = docs.every((c) => (sessionId && c.sessionId === sessionId) || (userId && c.userId === userId));
  if (!authorized) {
    return NextResponse.json({ error: 'Not authorized to access this personalization', code: 'forbidden' }, { status: 403 });
  }

  return NextResponse.json({ customizations: docs.sort((a, b) => a.slotIndex - b.slotIndex) }, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  // Require X-Session-Id the same way /api/uploads and /api/uploads/preview
  // do — a client-supplied `sessionId` in the JSON body is never trusted;
  // the header is the sole source of truth. See Finding 6 in review.
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }
  const userId = await getUserIdFromAuthHeader(request);

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { uploadId, variantId, transformJson } = body as Record<string, unknown>;
  if (typeof uploadId !== 'string' || typeof variantId !== 'string' || !transformJson || typeof transformJson !== 'object') {
    return NextResponse.json({ error: 'Missing uploadId, variantId, or transformJson' }, { status: 400 });
  }
  const cropRect = (transformJson as Record<string, unknown>).cropRect as
    | { width: number; height: number }
    | undefined;
  if (!cropRect || typeof cropRect.width !== 'number' || typeof cropRect.height !== 'number') {
    return NextResponse.json({ error: 'Missing transformJson.cropRect' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());

  // The upload must exist and must belong to THIS session — never trust
  // that the client's uploadId actually belongs to the caller.
  const uploadDoc = await db.collection('uploads').doc(uploadId).get();
  if (!uploadDoc.exists) {
    return NextResponse.json({ error: `Unknown uploadId: ${uploadId}` }, { status: 400 });
  }
  const upload = uploadDoc.data() as Upload;
  if (upload.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Upload does not belong to this session' }, { status: 403 });
  }
  // /api/uploads persists rejected (too-small, 422) uploads to Firestore
  // with a real id and returns that id in the response body — a client
  // could otherwise reference a rejected upload's id here, bypassing the
  // resolution-quality gate entirely. See Finding 3 in the second-round
  // review.
  if (upload.status !== 'ready') {
    return NextResponse.json({ error: `Upload ${uploadId} is not ready (status: ${upload.status})` }, { status: 400 });
  }

  const variant = await findVariantById(db, variantId);
  if (!variant) {
    return NextResponse.json({ error: `Unknown variantId: ${variantId}` }, { status: 400 });
  }

  // [FE-12] Only fetched when there's something to check against — a
  // product with no text personalization at all never has textZones,
  // and a submission with no textFieldsJson still needs this to catch a
  // MISSING required field, so this can't be skipped just because
  // textFieldsJson is absent.
  const { templateVersion } = body as Record<string, unknown>;
  if (typeof templateVersion === 'number') {
    // A single-field `variantId` equality query, filtered by version in
    // memory — matching GET /api/frame-templates/[variantId]'s own
    // established reasoning: a second `.where('version','==',...)` would
    // need a composite index this environment can't deploy.
    const templateSnapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
    const template = templateSnapshot.docs.map((d) => d.data() as FrameTemplate).find((t) => t.version === templateVersion);
    if (template && template.textZones.length > 0) {
      const textFieldsJson = (body as Record<string, unknown>).textFieldsJson as
        | Record<string, { value: string; fontFamily: string; color: string }>
        | undefined;
      const validationError = validateTextFieldsAgainstTemplate(template, textFieldsJson);
      if (validationError) {
        return NextResponse.json({ error: validationError, code: 'invalid_text_field' }, { status: 400 });
      }
    }
  }

  // effectiveDpi is ALWAYS server-recomputed from the server-trusted
  // upload dimensions and variant print size — never taken from the
  // client's own claimed value. This is the same rule /api/uploads already
  // enforces for minUploadPx, applied one layer downstream. See Finding 6.
  //
  // Known residual (documented, not fixed here per the review's scoped
  // fix): cropRect itself is still client-supplied, so a client that
  // understates its crop can still report a higher effectiveDpi than the
  // photo it actually positioned. Closing that gap fully would require the
  // server to independently reconstruct the crop from the editor's raw
  // scale/offset/rotation state (which IS already stored in transformJson)
  // rather than trusting the client-computed cropRect — a good follow-up,
  // out of scope for this fix wave.
  // At 90°/270° the crop rect's width/height axes (in the ORIGINAL image's
  // own pixel space) are swapped relative to the print's physical
  // width/height axes — a 90°-rotated photo's "width" in image-space maps
  // to the print's HEIGHT axis. Not swapping variant.widthIn/heightIn to
  // match produces up to a 50% DPI over-report at those rotations. See
  // Finding 4 in the second-round review.
  const rotationDeg = (transformJson as Record<string, unknown>).rotationDeg;
  const { printWidthIn, printHeightIn } = printDimensionsForRotation(
    variant,
    typeof rotationDeg === 'number' ? rotationDeg : 0
  );

  const { effectiveDpi, tier: dpiBand } = effectiveDpiFromCropRect(
    upload.widthPx,
    upload.heightPx,
    cropRect,
    printWidthIn,
    printHeightIn
  );

  // The "use this photo anyway" confirmation used to be pure client state
  // (SlotState.confirmedLowDpi) that never reached the server at all — a
  // red-tier photo in a real order looked identical, to fulfillment,
  // whether the customer was warned and proceeded deliberately or the
  // check was bypassed some other way. redConfirmedAt is only ever set
  // when the server's OWN dpiBand computation (not the client's claim)
  // agrees the photo is actually red-tier — a client can't fabricate a
  // confirmation timestamp for a photo the server considers fine.
  const confirmedLowDpi = (body as Record<string, unknown>).confirmedLowDpi === true;

  const docRef = db.collection('customizations').doc();

  const parsed = CustomizationSchema.safeParse({
    ...body,
    id: docRef.id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionId,
    effectiveDpi,
    dpiBand,
    ...(dpiBand === 'red' && confirmedLowDpi && { redConfirmedAt: new Date() }),
    status: 'draft',
    ...(userId && { userId }),
    createdAt: new Date(),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}
