import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';
import { safeRevalidate } from '../../../../../lib/revalidate-catalogue';
import { OfferPageFaqSchema, logger } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

const SLUG = /^[a-z0-9-]{2,60}$/;
const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : v instanceof Date ? v.toISOString() : null);
const When = z
  .union([z.string().datetime(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));

const BodySchema = z
  .object({
    isActive: z.boolean(),
    title: z.string().trim().min(1).max(80),
    subtitle: z.string().trim().max(160).default(''),
    heroImage: z.string().max(500).default(''),
    productId: z.string().min(1).max(128),
    sizeLabels: z.array(z.string().max(40)).max(12).default([]),
    ctaLabel: z.string().trim().max(40).default('Shop now'),
    deliveryNote: z.string().trim().max(120).default(''),
    faq: z.array(OfferPageFaqSchema).max(12).default([]),
    startsAt: When,
    endsAt: When,
  })
  .strict();

/** One offer page's settings (null `campaign` when it has not been set up yet). */
export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const permission = await requirePermission(request, 'content:read');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content read access required');
  const { slug } = await params;
  if (!SLUG.test(slug)) return adminApiError(400, 'invalid_request', 'Invalid offer page address');
  const snap = await getFirestore(getAdminApp()).collection('offerPages').doc(slug).get();
  if (!snap.exists) return NextResponse.json({ campaign: null });
  return NextResponse.json({ campaign: { ...snap.data(), slug, startsAt: iso(snap.get('startsAt')), endsAt: iso(snap.get('endsAt')), updatedAt: iso(snap.get('updatedAt')) } });
}

/** Creates or replaces an offer page's settings. The product must exist; prices always come from its sizes. */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const permission = await requirePermission(request, 'content:write');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Content write access required');
  const { slug } = await params;
  if (!SLUG.test(slug)) return adminApiError(400, 'invalid_request', 'Invalid offer page address');
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', 'Invalid offer page settings', { issues: parsed.error.issues });
  const body = parsed.data;
  if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) return adminApiError(400, 'invalid_request', 'The end date must be after the start date.');
  const db = getFirestore(getAdminApp());
  const product = await db.collection('products').doc(body.productId).get();
  if (!product.exists) return adminApiError(400, 'invalid_request', 'That product does not exist.');
  const now = new Date();
  await db.collection('offerPages').doc(slug).set({ ...body, slug, updatedAt: now });
  safeRevalidate(`/offers/${slug}`);
  await writeAuditLog(db, { actorUid: permission.uid, action: 'offer_page.save', resource: 'offer_page', resourceId: slug, details: { isActive: body.isActive, productId: body.productId } }).catch((error) =>
    logger.error('Failed to write audit log', { slug, error: String(error) })
  );
  return NextResponse.json({ ok: true });
}
