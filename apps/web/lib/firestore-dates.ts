/**
 * Firestore returns a stored date as a Timestamp object, not a JavaScript Date. The shared schemas expect real Dates,
 * so a document read straight from Firestore has to have its top-level Timestamps converted before it is parsed.
 */
export function withDates<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value && typeof (value as { toDate?: unknown }).toDate === 'function' ? (value as { toDate: () => Date }).toDate() : value;
  }
  return out as T;
}
