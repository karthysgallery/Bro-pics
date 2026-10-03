import { describe, it, expect } from 'vitest';
import { fitTextToZone, wordWrap } from './text-fitting';

// A simple proportional-width measurement mock: each character is roughly
// 0.6 × fontSize wide (a reasonable sans-serif average). This is close
// enough that the shrink/wrap logic exercises the real code paths.
function mockMeasure(text: string, fontSizePx: number): number {
  return text.length * fontSizePx * 0.6;
}

describe('fitTextToZone', () => {
  it('returns maxFontSizePx when text fits comfortably', () => {
    const result = fitTextToZone({
      text: 'Hi',
      zoneWidthPx: 200,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    expect(result.fontSizePx).toBe(32);
    expect(result.lines).toEqual(['Hi']);
    expect(result.wasShrunk).toBe(false);
  });

  it('shrinks font size to fit long text within zone width', () => {
    const result = fitTextToZone({
      text: 'This is a really long text that needs shrinking',
      zoneWidthPx: 200,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    expect(result.fontSizePx).toBeLessThan(32);
    expect(result.fontSizePx).toBeGreaterThanOrEqual(8);
    expect(result.wasShrunk).toBe(true);
  });

  it('word-wraps at minFontSizePx when text still overflows at floor', () => {
    const result = fitTextToZone({
      text: 'An extremely long text string that absolutely cannot fit on a single line even at minimum',
      zoneWidthPx: 100,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    expect(result.fontSizePx).toBe(8);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.wasShrunk).toBe(true);
  });

  it('returns empty lines for empty/whitespace-only text', () => {
    const result = fitTextToZone({
      text: '   ',
      zoneWidthPx: 200,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    expect(result.lines).toEqual([]);
  });

  it('caps starting font size to zone height', () => {
    const result = fitTextToZone({
      text: 'Hi',
      zoneWidthPx: 200,
      zoneHeightPx: 16, // smaller than maxFontSizePx
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    expect(result.fontSizePx).toBeLessThanOrEqual(16);
  });

  it('handles special XML characters safely (they are just text)', () => {
    const result = fitTextToZone({
      text: '<script>alert("xss")</script> & "quotes"',
      zoneWidthPx: 400,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    // Should not crash — fitting is purely about measurement
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
    expect(result.lines.join(' ')).toContain('<script>');
  });

  it('handles single long word without crashing', () => {
    const result = fitTextToZone({
      text: 'Supercalifragilisticexpialidocious',
      zoneWidthPx: 80,
      zoneHeightPx: 40,
      minFontSizePx: 8,
      maxFontSizePx: 32,
      measureTextWidth: mockMeasure,
    });
    // Single word can't be split — it gets its own line
    expect(result.lines).toEqual(['Supercalifragilisticexpialidocious']);
    expect(result.fontSizePx).toBe(8);
  });
});

describe('wordWrap', () => {
  const measure = (text: string) => text.length * 8 * 0.6;

  it('keeps short text on one line', () => {
    expect(wordWrap('Hello', 100, measure)).toEqual(['Hello']);
  });

  it('wraps on word boundaries', () => {
    const lines = wordWrap('Hello World Test', 60, measure);
    expect(lines.length).toBeGreaterThan(1);
    // Every line should contain complete words
    for (const line of lines) {
      expect(line).not.toMatch(/^\s/);
      expect(line).not.toMatch(/\s$/);
    }
  });

  it('returns empty array for empty text', () => {
    expect(wordWrap('', 100, measure)).toEqual([]);
  });

  it('returns empty array for whitespace-only text', () => {
    expect(wordWrap('   ', 100, measure)).toEqual([]);
  });

  it('does not break a single word wider than max', () => {
    const lines = wordWrap('Pneumonoultramicroscopicsilicovolcanoconiosis', 50, measure);
    expect(lines).toEqual(['Pneumonoultramicroscopicsilicovolcanoconiosis']);
  });
});
