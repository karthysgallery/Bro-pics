import { describe, it, expect } from 'vitest';
import { FaqItemSchema } from './faq';

const validFaq = {
  id: 'faq_1',
  section: 'Orders',
  question: 'How do I track my order?',
  answerHtml: '<p>Use the order tracking page.</p>',
  sortOrder: 0,
  isActive: true,
};

describe('FaqItemSchema', () => {
  it('accepts a valid FAQ item', () => {
    expect(FaqItemSchema.parse(validFaq)).toEqual(validFaq);
  });

  it('rejects a negative sortOrder', () => {
    expect(() => FaqItemSchema.parse({ ...validFaq, sortOrder: -1 })).toThrow();
  });

  it('rejects a missing question', () => {
    const { question: _question, ...rest } = validFaq;
    expect(() => FaqItemSchema.parse(rest)).toThrow();
  });
});
