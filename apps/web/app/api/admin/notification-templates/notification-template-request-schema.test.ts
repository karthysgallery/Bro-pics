import { describe, it, expect } from 'vitest';
import { CreateNotificationTemplateBodySchema, UpdateNotificationTemplateBodySchema, PreviewNotificationTemplateBodySchema } from './notification-template-request-schema';

describe('CreateNotificationTemplateBodySchema', () => {
  it('accepts a minimal body and defaults variables to []', () => {
    const result = CreateNotificationTemplateBodySchema.parse({ key: 'order.paid', subject: 'Order confirmed', body: 'Thanks!' });
    expect(result.variables).toEqual([]);
  });

  it('rejects an unknown field', () => {
    expect(CreateNotificationTemplateBodySchema.safeParse({ key: 'k', subject: 's', body: 'b', notAField: 1 }).success).toBe(false);
  });

  it('rejects a missing key', () => {
    expect(CreateNotificationTemplateBodySchema.safeParse({ subject: 's', body: 'b' }).success).toBe(false);
  });
});

describe('UpdateNotificationTemplateBodySchema', () => {
  it('accepts a partial body without key', () => {
    expect(UpdateNotificationTemplateBodySchema.parse({ subject: 'New subject' })).toEqual({ subject: 'New subject' });
  });

  it('rejects a key field (immutable, the doc id)', () => {
    expect(UpdateNotificationTemplateBodySchema.safeParse({ key: 'new.key' }).success).toBe(false);
  });
});

describe('PreviewNotificationTemplateBodySchema', () => {
  it('accepts an empty body, defaulting values to {}', () => {
    expect(PreviewNotificationTemplateBodySchema.parse({}).values).toEqual({});
  });

  it('accepts a values map', () => {
    expect(PreviewNotificationTemplateBodySchema.parse({ values: { orderNo: 'BP-1' } }).values).toEqual({ orderNo: 'BP-1' });
  });
});
