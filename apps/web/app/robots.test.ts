import { describe, it, expect } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('disallows admin, staff, checkout, orders, and api routes', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(['/admin', '/staff', '/checkout', '/orders', '/api'])
    );
  });

  it('references the sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com'}/sitemap.xml`);
  });
});
