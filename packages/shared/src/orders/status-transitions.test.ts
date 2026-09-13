import { describe, it, expect } from 'vitest';
import { isValidStatusTransition } from './status-transitions';
import type { OrderStatus } from '../schemas/order';

describe('isValidStatusTransition — happy path', () => {
  const happyPath: OrderStatus[] = [
    'pending_payment',
    'paid',
    'in_production',
    'printed_packed',
    'shipped',
    'delivered',
  ];

  it('allows each step to its immediate successor', () => {
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(isValidStatusTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it('rejects skipping a step', () => {
    expect(isValidStatusTransition('pending_payment', 'in_production')).toBe(false);
    expect(isValidStatusTransition('paid', 'shipped')).toBe(false);
    expect(isValidStatusTransition('pending_payment', 'delivered')).toBe(false);
  });

  it('rejects going backward', () => {
    expect(isValidStatusTransition('shipped', 'paid')).toBe(false);
    expect(isValidStatusTransition('delivered', 'shipped')).toBe(false);
  });
});

describe('isValidStatusTransition — cancelled branch', () => {
  it('allows cancelled from pending_payment, paid, or in_production', () => {
    expect(isValidStatusTransition('pending_payment', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('paid', 'cancelled')).toBe(true);
    expect(isValidStatusTransition('in_production', 'cancelled')).toBe(true);
  });

  it('rejects cancelled once printed_packed or later', () => {
    expect(isValidStatusTransition('printed_packed', 'cancelled')).toBe(false);
    expect(isValidStatusTransition('shipped', 'cancelled')).toBe(false);
    expect(isValidStatusTransition('delivered', 'cancelled')).toBe(false);
  });
});

describe('isValidStatusTransition — refunded branch', () => {
  it('allows refunded from paid, in_production, printed_packed, shipped, or delivered', () => {
    for (const from of ['paid', 'in_production', 'printed_packed', 'shipped', 'delivered'] as OrderStatus[]) {
      expect(isValidStatusTransition(from, 'refunded')).toBe(true);
    }
  });

  it('rejects refunded from pending_payment', () => {
    expect(isValidStatusTransition('pending_payment', 'refunded')).toBe(false);
  });
});

describe('isValidStatusTransition — replacement_issued branch', () => {
  it('allows replacement_issued from shipped or delivered only', () => {
    expect(isValidStatusTransition('shipped', 'replacement_issued')).toBe(true);
    expect(isValidStatusTransition('delivered', 'replacement_issued')).toBe(true);
  });

  it('rejects replacement_issued before shipped', () => {
    expect(isValidStatusTransition('printed_packed', 'replacement_issued')).toBe(false);
    expect(isValidStatusTransition('paid', 'replacement_issued')).toBe(false);
  });
});

describe('isValidStatusTransition — terminal states', () => {
  it('rejects every outbound transition from cancelled, refunded, and replacement_issued', () => {
    const terminal: OrderStatus[] = ['cancelled', 'refunded', 'replacement_issued'];
    const anyOther: OrderStatus[] = ['pending_payment', 'paid', 'in_production', 'printed_packed', 'shipped', 'delivered'];
    for (const from of terminal) {
      for (const to of [...anyOther, ...terminal]) {
        if (from === to) continue;
        expect(isValidStatusTransition(from, to)).toBe(false);
      }
    }
  });
});
