import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE_SHIPPING,
  INDIAN_STATES_AND_UTS,
  normalizeStateName,
  parseStateShipping,
  plausibleStatesForPincode,
  resolveShipping,
  shippingFailureMessage,
  unconfiguredStates,
  type StateShippingSettings,
} from './state-shipping';

const settings = (over: Partial<StateShippingSettings> = {}): StateShippingSettings => ({
  ...DEFAULT_STATE_SHIPPING,
  stateCharges: { Kerala: 8000, Karnataka: 9000 },
  ...over,
});

describe('Tamil Nadu is always free', () => {
  it.each(['600001', '625001', '626125', '641001', '627001', '636001'])('PIN %s in Tamil Nadu costs nothing, whatever the order size or settings', (pincode) => {
    for (const s of [settings(), settings({ stateCharges: {} }), settings({ otherStatesDefaultCharge: 12000 })]) {
      expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode }, settings: s })).toMatchObject({ ok: true, amount: 0, basis: 'home_state_free' });
    }
  });

  it('accepts common spellings of the state', () => {
    for (const state of ['tamilnadu', 'TAMIL NADU', ' Tamil  Nadu ']) {
      expect(resolveShipping({ address: { state, pincode: '626125' }, settings: settings() })).toMatchObject({ ok: true, amount: 0 });
    }
  });
});

describe('other states use the owner-set charge', () => {
  it('charges each state its own amount', () => {
    expect(resolveShipping({ address: { state: 'Kerala', pincode: '682001' }, settings: settings() })).toMatchObject({ ok: true, amount: 8000, basis: 'state_charge' });
    expect(resolveShipping({ address: { state: 'Karnataka', pincode: '560001' }, settings: settings() })).toMatchObject({ ok: true, amount: 9000 });
  });

  it('allows an explicit ₹0 charge for a state the owner chose to make free', () => {
    expect(resolveShipping({ address: { state: 'Kerala', pincode: '682001' }, settings: settings({ stateCharges: { Kerala: 0 } }) })).toMatchObject({ ok: true, amount: 0, basis: 'state_charge' });
  });
});

describe('an unconfigured state is never silently free', () => {
  it('blocks checkout instead of returning 0', () => {
    const r = resolveShipping({ address: { state: 'Maharashtra', pincode: '400001' }, settings: settings() });
    expect(r).toEqual({ ok: false, reason: 'shipping_not_configured', state: 'Maharashtra' });
    expect(shippingFailureMessage('shipping_not_configured', 'Maharashtra')).toMatch(/Maharashtra/);
  });

  it('uses the optional fallback charge only when the owner set one', () => {
    expect(resolveShipping({ address: { state: 'Maharashtra', pincode: '400001' }, settings: settings({ otherStatesDefaultCharge: 12000 }) })).toMatchObject({ ok: true, amount: 12000, basis: 'other_states_default' });
  });

  it('lists exactly the states the admin still has to fill in', () => {
    const missing = unconfiguredStates(settings());
    expect(missing).not.toContain('Tamil Nadu');
    expect(missing).not.toContain('Kerala');
    expect(missing).toContain('Maharashtra');
    expect(missing).toHaveLength(INDIAN_STATES_AND_UTS.length - 3);
    expect(unconfiguredStates(settings({ otherStatesDefaultCharge: 100 }))).toEqual([]);
  });

  it('treats a malformed saved charge as not configured', () => {
    for (const bad of [-1, 1.5, NaN, '80', null]) {
      const s = parseStateShipping({ stateCharges: { Kerala: bad } });
      expect(resolveShipping({ address: { state: 'Kerala', pincode: '682001' }, settings: s })).toMatchObject({ ok: false, reason: 'shipping_not_configured' });
    }
  });
});

