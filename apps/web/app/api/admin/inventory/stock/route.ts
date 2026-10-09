import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { BillingError } from '@bro-pics/shared';
import { applyStock, readStock, variantRef } from '@bro-pics/shared/src/inventory/stock';
import { getAdminApp } from '../../../../../lib/firebase-admin';
import { requirePermission } from '../../../../../lib/require-permission';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { adminApiError } from '../../../../../lib/admin-api-error';
import { writeAuditLog } from '../../../../../lib/audit-log';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const BodySchema = z.discriminatedUnion('action', [
  /** Start counting this variant, with the units on hand now. */
  z.object({ action: z.literal('track'), productId: id, variantId: id, qty: z.number().int().min(0).max(100000), note: z.string().max(200).optional() }),
  /** Back to made to order (unlimited). */
  z.object({ action: z.literal('untrack'), productId: id, variantId: id, note: z.string().max(200).optional() }),
  /** New units arrived. */
  z.object({ action: z.literal('restock'), productId: id, variantId: id, qty: z.number().int().min(1).max(100000), note: z.string().max(200).optional() }),
  /** A counted correction (damage, a recount): the new number on hand. */
  z.object({ action: z.literal('set'), productId: id, variantId: id, qty: z.number().int().min(0).max(100000), note: z.string().min(1, 'Say why the count changed').max(200) }),
]);

/**
 * POST /api/admin/inventory/stock — every staff stock change, through the
 * same shared stock module online orders and the POS use, with a movement
 * record (RESTOCK / MANUAL_ADJUSTMENT) and an audit-log entry.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkRateLimit(request, 'staff');
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many requests, please try again shortly' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } });
  const permission = await requirePermission(request, 'inventory:write');
  if (!permission.ok) return adminApiError(permission.status, permission.status === 401 ? 'unauthenticated' : 'forbidden', 'Inventory access required');
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return adminApiError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request');
  const body = parsed.data;
  const db = getFirestore(getAdminApp());
  const line = { productId: body.productId, variantId: body.variantId };

  try {
    const result = await db.runTransaction(async (tx) => {
      const reads = await readStock(tx, db, [line]);
      const snap = reads.get(`${line.productId}/${line.variantId}`)!;
      const ref = { type: 'adjustment' as const, id: `${permission.uid}:${Date.now()}` };
      const note = 'note' in body && body.note ? body.note : null;
      if (body.action === 'track') {
        if (snap.tracked) throw new BillingError('invalid', 'This size is already counted.');
        snap.tracked = true;
        snap.qty = 0;
        tx.update(variantRef(db, line), { trackStock: true, stockQty: 0 });
        applyStock(tx, db, reads, [{ ...line, delta: body.qty }], { reason: 'MANUAL_ADJUSTMENT', ref, by: permission.uid, note: note ?? 'Started counting stock' });
        if (body.qty === 0) tx.update(variantRef(db, line), { stockStatus: 'out_of_stock' });
        return { trackStock: true, stockQty: body.qty };
      }
      if (body.action === 'untrack') {
        tx.update(variantRef(db, line), { trackStock: false, stockStatus: 'in_stock' });
        return { trackStock: false, stockQty: snap.qty };
      }
      if (!snap.tracked) throw new BillingError('invalid', 'Turn on stock counting for this size first.');
      const delta = body.action === 'restock' ? body.qty : body.qty - snap.qty;
      applyStock(tx, db, reads, [{ ...line, delta }], { reason: body.action === 'restock' ? 'RESTOCK' : 'MANUAL_ADJUSTMENT', ref, by: permission.uid, note });
      return { trackStock: true, stockQty: snap.qty };
    });
    await writeAuditLog(db, { actorUid: permission.uid, action: `inventory.${body.action}`, resource: 'variant', resourceId: `${body.productId}/${body.variantId}`, details: { ...body, result } }).catch(() => undefined);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof BillingError) return adminApiError(409, 'conflict', err.message);
    throw err;
  }
}
