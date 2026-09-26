import { describe, it, expect } from 'vitest';
import { CustomizationSchema } from './customization';

function baseCustomization(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', sessionId: 'sess_1', personalizationId: 'p1', uploadId: 'up_1',
    variantId: 'v1', slotIndex: 0,
    transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
    effectiveDpi: 300, renderStatus: 'done', templateVersion: 1,
    ...overrides,
  };
}

describe('CustomizationSchema', () => {
  it('accepts a customization with no userId (pre-login)', () => {
    expect(CustomizationSchema.safeParse(baseCustomization()).success).toBe(true);
  });

  it('accepts a customization with userId set (post-reconciliation)', () => {
    expect(CustomizationSchema.safeParse(baseCustomization({ userId: 'user_1' })).success).toBe(true);
  });

  it.each([0, 90, 180, 270])('accepts a valid rotationDeg of %i', (rotationDeg) => {
    const result = CustomizationSchema.safeParse(
      baseCustomization({
        transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects an invalid rotationDeg like 45', () => {
    const result = CustomizationSchema.safeParse(
      baseCustomization({
        transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 45, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
      })
    );
    expect(result.success).toBe(false);
  });

  it('rejects a missing sessionId', () => {
    const { sessionId: _sessionId, ...rest } = baseCustomization();
    const result = CustomizationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a missing personalizationId', () => {
    const { personalizationId: _personalizationId, ...rest } = baseCustomization();
    const result = CustomizationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts a valid customization with textFieldsJson populated', () => {
    const result = CustomizationSchema.safeParse(
      baseCustomization({
        textFieldsJson: {
          line1: { value: 'Happy Birthday', fontFamily: 'serif', color: '#000000' },
          line2: { value: 'From Bro', fontFamily: 'serif', color: '#000000' },
        },
      })
    );
    expect(result.success).toBe(true);
  });

  it('rejects textFieldsJson with a plain string value (pre-upgrade shape)', () => {
    const result = CustomizationSchema.safeParse(baseCustomization({ textFieldsJson: { line1: 'Happy Birthday' } }));
    expect(result.success).toBe(false);
  });

  it('accepts an optional clipartId', () => {
    const result = CustomizationSchema.safeParse(baseCustomization({ clipartId: 'heart' }));
    expect(result.success).toBe(true);
  });

  it('rejects a missing templateVersion', () => {
    const { templateVersion: _templateVersion, ...rest } = baseCustomization();
    const result = CustomizationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('accepts an optional renderedFilePath', () => {
    const result = CustomizationSchema.safeParse(
      baseCustomization({ renderedFilePath: 'print-files/order_1/item_1/print.png' })
    );
    expect(result.success).toBe(true);
  });

  it('defaults schemaVersion to 1 and status to draft for a v1 doc missing both fields', () => {
    const result = CustomizationSchema.safeParse(baseCustomization());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schemaVersion).toBe(1);
      expect(result.data.status).toBe('draft');
    }
  });

  it('accepts a v2 doc with schemaVersion, dpiBand, status and lockedAt all set', () => {
    const result = CustomizationSchema.safeParse(
      baseCustomization({ schemaVersion: 2, dpiBand: 'red', redConfirmedAt: new Date(), status: 'locked', lockedAt: new Date() })
    );
    expect(result.success).toBe(true);
  });

  it('rejects an invalid dpiBand value', () => {
    const result = CustomizationSchema.safeParse(baseCustomization({ dpiBand: 'yellow' }));
    expect(result.success).toBe(false);
  });

  it('rejects an invalid status value', () => {
    const result = CustomizationSchema.safeParse(baseCustomization({ status: 'in_cart' }));
    expect(result.success).toBe(false);
  });
});
