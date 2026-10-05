import { describe, it, expect } from 'vitest';
import { safeRedirectTarget } from './safe-redirect';

describe('safeRedirectTarget', () => {
  it('allows ordinary same-site paths, including query strings', () => {
    expect(safeRedirectTarget('/checkout')).toBe('/checkout');
    expect(safeRedirectTarget('/product/classic-wooden-frame?edit=abc')).toBe('/product/classic-wooden-frame?edit=abc');
    expect(safeRedirectTarget('/orders/123')).toBe('/orders/123');
  });

  it('falls back when there is nothing usable', () => {
    expect(safeRedirectTarget(null)).toBe('/account');
    expect(safeRedirectTarget(undefined)).toBe('/account');
    expect(safeRedirectTarget('')).toBe('/account');
    expect(safeRedirectTarget('/x'.repeat(200))).toBe('/account');
  });

  it('rejects absolute and scheme URLs (the open-redirect vector)', () => {
    for (const bad of ['https://evil.example', 'http://evil.example/login', 'javascript:alert(1)', 'data:text/html,hi', 'evil.example', 'ftp://x']) {
      expect(safeRedirectTarget(bad)).toBe('/account');
    }
  });

  it('rejects protocol-relative and backslash tricks browsers treat as another host', () => {
    for (const bad of ['//evil.example', '//evil.example/path', '/\\evil.example', '/\\/evil.example', '/ok\\..\\evil']) {
      expect(safeRedirectTarget(bad)).toBe('/account');
    }
  });

  it('rejects control characters (header-splitting / parser differentials)', () => {
    expect(safeRedirectTarget('/ok\n/evil')).toBe('/account');
    expect(safeRedirectTarget('/ok\u0000')).toBe('/account');
  });

  it('honours a custom fallback', () => {
    expect(safeRedirectTarget('https://evil.example', '/')).toBe('/');
  });
});
