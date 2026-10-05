/**
 * Money units in this codebase: every stored/API amount is an integer number
 * of PAISE (₹799 === 79900). Admin forms, however, are typed in RUPEES. These
 * two helpers are the only places that conversion should happen, so a form can
 * never post "999" to an API that means 999 paise (= ₹9.99).
 */

/** Paise (integer) -> rupees for an input's value / editable state. */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Rupees as typed (number or string, decimals allowed) -> integer paise.
 * Returns null for anything that isn't a finite, non-negative amount, so
 * callers must handle "invalid" explicitly instead of sending NaN/negative.
 */
export function rupeesToPaise(rupees: number | string): number | null {
  const parsed = typeof rupees === 'string' ? Number(rupees.trim()) : rupees;
  if (typeof rupees === 'string' && rupees.trim() === '') return null;
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}
