import { describe, it, expect } from 'vitest';
import { htmlToText, textToHtml } from './rich-text';

describe('description text ⇄ HTML', () => {
  it('round-trips paragraphs, headings and bullets', () => {
    const html = '<p>Bring home this frame &amp; hang it.</p><h3>Sizes and frames</h3><ul><li>8x12 in</li><li>12x18 in</li></ul><p>Made by hand.</p>';
    const text = htmlToText(html);
    expect(text).toBe('Bring home this frame & hang it.\n\n## Sizes and frames\n\n- 8x12 in\n- 12x18 in\n\nMade by hand.');
    expect(textToHtml(text)).toBe(html);
  });
  it('never lets markup through from the text box', () => {
    expect(textToHtml('<script>x</script>')).toBe('<p>&lt;script&gt;x&lt;/script&gt;</p>');
  });
});
