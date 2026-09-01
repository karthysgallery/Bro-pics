import { describe, it, expect } from 'vitest';
import { CustomizationSchema } from './customization';

const validCustomization = {
  id: 'cust_1',
  sessionId: 'sess_abc123',
  personalizationId: 'pers_xyz789',
  uploadId: 'up_1',
  variantId: 'var_classic_wooden_frame_8x12_black',
  slotIndex: 0,
  transformJson: {
    scale: 1.2,
    offsetX: 10,
    offsetY: -5,
    rotationDeg: 90 as const,
    cropRect: { x: 0, y: 0, width: 1200, height: 1800 },
  },
  textFieldsJson: undefined,
  effectiveDpi: 280,
  previewUrl: undefined,
  renderStatus: 'pending' as const,
};

describe('CustomizationSchema', () => {
  it('accepts a valid customization', () => {
    expect(CustomizationSchema.parse(validCustomization)).toEqual(validCustomization);
  });

  it('accepts each valid rotationDeg value', () => {
    for (const rotationDeg of [0, 90, 180, 270] as const) {
      const withRotation = { ...validCustomization, transformJson: { ...validCustomization.transformJson, rotationDeg } };
      expect(() => CustomizationSchema.parse(withRotation)).not.toThrow();
    }
  });

  it('rejects a rotationDeg outside the 90-degree-snap set', () => {
    const invalid = { ...validCustomization, transformJson: { ...validCustomization.transformJson, rotationDeg: 45 } };
    expect(() => CustomizationSchema.parse(invalid)).toThrow();
  });

  it('rejects a missing sessionId', () => {
    const { sessionId, ...withoutSessionId } = validCustomization;
    expect(() => CustomizationSchema.parse(withoutSessionId)).toThrow();
  });

  it('rejects a missing personalizationId', () => {
    const { personalizationId, ...withoutPersonalizationId } = validCustomization;
    expect(() => CustomizationSchema.parse(withoutPersonalizationId)).toThrow();
  });

  it('accepts an optional textFieldsJson when present', () => {
    const withText = { ...validCustomization, textFieldsJson: { name: 'Happy Birthday' } };
    expect(CustomizationSchema.parse(withText)).toEqual(withText);
  });
});