describe('invalid or manipulated addresses', () => {
  it('needs an address', () => {
    expect(resolveShipping({ address: null, settings: settings() })).toEqual({ ok: false, reason: 'address_required' });
    expect(resolveShipping({ address: undefined, settings: settings() })).toEqual({ ok: false, reason: 'address_required' });
  });

  it.each(['', '12345', '1234567', 'abcdef', '000001', '999999', '900001'])('rejects PIN %j', (pincode) => {
    expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode }, settings: settings() })).toMatchObject({ ok: false, reason: 'invalid_pincode' });
  });

  it('rejects an unknown or missing state', () => {
    expect(resolveShipping({ address: { state: 'Atlantis', pincode: '626125' }, settings: settings() })).toMatchObject({ ok: false, reason: 'invalid_state' });
    expect(resolveShipping({ address: { state: undefined, pincode: '626125' }, settings: settings() })).toMatchObject({ ok: false, reason: 'invalid_state' });
    expect(resolveShipping({ address: { state: { toString: () => 'Tamil Nadu' }, pincode: '626125' }, settings: settings() })).toMatchObject({ ok: false, reason: 'invalid_state' });
  });

  it('refuses "Tamil Nadu" with a PIN from another state (the free-shipping trick)', () => {
    for (const pincode of ['682001', '560001', '400001', '110001', '500001']) {
      expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode }, settings: settings() })).toMatchObject({ ok: false, reason: 'state_pincode_mismatch' });
    }
  });

  it('refuses a Tamil Nadu PIN claimed as a cheaper state', () => {
    expect(resolveShipping({ address: { state: 'Kerala', pincode: '626125' }, settings: settings({ stateCharges: { Kerala: 0 } }) })).toMatchObject({ ok: false, reason: 'state_pincode_mismatch' });
  });

  it('a malicious settings object from the browser has no effect: only the typed settings are read', () => {
    const forged = parseStateShipping({ homeState: 'Kerala', stateCharges: { Kerala: 0 }, expressEnabled: 'yes' });
    expect(forged.homeState).toBe('Kerala'); // a real saved value would be honoured, so the server must read settings itself
    expect(forged.expressEnabled).toBe(false); // non-boolean is not "on"
  });
});

describe('express delivery', () => {
  it('is unavailable unless the owner enables it', () => {
    expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode: '626125' }, deliveryMethod: 'express', settings: settings() })).toMatchObject({ ok: false, reason: 'express_unavailable' });
  });
  it('charges the flat express amount when enabled', () => {
    expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode: '626125' }, deliveryMethod: 'express', settings: settings({ expressEnabled: true, expressCharge: 15000 }) })).toMatchObject({ ok: true, amount: 15000, basis: 'express_charge' });
  });
});

describe('state and PIN helpers', () => {
  it('normalises names', () => {
    expect(normalizeStateName('orissa')).toBe('Odisha');
    expect(normalizeStateName('Pondicherry')).toBe('Puducherry');
    expect(normalizeStateName('nope')).toBeNull();
    expect(normalizeStateName(5)).toBeNull();
  });
  it('allows shared ranges for union territories, but only where Puducherry really has PINs', () => {
    expect(plausibleStatesForPincode('605001')).toContain('Puducherry');
    expect(plausibleStatesForPincode('605001')).toContain('Tamil Nadu');
    expect(plausibleStatesForPincode('673310')).toContain('Puducherry'); // Mahe
    expect(plausibleStatesForPincode('533464')).toContain('Puducherry'); // Yanam
    expect(plausibleStatesForPincode('600001')).not.toContain('Puducherry'); // Chennai
    expect(plausibleStatesForPincode('682001')).toContain('Kerala');
    expect(plausibleStatesForPincode('900001')).toBeNull();
  });
  it('parses missing settings into the safe defaults', () => {
    expect(parseStateShipping(undefined)).toEqual(DEFAULT_STATE_SHIPPING);
    expect(parseStateShipping({})).toEqual(DEFAULT_STATE_SHIPPING);
  });
});

describe('Puducherry and the PIN directory', () => {
  const tn = { state: 'Tamil Nadu', pincode: '605001' };

  it('a Puducherry address with a Chennai PIN is a mismatch, not a cheaper or free delivery', () => {
    expect(resolveShipping({ address: { state: 'Puducherry', pincode: '600001' }, settings: settings({ otherStatesDefaultCharge: 7000 }) })).toMatchObject({ ok: false, reason: 'state_pincode_mismatch' });
  });

  it('without a directory, a Tamil Nadu address in a shared prefix is free but flagged as unverified and ambiguous', () => {
    expect(resolveShipping({ address: tn, settings: settings() })).toMatchObject({ ok: true, amount: 0, pinVerified: false, pinAmbiguous: true });
  });

  it('the directory settles it: a PIN the directory says is Puducherry cannot be claimed as Tamil Nadu', () => {
    expect(resolveShipping({ address: tn, directoryState: 'Puducherry', settings: settings() })).toMatchObject({ ok: false, reason: 'state_pincode_mismatch' });
  });

  it('the directory confirming Tamil Nadu makes the free delivery verified and not ambiguous', () => {
    expect(resolveShipping({ address: tn, directoryState: 'Tamil Nadu', settings: settings() })).toMatchObject({ ok: true, amount: 0, pinVerified: true, pinAmbiguous: false });
  });

  it('a directory state for a Kerala PIN claimed as Tamil Nadu is refused even when the prefix table would allow it', () => {
    expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode: '626125' }, directoryState: 'Kerala', settings: settings() })).toMatchObject({ ok: false, reason: 'state_pincode_mismatch' });
  });

  it('an ordinary Tamil Nadu PIN is not ambiguous', () => {
    expect(resolveShipping({ address: { state: 'Tamil Nadu', pincode: '626125' }, settings: settings() })).toMatchObject({ ok: true, pinAmbiguous: false });
  });
});
