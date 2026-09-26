import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  it('keeps allowed formatting tags', () => {
    expect(sanitizeRichText('<p>Hello <strong>world</strong></p>')).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('strips script tags entirely', () => {
    expect(sanitizeRichText('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>');
  });

  it('strips onerror and other event-handler attributes', () => {
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).not.toContain('onerror');
  });

  it('drops disallowed tags but keeps their text content', () => {
    expect(sanitizeRichText('<div>Hello</div>')).toBe('Hello');
  });

  it('keeps a safe link with href/target/rel, strips javascript: scheme', () => {
    expect(sanitizeRichText('<a href="https://example.com" target="_blank" rel="noopener">Link</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener">Link</a>'
    );
    expect(sanitizeRichText('<a href="javascript:alert(1)">Link</a>')).not.toContain('javascript:');
  });
});
