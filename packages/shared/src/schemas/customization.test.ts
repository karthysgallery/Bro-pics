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
});
