import { describe, it, expect } from 'vitest';
import { apportionByWeight } from '../../../src/policies/apportion';

describe('apportionByWeight', () => {
  it('returns an empty array for no weights', () => {
    expect(apportionByWeight(1000, [])).toEqual([]);
  });

  describe('weighted split', () => {
    it('splits proportionally to the weights when it divides exactly', () => {
      // The SOU-298 ticket example: a 900 MAD Math+FR+AR formula weighted 440/230/230.
      expect(apportionByWeight(90000, [44000, 23000, 23000])).toEqual([44000, 23000, 23000]);
    });

    it('gives the residual centimes to the largest fractional remainders first', () => {
      // 100 split by weights 1:1:1 -> 33.33 each; residual 1 to the first tie.
      expect(apportionByWeight(100, [1, 1, 1])).toEqual([34, 33, 33]);
    });

    it('never creates or loses a centime, whatever the weights', () => {
      const shares = apportionByWeight(100001, [7, 3, 11, 1]);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100001);
    });

    it('assigns the whole amount to the only positive-weight subject', () => {
      expect(apportionByWeight(50000, [50000, 0, 0])).toEqual([50000, 0, 0]);
    });
  });

  describe('equal-split fallback (all-zero weights = legacy/un-priced formula)', () => {
    it('splits equally when every weight is zero', () => {
      expect(apportionByWeight(30000, [0, 0, 0])).toEqual([10000, 10000, 10000]);
    });

    it('gives the leftover to the first shares in order, matching the pre-weighted split', () => {
      expect(apportionByWeight(35000, [0, 0, 0])).toEqual([11667, 11667, 11666]);
    });

    it('handles a single centime across many zero-weight shares', () => {
      expect(apportionByWeight(1, [0, 0, 0, 0, 0, 0, 0])).toEqual([1, 0, 0, 0, 0, 0, 0]);
    });

    it('handles a zero amount', () => {
      expect(apportionByWeight(0, [0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
    });
  });
});
