import { describe, expect, it } from 'vitest';
import { checkCompleteness } from './completeness';
import { PersonalizationTemplateSchema } from './template-schema';
import { PersonalizationStateSchema } from './state';
import { isValidStatusTransition } from '../orders/status-transitions';

const template = PersonalizationTemplateSchema.parse({
  id: 't', version: 1, status: 'published', type: 'collage', name: 'Two photos',
  canvas: { width: 2400, height: 3600, dpi: 300 },
  photoSlots: [
    { id: 'p1', label: 'Photo 1', required: true, x: 0, y: 0, width: 0.5, height: 0.5 },
    { id: 'p2', label: 'Photo 2', required: true, x: 0.5, y: 0, width: 0.5, height: 0.5 },
  ],
  textSlots: [{ id: 'name', label: 'Name', required: true, x: 0, y: 0.6, width: 1, height: 0.1, maxLength: 20, defaultValue: '' }],
  layers: [{ kind: 'photoSlot', slotId: 'p1' }, { kind: 'photoSlot', slotId: 'p2' }, { kind: 'text', slotId: 'name' }],
});

describe('ordering now and sending photos on WhatsApp', () => {
  it('a design without photos can be bought only when the customer chose WhatsApp', () => {
    const base = { templateId: 't', templateVersion: 1, slots: {}, texts: { name: { value: 'Asha' } } };
    expect(checkCompleteness(template, PersonalizationStateSchema.parse(base)).complete).toBe(false);
    expect(checkCompleteness(template, PersonalizationStateSchema.parse({ ...base, photosVia: 'whatsapp' })).complete).toBe(true);
  });

  it('still needs the required text', () => {
    const state = PersonalizationStateSchema.parse({ templateId: 't', templateVersion: 1, slots: {}, texts: {}, photosVia: 'whatsapp' });
    const result = checkCompleteness(template, state);
    expect(result.complete).toBe(false);
    expect(result.blockers).toEqual(['Enter “Name”.']);
  });

  it('a held order can go straight to production once the team has the photos', () => {
    expect(isValidStatusTransition('photo_validation', 'in_production')).toBe(true);
  });
});
