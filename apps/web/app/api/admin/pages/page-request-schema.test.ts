import { describe, it, expect } from 'vitest';
import { CreatePageBodySchema, UpdatePageBodySchema } from './page-request-schema';

describe('CreatePageBodySchema', () => {
  it('accepts a minimal body and fills in defaults', () => {
    const result = CreatePageBodySchema.parse({ slug: 'about', title: 'About Us' });
    expect(result).toMatchObject({ slug: 'about', title: 'About Us', bodyHtml: '', isPublished: false, seo: {} });
  });

  it('rejects an unknown field', () => {
    expect(CreatePageBodySchema.safeParse({ slug: 'about', title: 'x', notAField: 1 }).success).toBe(false);
  });

  it('rejects a missing slug', () => {
    expect(CreatePageBodySchema.safeParse({ title: 'x' }).success).toBe(false);
  });
});

describe('UpdatePageBodySchema', () => {
  it('accepts a partial body', () => {
    expect(UpdatePageBodySchema.parse({ title: 'New Title' })).toEqual({ title: 'New Title' });
  });

  it('rejects an unknown field via strict()', () => {
    expect(UpdatePageBodySchema.safeParse({ notAField: 1 }).success).toBe(false);
  });
});
