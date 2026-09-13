import { describe, it, expect } from 'vitest';
import { OrderEventSchema } from './order-event';

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    status: 'shipped',
    note: null,
    courier: 'BlueDart',
    awbNumber: 'BD123456789',
    createdAt: '2026-09-05T00:00:00.000Z',
    createdBy: 'staff_uid_1',
    ...overrides,
  };
}

describe('OrderEventSchema', () => {
  it('accepts a full valid shipped event', () => {
    expect(OrderEventSchema.safeParse(baseEvent()).success).toBe(true);
  });

  it('accepts a non-shipped event with null courier/awbNumber/note', () => {
    const result = OrderEventSchema.safeParse(
      baseEvent({ status: 'in_production', courier: null, awbNumber: null })
    );
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status value', () => {
    expect(OrderEventSchema.safeParse(baseEvent({ status: 'shipped_out' })).success).toBe(false);
  });

  it('rejects a missing createdBy', () => {
    const { createdBy: _drop, ...rest } = baseEvent();
    expect(OrderEventSchema.safeParse(rest).success).toBe(false);
  });
});
