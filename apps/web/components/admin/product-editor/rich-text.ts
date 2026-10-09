/**
 * The product description is stored as simple HTML but edited as plain text:
 *   a blank line starts a new paragraph, "## " starts a heading, "- " a bullet.
 * Only these tags are produced, so the shop page never gets stray markup.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export function textToHtml(text: string): string {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.every((l) => /^[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      if (lines.length === 1 && /^#{2,3}\s+/.test(lines[0]!)) return `<h3>${esc(lines[0]!.replace(/^#{2,3}\s+/, ''))}</h3>`;
      return `<p>${esc(lines.join(' '))}</p>`;
    })
    .join('');
}

export function htmlToText(html: string): string {
  if (!html.trim()) return '';
  return unesc(
    html
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t: string) => `\n\n## ${t.replace(/<[^>]+>/g, '').trim()}\n\n`)
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t: string) => `\n- ${t.replace(/<[^>]+>/g, '').trim()}`)
      .replace(/<\/(ul|ol)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
