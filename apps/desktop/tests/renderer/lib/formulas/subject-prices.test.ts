import { describe, expect, it } from 'vitest';
import {
  sumSubjectPrices,
  validateSubjectPrices,
} from '../../../../src/renderer/lib/formulas/subject-prices';

const MATH = 'sub_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const PHYS = 'sub_01ARZ3NDEKTSV4RRFFQ69G5FB0';

describe('sumSubjectPrices', () => {
  it('sums entries, counting NaN as 0', () => {
    expect(sumSubjectPrices([{ subjectId: MATH, priceMad: 20000 }, { subjectId: PHYS, priceMad: 15000 }])).toBe(35000);
    expect(sumSubjectPrices([{ subjectId: MATH, priceMad: Number.NaN }])).toBe(0);
  });
});

describe('validateSubjectPrices', () => {
  it('accepts a covering map whose amounts are positive and sum to the total', () => {
    expect(
      validateSubjectPrices({
        subjectIds: [MATH, PHYS],
        subjectPrices: [
          { subjectId: MATH, priceMad: 20000 },
          { subjectId: PHYS, priceMad: 15000 },
        ],
        totalMad: 35000,
      }),
    ).toBeNull();
  });

  it('flags coverage when a selected subject has no price entry', () => {
    expect(
      validateSubjectPrices({
        subjectIds: [MATH, PHYS],
        subjectPrices: [{ subjectId: MATH, priceMad: 35000 }],
        totalMad: 35000,
      }),
    ).toBe('formula-subject-prices-coverage-mismatch');
  });

  it('flags coverage when a price entry targets an unselected subject', () => {
    expect(
      validateSubjectPrices({
        subjectIds: [MATH],
        subjectPrices: [{ subjectId: PHYS, priceMad: 35000 }],
        totalMad: 35000,
      }),
    ).toBe('formula-subject-prices-coverage-mismatch');
  });

  it('flags a non-positive or non-integer amount', () => {
    expect(
      validateSubjectPrices({
        subjectIds: [MATH, PHYS],
        subjectPrices: [
          { subjectId: MATH, priceMad: 35000 },
          { subjectId: PHYS, priceMad: 0 },
        ],
        totalMad: 35000,
      }),
    ).toBe('formula-subject-prices-invalid-amount');
    expect(
      validateSubjectPrices({
        subjectIds: [MATH],
        subjectPrices: [{ subjectId: MATH, priceMad: Number.NaN }],
        totalMad: 35000,
      }),
    ).toBe('formula-subject-prices-invalid-amount');
  });

  it('flags a sum that does not equal the bundle total', () => {
    expect(
      validateSubjectPrices({
        subjectIds: [MATH, PHYS],
        subjectPrices: [
          { subjectId: MATH, priceMad: 20000 },
          { subjectId: PHYS, priceMad: 20000 },
        ],
        totalMad: 35000,
      }),
    ).toBe('formula-subject-prices-sum-mismatch');
  });
});
