/**
 * [ABE-04] The exact tokenizer scripts/seed/src/data.ts has used inline
 * since the catalogue was first seeded — extracted here so the admin
 * product write API (ABE-04) computes `titleLower`/`searchTokens`
 * identically instead of drifting from what search (build-query-plan.ts's
 * array-contains-any over searchTokens) actually expects. seed/src/data.ts
 * itself is left as-is (a one-off script, not worth touching for this).
 */
export interface ProductSearchFields {
  titleLower: string;
  searchTokens: string[];
}

/**
 * Words a shopper can search by: lowercased, split on anything that is not a
 * letter or digit (so "Vijay," and "vijay" match), at least 2 characters,
 * without filler words.
 * Shared by the product write path and the search query, so both sides agree.
 * Letters of any script are kept (Tamil, Hindi…).
 */
const FILLER = new Set(['of', 'to', 'in', 'on', 'at', 'by', 'an', 'is', 'it', 'or', 'as', 'be', 'we', 'my', 'the', 'and', 'for', 'with', 'you', 'your', 'our']);

export function searchWordsOf(text: string): string[] {
  // Two-letter words count ("cm", "tv"); filler words ("of", "the") never do.
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter((token) => token.length >= 2 && !FILLER.has(token)))];
}

/**
 * `extra`: other words the product should be found by that are not in its
 * name or description — what the picture shows ("Vijay"), its search phrase,
 * its product code.
 */
export function buildProductSearchFields(title: string, shortDesc: string, keywords: readonly string[] = [], extra: readonly string[] = []): ProductSearchFields {
  return {
    titleLower: title.toLowerCase(),
    searchTokens: searchWordsOf(`${title} ${shortDesc} ${keywords.join(' ')} ${extra.join(' ')}`),
  };
}
