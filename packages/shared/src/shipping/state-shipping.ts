import { isValidIndianPincode } from './pincode-zones';

/**
 * State-wise shipping. The owner's confirmed policy:
 *   - Tamil Nadu: shipping is FREE.
 *   - Every other state or union territory: a charge the owner sets per state.
 *   - A state with no charge set is NEVER treated as free: checkout is blocked
 *     (or an optional "other states" fallback charge is used, if the owner set one).
 *
 * This is a pure function. The server calls it with the delivery address it read
 * from the database itself, so a browser can never choose its own shipping price.
 */

/** States and union territories, as customers pick them. */
export const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export type IndianState = (typeof INDIAN_STATES_AND_UTS)[number];

export const HOME_STATE: IndianState = 'Tamil Nadu';

/** Old spellings customers (and older saved addresses) use. */
const STATE_ALIASES: Record<string, IndianState> = {
  tamilnadu: 'Tamil Nadu',
  'tamil nadu': 'Tamil Nadu',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  'jammu & kashmir': 'Jammu and Kashmir',
  'jammu and kashmir': 'Jammu and Kashmir',
  uttaranchal: 'Uttarakhand',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra & nagar haveli and daman & diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
};

/** Maps free text to one canonical state/UT name, or null when it is not one. */
export function normalizeStateName(raw: unknown): IndianState | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key) return null;
  const canonical = INDIAN_STATES_AND_UTS.find((s) => s.toLowerCase() === key);
  return canonical ?? STATE_ALIASES[key] ?? null;
}

/**
 * Which state(s) a PIN code can belong to, from the first two digits of the PIN
 * (India Post's sorting-district structure). Deliberately GENEROUS where states
 * share a range (union territories, enclaves), because wrongly rejecting a real
 * customer costs a sale; it is only used to stop an address whose state and PIN
 * obviously disagree (for example a Kerala PIN saved as Tamil Nadu to get free
 * shipping). Returns null for a prefix that is not a civilian delivery range.
 */
