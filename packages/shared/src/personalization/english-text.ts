/**
 * Customer wording on a personalised frame is English only (the owner's rule, 2026-11-18): the shop's print fonts
 * are Latin fonts, and the team cannot check wording in other scripts before printing.
 *
 * Allowed: English letters (and accented Latin letters, for names like "Zoë"), numbers, spaces, everyday
 * punctuation including the curly quotes and dashes phones type on their own ("Mom’s", "2019–2024"), and a few
 * common symbols (₹ © ® ™ ° ×). Anything else, Tamil script in particular, is refused with ENGLISH_ONLY_MESSAGE.
 * The text is never changed or cut: the customer sees the message and fixes it themselves.
 */
export const ENGLISH_ONLY_MESSAGE = 'Please use English letters only for personalized text.';

// Basic Latin + Latin-1 + Latin Extended-A/B (no control characters), General Punctuation, ₹ and friends, ™.
const ALLOWED = /^[ -~ -ɏ -⁯₠-⃏™\n]*$/u;

/** True when every character is allowed in customer wording (an empty string is fine). */
export function isEnglishText(value: string): boolean {
  return ALLOWED.test(value);
}

/** The characters that are not allowed, each once, in the order typed: for a message like `Remove: த, ம`. */
export function nonEnglishCharacters(value: string): string[] {
  const seen = new Set<string>();
  for (const ch of value) if (!ALLOWED.test(ch)) seen.add(ch);
  return [...seen];
}
