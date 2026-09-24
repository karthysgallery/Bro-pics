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

export function buildProductSearchFields(title: string, shortDesc: string): ProductSearchFields {
  return {
    titleLower: title.toLowerCase(),
    searchTokens: [
      ...new Set(
        `${title} ${shortDesc}`
          .toLowerCase()
          .split(/\s+/)
          .filter((token) => token.length > 2)
      ),
    ],
  };
}
