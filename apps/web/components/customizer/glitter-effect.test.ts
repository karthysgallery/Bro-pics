import { describe, it, expect } from 'vitest';
import { seededRandom, sparklePlan } from './glitter-effect';

describe('glitter effect plan', () => {
  it('is the same every time for the same picture size, and different for another', () => {
    expect(sparklePlan(900, 1200)).toEqual(sparklePlan(900, 1200));
    expect(sparklePlan(900, 1200).glints[0]).not.toEqual(sparklePlan(1200, 900).glints[0]);
    const a = seededRandom(5);
    const b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('keeps every sparkle inside the picture and scales the number with its size', () => {
    const small = sparklePlan(400, 600);
    const large = sparklePlan(1600, 2400);
    for (const s of [...large.dust, ...large.glints]) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1600);
      expect(s.y).toBeLessThanOrEqual(2400);
    }
    expect(large.dust.length).toBeGreaterThan(small.dust.length);
    expect(large.glints.length).toBeGreaterThan(small.glints.length);
  });
});
