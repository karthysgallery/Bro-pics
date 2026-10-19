import { describe, it, expect } from 'vitest';
import { newCustomer } from '../billing/invoice-engine';
import type { Customer } from '../schemas/billing';
import { marketingEligibility, transactionalEligibility } from './consent';

const base = (over: Partial<Customer['consent']> = {}, phone = '+919876543210'): Customer => {
  const c = newCustomer({ phone, name: 'A', source: 'admin' }, '2026-01-01T00:00:00Z');
  return { ...c, consent: { ...c.consent, ...over } };
};
const opted = (status: 'opted_in' | 'opted_out' | 'unknown') => ({ status, at: '2026-01-01T00:00:00Z', source: 'form' });

describe('marketing eligibility', () => {
  it('only a recorded opt-in is eligible', () => {
    expect(marketingEligibility(base({ marketing: opted('opted_in') }), { suppressed: false })).toEqual({ eligible: true });
    expect(marketingEligibility(base(), { suppressed: false })).toEqual({ eligible: false, reason: 'not_opted_in' });
    expect(marketingEligibility(base({ marketing: opted('unknown') }), { suppressed: false })).toEqual({ eligible: false, reason: 'not_opted_in' });
  });
  it('an opt-out or the suppression list beats an opt-in', () => {
    expect(marketingEligibility(base({ marketing: opted('opted_out') }), { suppressed: false })).toEqual({ eligible: false, reason: 'opted_out' });
    expect(marketingEligibility(base({ marketing: opted('opted_in') }), { suppressed: true })).toEqual({ eligible: false, reason: 'suppressed' });
  });
  it('an invalid number is never eligible', () => {
    expect(marketingEligibility(base({ marketing: opted('opted_in') }, 'not-a-number'), { suppressed: false })).toEqual({ eligible: false, reason: 'invalid_phone' });
  });
  it('consent for order messages is not consent for marketing', () => {
    const c = base({ transactional: opted('opted_in') });
    expect(marketingEligibility(c, { suppressed: false }).eligible).toBe(false);
  });
});

describe('transactional eligibility', () => {
  it('is allowed unless the customer opted out of order messages', () => {
    expect(transactionalEligibility(base())).toBe(true);
    expect(transactionalEligibility(base({ transactional: opted('opted_out') }))).toBe(false);
    expect(transactionalEligibility(null)).toBe(true);
  });
  it('a marketing opt-out does not stop an order message', () => {
    expect(transactionalEligibility(base({ marketing: opted('opted_out') }))).toBe(true);
  });
});
