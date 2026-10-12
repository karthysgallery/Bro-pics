import { NextResponse } from 'next/server';
import { PriceListInputSchema, PriceListSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../../lib/catalogue/guard';
import { PRICE_LISTS } from '../../../../../lib/catalogue/price-lists';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Replace a price list's name and lines. Products already made from it keep the prices they were saved with. */
export async function PUT(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const { id } = await params;
  const ref = g.db.collection(PRICE_LISTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', 'This price list no longer exists.');
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // The id and dates belong to the server; a client that echoes them back is not refused for it.
  if (raw && typeof raw === 'object') for (const key of ['id', 'createdAt', 'updatedAt']) delete raw[key];
  const parsed = PriceListInputSchema.safeParse(raw);
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid price list', { issues: parsed.error.issues });
  const clash = await g.db.collection(PRICE_LISTS).get();
  if (clash.docs.some((d) => d.id !== id && String(d.get('name')).toLowerCase() === parsed.data.name.toLowerCase())) {
    return adminApiError(409, 'conflict', `A price list named “${parsed.data.name}” already exists. Pick another name.`);
  }
  const priceList = PriceListSchema.parse({ ...parsed.data, id, createdAt: (snap.data() as { createdAt?: string }).createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
  await ref.set(priceList);
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'price_list.update', resource: 'priceList', resourceId: id, details: { name: priceList.name, lines: priceList.rows.length } }).catch((error) =>
    logger.error('Failed to write audit log', { id, error: String(error) })
  );
  return NextResponse.json({ priceList });
}

export async function DELETE(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const { id } = await params;
  const ref = g.db.collection(PRICE_LISTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return adminApiError(404, 'not_found', 'This price list no longer exists.');
  await ref.delete();
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'price_list.delete', resource: 'priceList', resourceId: id, details: { name: String(snap.get('name') ?? '') } }).catch((error) =>
    logger.error('Failed to write audit log', { id, error: String(error) })
  );
  return NextResponse.json({ ok: true });
}
