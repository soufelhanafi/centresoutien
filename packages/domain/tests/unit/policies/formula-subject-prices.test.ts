import { describe, it, expect } from 'vitest';
import { assertValidFormulaSubjectPrices } from '../../../src/policies/formula-subject-prices';
import { InvalidFormulaSubjectPricesError } from '../../../src/errors/formula-errors';
import type { SubjectId } from '../../../src/entities/subject';
import type { FormulaSubjectPrice } from '../../../src/entities/formula';

const MATH = 'sub_00000000000000000000000001' as SubjectId;
const FR = 'sub_00000000000000000000000002' as SubjectId;
const AR = 'sub_00000000000000000000000003' as SubjectId;

describe('assertValidFormulaSubjectPrices', () => {
  it('accepts an absent map (legacy/un-priced formula)', () => {
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, undefined)).not.toThrow();
  });

  it('accepts an empty map', () => {
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, [])).not.toThrow();
  });

  it('accepts a map that sums to the price and covers exactly the subjects', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 23000 },
      { subjectId: AR, priceMad: 23000 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR, AR], 90000, prices)).not.toThrow();
  });

  it('rejects a map whose amounts do not sum to the bundle price', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 23000 },
      { subjectId: AR, priceMad: 20000 }, // sum 87000 != 90000
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR, AR], 90000, prices)).toThrowError(
      expect.objectContaining({ code: 'formula-subject-prices-sum-mismatch' }),
    );
  });

  it('rejects a map that misses one of the formula subjects', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: FR, priceMad: 46000 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR, AR], 90000, prices)).toThrowError(
      expect.objectContaining({ code: 'formula-subject-prices-coverage-mismatch' }),
    );
  });

  it('rejects a map with a subject not on the formula', () => {
    const other = 'sub_00000000000000000000000009' as SubjectId;
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: other, priceMad: 46000 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, prices)).toThrowError(
      expect.objectContaining({ code: 'formula-subject-prices-coverage-mismatch' }),
    );
  });

  it('rejects a duplicated subject', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000 },
      { subjectId: MATH, priceMad: 46000 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, prices)).toThrowError(
      expect.objectContaining({ code: 'formula-subject-prices-coverage-mismatch' }),
    );
  });

  it('rejects a non-positive amount', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 90000 },
      { subjectId: FR, priceMad: 0 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, prices)).toThrowError(
      expect.objectContaining({ code: 'formula-subject-prices-invalid-amount' }),
    );
  });

  it('rejects a non-integer amount', () => {
    const prices: FormulaSubjectPrice[] = [
      { subjectId: MATH, priceMad: 44000.5 },
      { subjectId: FR, priceMad: 45999.5 },
    ];
    expect(() => assertValidFormulaSubjectPrices([MATH, FR], 90000, prices)).toThrow(
      InvalidFormulaSubjectPricesError,
    );
  });
});
