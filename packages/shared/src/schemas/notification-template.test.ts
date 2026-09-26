import { describe, it, expect } from 'vitest';
import { NotificationTemplateSchema } from './notification-template';

const validTemplate = {
  key: 'order.paid',
  subject: 'Your order {{orderNo}} is confirmed',
  body: 'Hi {{customerName}}, order {{orderNo}} has been confirmed.',
  variables: ['orderNo', 'customerName'],
  updatedAt: new Date('2026-09-01'),
  updatedBy: 'staff_1',
};

describe('NotificationTemplateSchema', () => {
  it('accepts a valid template', () => {
    expect(NotificationTemplateSchema.parse(validTemplate)).toEqual(validTemplate);
  });

  it('accepts an empty variables array', () => {
    expect(NotificationTemplateSchema.parse({ ...validTemplate, variables: [] }).variables).toEqual([]);
  });

  it('accepts a null updatedBy', () => {
    expect(NotificationTemplateSchema.parse({ ...validTemplate, updatedBy: null }).updatedBy).toBeNull();
  });

  it('rejects a missing key', () => {
    const { key: _key, ...rest } = validTemplate;
    expect(() => NotificationTemplateSchema.parse(rest)).toThrow();
  });

  it('rejects an empty subject', () => {
    expect(() => NotificationTemplateSchema.parse({ ...validTemplate, subject: '' })).toThrow();
  });
});
