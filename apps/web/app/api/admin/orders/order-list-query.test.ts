import { describe, it, expect } from 'vitest';
import { OrderListQuerySchema, encodeOrderCursor, decodeOrderCursor } from './order-list-query';

describe('OrderListQuerySchema', () => {
  it('defaults limit to 25 when omitted', () => {
    expect(OrderListQuerySchema.parse({}).limit).toBe(25);
  });

  it('rejects a limit over 100', () => {
    expect(OrderListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects status and q given together', () => {
    const result = OrderListQuerySchema.safeParse({ status: 'paid', q: 'user@example.com' });
    expect(result.success).toBe(false);
  });

  it('accepts status alone', () => {
    expect(OrderListQuerySchema.safeParse({ status: 'paid' }).success).toBe(true);
  });

  it('accepts q alone', () => {
    expect(OrderListQuerySchema.safeParse({ q: '+911234567890' }).success).toBe(true);
  });

  it('rejects a non-ISO from/to date', () => {
    expect(OrderListQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
  });
});

describe('encodeOrderCursor / decodeOrderCursor', () => {
  it('round-trips a placedAt/id pair', () => {
    const placedAt = new Date('2026-09-01T12:00:00.000Z');
    const encoded = encodeOrderCursor(placedAt, 'order_1');
    const decoded = decodeOrderCursor(encoded);
    expect(decoded).toEqual({ placedAt, id: 'order_1' });
  });

  it('returns null for a malformed cursor', () => {
    expect(decodeOrderCursor('not-a-cursor')).toBeNull();
    expect(decodeOrderCursor('garbage-date_order_1')).toBeNull();
  });
});
