import { describe, it, expect } from 'vitest';
import { CreateFaqBodySchema, UpdateFaqBodySchema, ReorderFaqsBodySchema } from './faq-request-schema';

describe('CreateFaqBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreateFaqBodySchema.parse({ section: 'Orders', question: 'How do I track my order?', answerHtml: '<p>x</p>' });
    expect(result).toMatchObject({ sortOrder: 0, isActive: true });
  });

  it('rejects an unknown field', () => {
    expect(CreateFaqBodySchema.safeParse({ section: 'Orders', question: 'q', answerHtml: 'a', notAField: 1 }).success).toBe(false);
  });

  it('rejects an empty question', () => {
    expect(CreateFaqBodySchema.safeParse({ section: 'Orders', question: '', answerHtml: 'a' }).success).toBe(false);
  });
});

describe('UpdateFaqBodySchema', () => {
  it('accepts a partial body', () => {
    expect(UpdateFaqBodySchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe('ReorderFaqsBodySchema', () => {
  it('rejects an empty array', () => {
    expect(ReorderFaqsBodySchema.safeParse({ orderedIds: [] }).success).toBe(false);
  });
});
