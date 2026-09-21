import { describe, it, expect } from 'vitest';
import { FrameTemplateSchema } from './frame-template';

const validTemplate = {
  id: 'ft_1',
  variantId: 'var_classic_wooden_frame_8x12_black',
  mockupUrl: '/placeholders/mockups/classic-wooden-frame.png',
  maskUrl: null,
  overlayUrl: null,
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
  bleedMm: 2,
  matInset: 0,
  version: 1,
  isCurrent: true,
  textZones: [],
  clipartOptions: [],
};

describe('FrameTemplateSchema', () => {
  it('accepts a valid single-slot template', () => {
    expect(FrameTemplateSchema.parse(validTemplate)).toEqual(validTemplate);
  });

  it('accepts a multi-slot template with several printableRects', () => {
    const multiSlot = {
      ...validTemplate,
      id: 'ft_2',
      printableRects: [
        { slotIndex: 0, x: 0.05, y: 0.05, width: 0.4, height: 0.4 },
        { slotIndex: 1, x: 0.55, y: 0.05, width: 0.4, height: 0.4 },
      ],
    };
    expect(FrameTemplateSchema.parse(multiSlot)).toEqual(multiSlot);
  });

  it('accepts a template with maskUrl/overlayUrl set', () => {
    const withMask = { ...validTemplate, id: 'ft_3', maskUrl: '/mask.png', overlayUrl: '/overlay.png' };
    expect(FrameTemplateSchema.parse(withMask)).toEqual(withMask);
  });

  it('rejects an empty printableRects array', () => {
    const invalid = { ...validTemplate, printableRects: [] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });

  it('rejects a rect fraction greater than 1', () => {
    const invalid = { ...validTemplate, printableRects: [{ slotIndex: 0, x: 0, y: 0, width: 1.5, height: 0.5 }] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative slotIndex', () => {
    const invalid = { ...validTemplate, printableRects: [{ slotIndex: -1, x: 0, y: 0, width: 0.5, height: 0.5 }] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });

  it('accepts a template with text zones and clipart options', () => {
    const withExtras = {
      ...validTemplate,
      id: 'ft_4',
      textZones: [
        { fieldKey: 'name', label: 'Name', x: 0.08, y: 0.84, width: 0.84, height: 0.065, maxLength: 40, align: 'center' as const },
      ],
      clipartOptions: [
        { id: 'heart', label: 'Heart', assetUrl: '/clipart/heart.svg', x: 0.82, y: 0.06, width: 0.1, height: 0.1 },
      ],
    };
    expect(FrameTemplateSchema.parse(withExtras)).toEqual(withExtras);
  });

  it('rejects version 0 or negative', () => {
    expect(() => FrameTemplateSchema.parse({ ...validTemplate, version: 0 })).toThrow();
  });

  it('defaults textZones and clipartOptions to an empty array when omitted', () => {
    const { textZones, clipartOptions, ...withoutExtras } = validTemplate;
    expect(FrameTemplateSchema.parse(withoutExtras)).toEqual({ ...withoutExtras, textZones: [], clipartOptions: [] });
  });
});
