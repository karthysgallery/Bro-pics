import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import { getUserIdFromAuthHeader } from '../../../../lib/verify-id-token';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { CustomizationSchema, CURRENT_SCHEMA_VERSION } from '@bro-pics/shared';
import type { Customization } from '@bro-pics/shared';

/**
 * [FE-24] "Reorder" copies every Customization doc sharing a delivered
 * order's personalizationId into a fresh set of 'draft' docs under a NEW
 * personalizationId, so the customer's own cart-context.addItem call can
 * build a new cart line from it. Never mutates or reuses the original docs
 * — those stay 'ordered'/'locked' exactly as the original order left them
 * (create-order and the payment webhook both assume a personalizationId's
 * Customization docs never change status backwards once locked).
 *
 * Deliberately skips POST /api/customizations' own session-ownership check
 * on the underlying uploadId (Upload.sessionId !== caller's X-Session-Id
 * would always fail here — a reorder can happen in a brand new browser
 * session, days or months after the original upload). Ownership is instead
 * proven the same way /api/checkout/create-order already trusts it: every
 * copied doc's own stamped `userId` must match the signed-in caller's uid.
 * A customization with no userId at all (never reconciled to an account —
 * see BE-35) can never be reordered through this route; that matches
 * order-detail already requiring `user` to view the order in the first
 * place, so a real order's items always have this.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'write');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again shortly', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const userId = await getUserIdFromAuthHeader(request);
  if (!userId) {
    return NextResponse.json({ error: 'Sign in required', code: 'unauthenticated' }, { status: 401 });
  }

  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header', code: 'missing_session_id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const personalizationId = typeof body?.personalizationId === 'string' ? body.personalizationId : '';
  if (!personalizationId) {
    return NextResponse.json({ error: 'Missing personalizationId', code: 'missing_personalization_id' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('customizations').where('personalizationId', '==', personalizationId).get();
  if (snapshot.empty) {
    return NextResponse.json({ error: `Unknown personalizationId: ${personalizationId}`, code: 'not_found' }, { status: 404 });
  }

  const originals = snapshot.docs.map((d) => d.data() as Customization);
  // Never confirms whether a personalizationId exists for someone else —
  // same "not yours" convention as the returns/order-lookup routes.
  if (!originals.every((c) => c.userId === userId)) {
    return NextResponse.json({ error: `Unknown personalizationId: ${personalizationId}`, code: 'not_found' }, { status: 404 });
  }

  const newPersonalizationId = db.collection('customizations').doc().id;
  const batch = db.batch();
  const copies: Customization[] = [];
  for (const original of originals) {
    const docRef = db.collection('customizations').doc();
    const parsed = CustomizationSchema.parse({
      ...original,
      id: docRef.id,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sessionId,
      userId,
      personalizationId: newPersonalizationId,
      status: 'draft',
      renderStatus: 'pending',
      renderedFilePath: undefined,
      lockedAt: undefined,
      redConfirmedAt: undefined,
      createdAt: new Date(),
    });
    batch.set(docRef, parsed);
    copies.push(parsed);
  }
  await batch.commit();

  return NextResponse.json(
    { personalizationId: newPersonalizationId, customizations: copies.sort((a, b) => a.slotIndex - b.slotIndex) },
    { status: 200 }
  );
}
