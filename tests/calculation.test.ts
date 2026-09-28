import { describe, expect, it } from 'vitest';
import { calculateShares } from '../src/logic/calculation';

const units = (...counts: number[]) => counts.map((personCount, i) => ({ unitNumber: i + 1, personCount }));
const sum = (xs: { shareAmount: number }[]) => xs.reduce((a, x) => a + x.shareAmount, 0);

describe('calculateShares', () => {
  it('matches the reference example (5,000,000 among 2/3/1/4 persons)', () => {
    const r = calculateShares(5_000_000, units(2, 3, 1, 4));
    expect(r.totalPersons).toBe(10);
    expect(r.perPersonExact).toBe(500_000);
    expect(r.isExact).toBe(true);
    expect(r.remainder).toBe(0);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([1_000_000, 1_500_000, 500_000, 2_000_000]);
    expect(sum(r.shares)).toBe(5_000_000);
  });

  it('1,000,000 among 3 single-person units: shares sum exactly to total', () => {
    const r = calculateShares(1_000_000, units(1, 1, 1));
    expect(r.isExact).toBe(false);
    expect(r.remainder).toBe(1);
    // deterministic: remainder goes to the lowest unit number on ties
    expect(r.shares.map((s) => s.shareAmount)).toEqual([333_334, 333_333, 333_333]);
    expect(sum(r.shares)).toBe(1_000_000);
  });

  it('1,000,000 in a single unit of 3 persons gives the whole amount to that unit', () => {
    const r = calculateShares(1_000_000, units(3));
    expect(r.shares[0].shareAmount).toBe(1_000_000);
  });

  it('gives remainder to largest fractional parts first', () => {
    // 100 among (1,2): exact 33.33 / 66.66 -> floor 33/66, remainder 1 -> unit 2 (frac .66 > .33)
    const r = calculateShares(100, units(1, 2));
    expect(r.shares.map((s) => s.shareAmount)).toEqual([33, 67]);
    expect(sum(r.shares)).toBe(100);
  });

  it('is deterministic for repeated calls', () => {
    const a = calculateShares(7_777_777, units(3, 5, 2, 7, 1));
    const b = calculateShares(7_777_777, units(3, 5, 2, 7, 1));
    expect(a).toEqual(b);
  });

  it('always sums to total for many random inputs', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rnd() * 12);
      const counts = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 9));
      const total = 1 + Math.floor(rnd() * 50_000_000);
      const r = calculateShares(total, units(...counts));
      expect(sum(r.shares)).toBe(total);
      // each share is within 1 toman of its exact value
      r.shares.forEach((s) => {
        expect(Math.abs(s.shareAmount - (total * s.personCount) / r.totalPersons)).toBeLessThan(1);
      });
    }
  });

  it('keeps precision for very large totals', () => {
    const total = 9_007_199_254_740_991; // Number.MAX_SAFE_INTEGER
    const r = calculateShares(total, units(3, 4));
    expect(r.shares.reduce((a, s) => a + BigInt(s.shareAmount), 0n)).toBe(BigInt(total));
  });

  it('rejects invalid input', () => {
    expect(() => calculateShares(0, units(1))).toThrow();
    expect(() => calculateShares(1000, [])).toThrow();
    expect(() => calculateShares(1000, units(0))).toThrow();
    expect(() => calculateShares(1000, units(0, 0))).toThrow();
    expect(() => calculateShares(1000, units(2, -1))).toThrow();
  });

  it('empty units (0 persons) get 0 and never receive a rounding toman', () => {
    const r = calculateShares(1_000_000, units(0, 1, 0, 1, 1));
    expect(r.totalPersons).toBe(3);
    expect(r.shares.map((s) => s.shareAmount)).toEqual([0, 333_334, 0, 333_333, 333_333]);
    expect(sum(r.shares)).toBe(1_000_000);
    const r2 = calculateShares(10, units(0, 3, 0));
    expect(r2.shares.map((s) => s.shareAmount)).toEqual([0, 10, 0]);
  });
});
