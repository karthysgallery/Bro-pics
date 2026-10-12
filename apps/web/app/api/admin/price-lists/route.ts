import { NextResponse } from 'next/server';
import { PriceListInputSchema, PriceListSchema, logger } from '@bro-pics/shared';
import { catalogueGuard } from '../../../../lib/catalogue/guard';
import { PRICE_LISTS, listPriceLists, priceListIdFrom } from '../../../../lib/catalogue/price-lists';
import { adminApiError } from '../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../lib/audit-log';

/** Admin → Add many frames → price lists: the saved sizes and prices the owner reuses. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:read');
  if (!g.ok) return g.response;
  return NextResponse.json({ priceLists: await listPriceLists(g.db) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const g = await catalogueGuard(request, 'catalogue:write');
  if (!g.ok) return g.response;
  const parsed = PriceListInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid price list', { issues: parsed.error.issues });
  const existing = await g.db.collection(PRICE_LISTS).get();
  if (existing.docs.some((d) => String(d.get('name')).toLowerCase() === parsed.data.name.toLowerCase())) {
    return adminApiError(409, 'conflict', `A price list named “${parsed.data.name}” already exists. Pick another name, or edit that one.`);
  }
  const id = priceListIdFrom(parsed.data.name, new Set(existing.docs.map((d) => d.id)));
  const now = new Date().toISOString();
  const priceList = PriceListSchema.parse({ ...parsed.data, id, createdAt: now, updatedAt: now });
  await g.db.collection(PRICE_LISTS).doc(id).set(priceList);
  await writeAuditLog(g.db, { actorUid: g.uid, action: 'price_list.create', resource: 'priceList', resourceId: id, details: { name: priceList.name, lines: priceList.rows.length } }).catch((error) =>
    logger.error('Failed to write audit log', { id, error: String(error) })
  );
  return NextResponse.json({ priceList }, { status: 201 });
}
