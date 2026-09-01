import { describe, it, expect } from 'vitest';
import { validateSlotsComplete } from './editor-validation';

describe('validateSlotsComplete', () => {
  it('is incomplete when a slot has no customization at all', () => {
    const result = validateSlotsComplete(2, new Map([[0, { effectiveDpi: 300 }]]), false);
    expect(result.complete).toBe(false);
    expect(result.reason).toMatch(/slot/i);
  });

  it('is complete when every slot has at least amber DPI', () => {
    const result = validateSlotsComplete(
      2,
      new Map([
        [0, { effectiveDpi: 300 }],
        [1, { effectiveDpi: 180 }],
      ]),
      false
    );
    expect(result.complete).toBe(true);
  });

  it('is incomplete when a slot is red-tier and low-dpi is not confirmed', () => {
    const result = validateSlotsComplete(1, new Map([[0, { effectiveDpi: 100 }]]), false);
    expect(result.complete).toBe(false);
    expect(result.reason).toMatch(/dpi/i);
  });

  it('is complete when a slot is red-tier but low-dpi has been explicitly confirmed', () => {
    const result = validateSlotsComplete(1, new Map([[0, { effectiveDpi: 100 }]]), true);
    expect(result.complete).toBe(true);
  });
});
