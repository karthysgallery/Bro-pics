import type { CartCombo } from '../schemas/combo';

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
  // Structured personalization (template v2): which template version the design was made on and
  // the customer's state — asset IDS and transforms, never image bytes. The server re-verifies it
  // at checkout (lib/personalization-order.ts); here it is only what the cart remembers.
  personalization?: { templateId: string; templateVersion: number; state: unknown };
  // A Combo Offer is ONE parent line (variantId `combo:<comboId>`, qty 1, personalizationId = this
  // combo instance) that keeps every included frame's own variant, personalization and uploads. It
  // is expanded into ordinary per-frame order items on the server at checkout.
  combo?: CartCombo;
}

function lineKey(line: CartLine): string {
  return `${line.variantId}::${line.personalizationId}`;
}

/**
 * Merges two cart-line lists by (variantId, personalizationId). Used when
 * reconciling a local cart into the Firestore cart at sign-in.
 *
 * A personalizationId is minted once per Add to cart, so the same pair on
 * both sides is the SAME line copied (e.g. a browser's leftover copy of a
 * signed-in cart), never two separate purchases. Quantities are therefore
 * not added together — that turned 2 into 4 on every signed-in reload —
 * the larger one is kept. The incoming line's title/previewPath/
 * unitPriceSnapshot win, since incoming is the more recently-touched copy.
 */
export function mergeCartItems(existing: CartLine[], incoming: CartLine[]): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const line of existing) merged.set(lineKey(line), line);
  for (const line of incoming) {
    const current = merged.get(lineKey(line));
    merged.set(lineKey(line), current ? { ...line, qty: Math.max(current.qty, line.qty) } : line);
  }
  return [...merged.values()];
}
