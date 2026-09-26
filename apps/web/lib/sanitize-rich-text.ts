import sanitizeHtml from 'sanitize-html';

/**
 * [ABE-18] Applied server-side to every rich-text field (`Page.bodyHtml`,
 * `FaqItem.answerHtml`) before it's written to Firestore — staff-authored
 * HTML is still untrusted input rendered back to every site visitor.
 * Deliberately narrow allow-list: enough for editorial copy (paragraphs,
 * headings, lists, links, basic emphasis), nothing script-capable or
 * event-handler-bearing. `a` tags keep only `href`/`target`/`rel` so a
 * link can't carry an inline handler either.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'blockquote', 'span'];

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}
