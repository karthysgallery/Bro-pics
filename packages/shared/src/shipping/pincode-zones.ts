export type PincodeZone = 'metro' | 'standard' | 'remote';

export interface DeliveryEstimate {
  zone: PincodeZone;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

// [BE-21] India Post pincodes are 6 digits, first digit 1-8 (9 is reserved
// for army postal service, never a deliverable civilian address).
const VALID_PINCODE = /^[1-8][0-9]{5}$/;

// Matches the estimate ranges already published on the shipping-policy
// page (apps/web/app/(content)/shipping-policy/page.tsx): "metro
// addresses typically receive in 2-4 working days and other pincodes in
// 4-7. Remote pincodes can take longer." No real courier-zone data
// exists yet (a live courier/aggregator account, same external-account-
// blocked bucket as this pass's other logged gaps) — these are the
// 3-digit prefixes for major metros and known-remote regions, a coarse
// best-effort approximation to serve until real zone data replaces it.
// The site ships everywhere in India (per that same page), so every
// valid pincode is serviceable — this only ever affects WHICH estimate
// a pincode gets, never whether it can order at all.
const METRO_PREFIXES = new Set([
  '110', // Delhi
  '400', // Mumbai
  '560', // Bangalore
  '600', // Chennai
  '700', // Kolkata
  '500', // Hyderabad
  '501',
  '411', // Pune
  '380', // Ahmedabad
]);

const REMOTE_PREFIXES = new Set([
  '744', // Andaman & Nicobar Islands
  '682', // Lakshadweep (shares a prefix range with parts of Kerala — coarse)
  '191', '192', '193', '194', // Jammu & Kashmir / Ladakh
  '737', // Sikkim
  '791', '792', // Arunachal Pradesh
  '793', '794', // Meghalaya
  '795', // Manipur
  '796', // Mizoram
  '797', '798', // Nagaland
  '799', // Tripura
]);

const ESTIMATE_BY_ZONE: Record<PincodeZone, [number, number]> = {
  metro: [2, 4],
  standard: [4, 7],
  remote: [7, 12],
};

export function isValidIndianPincode(pincode: string): boolean {
  return VALID_PINCODE.test(pincode);
}

export function classifyPincodeZone(pincode: string): PincodeZone | null {
  if (!isValidIndianPincode(pincode)) return null;
  const prefix = pincode.slice(0, 3);
  if (METRO_PREFIXES.has(prefix)) return 'metro';
  if (REMOTE_PREFIXES.has(prefix)) return 'remote';
  return 'standard';
}

export function deliveryEstimateForPincode(pincode: string): DeliveryEstimate | null {
  const zone = classifyPincodeZone(pincode);
  if (!zone) return null;
  const [estimatedDaysMin, estimatedDaysMax] = ESTIMATE_BY_ZONE[zone];
  return { zone, estimatedDaysMin, estimatedDaysMax };
}
