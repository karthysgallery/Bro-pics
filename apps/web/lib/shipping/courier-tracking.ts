/** A courier saved in Admin → Delivery → Courier partners (Firestore `couriers`). */
export interface SavedCourier {
  name?: string;
  code?: string;
  trackingUrlTemplate?: string;
  isActive?: boolean;
}

const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The customer's tracking link for an AWB, from the saved courier whose name or code matches what staff typed.
 * Only an active courier with an https template containing {awb} is used; the AWB is URL-encoded. Null otherwise
 * (the order is still shipped; the customer just sees the courier and AWB without a link).
 */
export function trackingUrlFromCouriers(couriers: SavedCourier[], courier: string, awb: string): string | null {
  const wanted = norm(courier);
  if (!wanted || !awb.trim()) return null;
  const match = couriers.find((c) => c.isActive !== false && (norm(c.name) === wanted || norm(c.code) === wanted));
  const template = match?.trackingUrlTemplate?.trim();
  if (!template || !template.includes('{awb}')) return null;
  const url = template.split('{awb}').join(encodeURIComponent(awb.trim()));
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
