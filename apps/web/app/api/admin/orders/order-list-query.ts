import { z } from 'zod';

/**
 * [ABE-15] `status` and `q` (phone/email search) are mutually exclusive —
 * combining either as an equality filter WITH a date range needs only the
 * existing (status+placedAt) or (userId+placedAt) composite index
 * (Firestore serves a composite index in reverse traversal order too, so
 * DESC works off the existing ASC-defined indexes), but combining BOTH
 * equality filters together would need a (status+userId+placedAt)
 * composite that doesn't exist and this environment can't deploy — same
 * "can't add a new Firestore index" constraint logged repeatedly this
 * session. `paymentStatus` isn't supported as a filter at all for the
 * same reason: no (paymentStatus+placedAt) composite exists.
 */
export const OrderListQuerySchema = z
  .object({
    status: z.string().optional(),
    q: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).default(25),
  })
  .refine((v) => !(v.status && v.q), { message: 'status and q cannot both be given (see the module doc comment)' });

export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

export interface OrderCursor {
  placedAt: Date;
  id: string;
}

export function encodeOrderCursor(placedAt: Date, id: string): string {
  return `${placedAt.toISOString()}_${id}`;
}

export function decodeOrderCursor(raw: string): OrderCursor | null {
  // First '_', not last — an ISO timestamp never contains one, but a
  // Firestore auto-id CAN, so splitting on the last occurrence would cut
  // the id in half for those.
  const separatorIndex = raw.indexOf('_');
  if (separatorIndex === -1) return null;
  const isoPart = raw.slice(0, separatorIndex);
  const id = raw.slice(separatorIndex + 1);
  const placedAt = new Date(isoPart);
  if (Number.isNaN(placedAt.getTime()) || !id) return null;
  return { placedAt, id };
}
