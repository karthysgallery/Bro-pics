import { describe, it, expect } from 'vitest';
import { isValidReturnStatusTransition } from './return-status-transitions';

describe('isValidReturnStatusTransition', () => {
  it('walks the full happy-path lifecycle', () => {
    expect(isValidReturnStatusTransition('requested', 'approved')).toBe(true);
    expect(isValidReturnStatusTransition('approved', 'pickup_scheduled')).toBe(true);
    expect(isValidReturnStatusTransition('pickup_scheduled', 'picked_up')).toBe(true);
    expect(isValidReturnStatusTransition('picked_up', 'refund_processing')).toBe(true);
    expect(isValidReturnStatusTransition('refund_processing', 'refunded')).toBe(true);
  });

  it('allows rejecting a fresh request', () => {
    expect(isValidReturnStatusTransition('requested', 'rejected')).toBe(true);
  });

  it('treats rejected and refunded as terminal', () => {
    expect(isValidReturnStatusTransition('rejected', 'approved')).toBe(false);
    expect(isValidReturnStatusTransition('refunded', 'requested')).toBe(false);
  });

  it('rejects skipping a step', () => {
    expect(isValidReturnStatusTransition('requested', 'picked_up')).toBe(false);
    expect(isValidReturnStatusTransition('approved', 'refunded')).toBe(false);
  });
});
