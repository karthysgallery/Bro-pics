import { Timestamp } from 'firebase-admin/firestore';

/**
 * Recursively converts all Firestore `Timestamp` and `Date` instances in a
 * document to ISO-8601 strings so the result is safe to pass from a React
 * Server Component to a Client Component (RSC only allows plain objects,
 * arrays, and JSON-primitive values at the boundary).
 *
 * Handles nested objects and arrays.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeDoc<T>(doc: T): T {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof Timestamp) return doc.toDate().toISOString() as unknown as T;
  if (doc instanceof Date) return doc.toISOString() as unknown as T;
  if (Array.isArray(doc)) return doc.map(serializeDoc) as unknown as T;
  if (typeof doc === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      result[key] = serializeDoc(value);
    }
    return result as T;
  }
  return doc;
}
