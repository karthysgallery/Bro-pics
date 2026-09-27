export interface CartLine {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
  // A Storage object path, never a signed URL — see Upload.originalPath in
  // packages/shared/src/schemas/upload.ts for why.
  previewPath?: string;
  // [FE-16] Lets the cart drawer link back to the product page to re-edit
  // this line's personalization — optional so every pre-existing CartLine
  // object literal in tests/seed data still typechecks; a line added
  // before this field existed just never gets an Edit link.
  productSlug?: string;
}

function lineKey(line: CartLine): string {
  return `${line.variantId}::${line.personalizationId}`;
}

/**
 * Merges two cart-line lists, summing qty for matching
 * (variantId, personalizationId) pairs. Used both when reconciling a local
 * cart into an existing Firestore cart at login (a returning user signing
 * in on a second device) and, potentially, by any future client-side merge
 * path. The incoming line's title/previewPath/unitPriceSnapshot win on a
 * match — incoming is always the more recently-added data.
 */
export function mergeCartItems(existing: CartLine[], incoming: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of existing) merged.set(lineKey(line), line);
  for (const line of incoming) {
    const current = merged.get(lineKey(line));
    merged.set(lineKey(line), current ? { ...line, qty: current.qty + line.qty } : line);
  }
  return [...merged.values()];
}