const PREFIX_STATES: Array<[number, number, IndianState[]]> = [
  [11, 11, ['Delhi']],
  [12, 13, ['Haryana', 'Delhi']],
  [14, 15, ['Punjab']],
  [16, 16, ['Punjab', 'Chandigarh', 'Haryana']],
  [17, 17, ['Himachal Pradesh']],
  [18, 19, ['Jammu and Kashmir', 'Ladakh']],
  [20, 28, ['Uttar Pradesh', 'Uttarakhand', 'Delhi']],
  [30, 34, ['Rajasthan']],
  [36, 39, ['Gujarat', 'Dadra and Nagar Haveli and Daman and Diu']],
  [40, 44, ['Maharashtra', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu']],
  [45, 48, ['Madhya Pradesh']],
  [49, 49, ['Chhattisgarh']],
  [50, 53, ['Telangana', 'Andhra Pradesh']],
  [56, 59, ['Karnataka']],
  [60, 64, ['Tamil Nadu']],
  [67, 69, ['Kerala', 'Lakshadweep']],
  [70, 74, ['West Bengal', 'Sikkim', 'Andaman and Nicobar Islands']],
  [75, 77, ['Odisha']],
  [78, 78, ['Assam']],
  [79, 79, ['Arunachal Pradesh', 'Meghalaya', 'Mizoram', 'Manipur', 'Nagaland', 'Tripura']],
  [80, 85, ['Bihar', 'Jharkhand']],
];

/**
 * Puducherry is four separate pieces of land inside other states' PIN ranges: Puducherry town and Karaikal
 * (Tamil Nadu ranges), Yanam (Andhra Pradesh) and Mahe (Kerala). Only these three-digit prefixes can belong to it,
 * so a Puducherry address with, say, a Chennai PIN is a mismatch, while a Tamil Nadu address with one of the
 * 605/607/609 prefixes cannot be told apart from Puducherry by prefix alone ("ambiguous", see below).
 * The prefix list comes from public knowledge of India Post's structure and is NOT checked against the official
 * PIN directory; the directory check in `resolveShipping` is the authoritative one.
 */
const PUDUCHERRY_PREFIXES = ['605', '607', '609', '533', '673'];
/** Prefixes where a Tamil Nadu address might really be in Puducherry (the two share these ranges). */
const TN_PUDUCHERRY_SHARED_PREFIXES = ['605', '607', '609'];

export function plausibleStatesForPincode(pincode: string): IndianState[] | null {
  if (!isValidIndianPincode(pincode)) return null;
  const prefix = Number(pincode.slice(0, 2));
  const row = PREFIX_STATES.find(([from, to]) => prefix >= from && prefix <= to);
  if (!row) return null;
  return PUDUCHERRY_PREFIXES.includes(pincode.slice(0, 3)) ? [...row[2], 'Puducherry'] : row[2];
}

/** True when a PIN's prefix alone cannot tell the home state from Puducherry. */
export const isAmbiguousHomePincode = (pincode: string, homeState: IndianState): boolean =>
  homeState === 'Tamil Nadu' && TN_PUDUCHERRY_SHARED_PREFIXES.includes(pincode.slice(0, 3));

export type ShippingBasis = 'home_state_free' | 'state_charge' | 'other_states_default' | 'express_charge' | 'coupon_waived';

export type ShippingFailure =
  | 'address_required'
  | 'invalid_pincode'
  | 'invalid_state'
  | 'state_pincode_mismatch'
  | 'shipping_not_configured'
  | 'express_unavailable';

export interface StateShippingSettings {
  /** The state with free shipping. Tamil Nadu unless the owner moves the business. */
  homeState: IndianState;
  /** Paise charged per state/UT outside the home state. A state missing here is "not configured". */
  stateCharges: Partial<Record<IndianState, number>>;
  /** Optional paise charge for states with no charge of their own. null = block checkout instead. */
  otherStatesDefaultCharge: number | null;
  /** Express delivery (a flat surcharge). Off unless the owner turns it on. */
  expressEnabled: boolean;
  /** Paise. Only used when express is enabled. */
  expressCharge: number;
}

export const DEFAULT_STATE_SHIPPING: StateShippingSettings = {
  homeState: HOME_STATE,
  stateCharges: {},
  otherStatesDefaultCharge: null,
  expressEnabled: false,
  expressCharge: 0,
};

export interface ShippingAddress {
  state?: unknown;
  pincode?: unknown;
}

export type ShippingResult =
  | {
      ok: true;
      amount: number;
      basis: ShippingBasis;
      state: IndianState;
      pincode: string;
      /** True only when the official PIN directory (the shop's imported PIN list) confirmed this PIN is in this state. */
      pinVerified: boolean;
      /** True when the PIN prefix alone cannot rule out a neighbouring territory and the directory did not settle it. */
      pinAmbiguous: boolean;
    }
  | { ok: false; reason: ShippingFailure; state?: IndianState };

const isPaise = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * The one shipping rule. `address` is null while the customer has not chosen one:
 * that is an error here, never a silent "free".
 */
export function resolveShipping(input: {
  address: ShippingAddress | null | undefined;
  deliveryMethod?: 'standard' | 'express';
  settings: StateShippingSettings;
  /**
   * The state the shop's own PIN directory records for this PIN (read by the server), or null/undefined when the
   * PIN is not in the directory. When present it is authoritative: a different declared state is a mismatch.
   */
  directoryState?: string | null;
}): ShippingResult {
  const { address, settings } = input;
  const method = input.deliveryMethod ?? 'standard';
  if (!address) return { ok: false, reason: 'address_required' };

  const pincode = typeof address.pincode === 'string' ? address.pincode.trim() : '';
  if (!isValidIndianPincode(pincode)) return { ok: false, reason: 'invalid_pincode' };
  const state = normalizeStateName(address.state);
  if (!state) return { ok: false, reason: 'invalid_state' };
  const plausible = plausibleStatesForPincode(pincode);
  if (!plausible) return { ok: false, reason: 'invalid_pincode' };
  if (!plausible.includes(state)) return { ok: false, reason: 'state_pincode_mismatch', state };
  const directory = input.directoryState ? normalizeStateName(input.directoryState) : null;
  if (directory && directory !== state) return { ok: false, reason: 'state_pincode_mismatch', state };
  const pinVerified = directory !== null && directory === state;
  const pinAmbiguous = !pinVerified && isAmbiguousHomePincode(pincode, state);

  if (method === 'express') {
    if (!settings.expressEnabled || !isPaise(settings.expressCharge)) return { ok: false, reason: 'express_unavailable', state };
    return { ok: true, amount: settings.expressCharge, basis: 'express_charge', state, pincode, pinVerified, pinAmbiguous };
  }

  if (state === settings.homeState) return { ok: true, amount: 0, basis: 'home_state_free', state, pincode, pinVerified, pinAmbiguous };

  const own = settings.stateCharges[state];
  if (isPaise(own)) return { ok: true, amount: own, basis: 'state_charge', state, pincode, pinVerified, pinAmbiguous };
  if (isPaise(settings.otherStatesDefaultCharge)) return { ok: true, amount: settings.otherStatesDefaultCharge, basis: 'other_states_default', state, pincode, pinVerified, pinAmbiguous };
  return { ok: false, reason: 'shipping_not_configured', state };
}

/** States/UTs (other than the home state) that have no charge and no fallback: what the admin must fill in. */
export function unconfiguredStates(settings: StateShippingSettings): IndianState[] {
  if (isPaise(settings.otherStatesDefaultCharge)) return [];
  return INDIAN_STATES_AND_UTS.filter((s) => s !== settings.homeState && !isPaise(settings.stateCharges[s]));
}

/** Plain-language message for a customer. Never mentions internal settings. */
export function shippingFailureMessage(reason: ShippingFailure, state?: string): string {
  switch (reason) {
    case 'address_required':
      return 'Choose a delivery address to see the shipping charge.';
    case 'invalid_pincode':
      return 'This PIN code does not look right. Please check it and try again.';
    case 'invalid_state':
      return 'Please choose a state or union territory for this address.';
    case 'state_pincode_mismatch':
      return 'The state and PIN code on this address do not match. Please correct the address.';
    case 'shipping_not_configured':
      return `We cannot calculate delivery to ${state ?? 'this state'} yet. Please message us on WhatsApp and we will confirm the shipping charge before you order.`;
    case 'express_unavailable':
      return 'Express delivery is not available right now. Please choose standard delivery.';
  }
}

/** Reads a saved settings/shipping document defensively; anything missing or malformed falls back safely. */
export function parseStateShipping(raw: unknown): StateShippingSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const homeState = normalizeStateName(data.homeState) ?? HOME_STATE;
  const stateCharges: Partial<Record<IndianState, number>> = {};
  const rawCharges = data.stateCharges && typeof data.stateCharges === 'object' ? (data.stateCharges as Record<string, unknown>) : {};
  for (const [name, value] of Object.entries(rawCharges)) {
    const state = normalizeStateName(name);
    if (state && isPaise(value)) stateCharges[state] = value;
  }
  return {
    homeState,
    stateCharges,
    otherStatesDefaultCharge: isPaise(data.otherStatesDefaultCharge) ? data.otherStatesDefaultCharge : null,
    expressEnabled: data.expressEnabled === true,
    expressCharge: isPaise(data.expressCharge) ? data.expressCharge : 0,
  };
}
