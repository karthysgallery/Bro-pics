import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { findVariantById } from '../../../../lib/variant-lookup';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { CustomizationSchema, effectiveDpiFromCropRect, printDimensionsForRotation } from '@bro-pics/shared';
import type { Customization, Upload } from '@bro-pics/shared';

const MUTABLE_FIELDS = ['transformJson', 'textFieldsJson', 'clipartId', 'previewPath', 'renderStatus'] as const;

/**
 * BE-12: debounced draft autosave. PUT (not PATCH) is deliberate — the
 * whole mutable-field set is replaced every call, so a lost/retried
 * request converges to the same state rather than compounding a partial
 * update. Only a 'draft' can be edited: once an order references this
 * customization (status 'ordered'/'locked'), an edit attempt here can't
 * retroactively change what was already ordered — the client is expected
 * to fork a new draft (a fresh POST /api/customizations) instead. This
 * route only refuses the edit; it doesn't perform the fork itself.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header', code: 'missing_session_id' }, { status: 400 });
  }

  const { id } = await params;
  const db = getFirestore(getAdminApp());
  const docRef = db.collection('customizations').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    return NextResponse.json({ error: `Unknown customization: ${id}`, code: 'not_found' }, { status: 404 });
  }
  const existing = doc.data() as Customization;

  if (existing.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Customization does not belong to this session', code: 'forbidden' }, { status: 403 });
  }
  if (existing.status !== 'draft') {
    return NextResponse.json(
      { error: 'This customization is no longer editable — start a new one instead', code: 'not_draft' },
      { status: 409 }
    );
  }

  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body', code: 'invalid_body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const field of MUTABLE_FIELDS) {
    if (field in (body as Record<string, unknown>)) {
      patch[field] = (body as Record<string, unknown>)[field];
    }
  }

  // If the crop changed, effectiveDpi/dpiBand must be recomputed the exact
  // same server-trusted way POST does — never taken from the client, and
  // never left stale from before the edit.
  let dpiUpdate: { effectiveDpi: number; dpiBand: 'green' | 'amber' | 'red' } | null = null;
  if (patch.transformJson && typeof patch.transformJson === 'object') {
    const transformJson = patch.transformJson as Record<string, unknown>;
    const cropRect = transformJson.cropRect as { width: number; height: number } | undefined;
    if (!cropRect || typeof cropRect.width !== 'number' || typeof cropRect.height !== 'number') {
      return NextResponse.json({ error: 'Missing transformJson.cropRect', code: 'invalid_body' }, { status: 400 });
    }
    const uploadDoc = await db.collection('uploads').doc(existing.uploadId).get();
    const upload = uploadDoc.data() as Upload;
    const variant = await findVariantById(db, existing.variantId);
    if (!variant) {
      return NextResponse.json({ error: `Unknown variantId: ${existing.variantId}`, code: 'unknown_variant' }, { status: 400 });
    }
    const rotationDeg = transformJson.rotationDeg;
    const { printWidthIn, printHeightIn } = printDimensionsForRotation(variant, typeof rotationDeg === 'number' ? rotationDeg : 0);
    const { effectiveDpi, tier } = effectiveDpiFromCropRect(upload.widthPx, upload.heightPx, cropRect, printWidthIn, printHeightIn);
    dpiUpdate = { effectiveDpi, dpiBand: tier };
  }

  const confirmedLowDpi = (body as Record<string, unknown>).confirmedLowDpi === true;
  const nextDpiBand = dpiUpdate?.dpiBand ?? existing.dpiBand;

  const merged = {
    ...existing,
    ...patch,
    ...(dpiUpdate && { effectiveDpi: dpiUpdate.effectiveDpi, dpiBand: dpiUpdate.dpiBand }),
    // A fresh red-tier confirmation on THIS edit; an existing confirmation
    // from a prior save is otherwise left untouched (still not present if
    // it never was, still present if it already was and the crop didn't
    // just change back into red — matching POST's rule that only the
    // server's own current dpiBand can ever set this, never the client).
    ...(nextDpiBand === 'red' && confirmedLowDpi && { redConfirmedAt: new Date() }),
  };

  const parsed = CustomizationSchema.safeParse(merged);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', code: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}
