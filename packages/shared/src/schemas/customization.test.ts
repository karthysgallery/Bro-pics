import { describe, it, expect } from 'vitest';
import { CustomizationSchema } from './customization';

function baseCustomization(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', sessionId: 'sess_1', personalizationId: 'p1', uploadId: 'up_1',
    variantId: 'v1', slotIndex: 0,
    transformJson: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, cropRect: { x: 0, y: 0, width: 100, height: 100 } },
    effectiveDpi: 300, renderStatus: 'done',
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
      baseCustomization({ textFieldsJson: { line1: 'Happy Birthday', line2: 'From Bro' } })
    );
    expect(result.success).toBe(true);
  });
});
