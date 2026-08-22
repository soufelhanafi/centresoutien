import { describe, expect, it } from 'vitest';
import {
  computeDefaultAllocation,
  sumAllocation,
} from '../../../../src/renderer/lib/invoices/subject-allocation';
import type { FormulaView } from '../../../../src/renderer/lib/formulas/formula-view';
import type { InvoiceListItemView } from '../../../../src/renderer/lib/invoices/invoice-view';

const MATH = 'sub_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const PHYS = 'sub_01ARZ3NDEKTSV4RRFFQ69G5FB0';
const FORMULA_ID = 'for_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function formula(overrides: Partial<FormulaView> = {}): FormulaView {
  return {
    id: FORMULA_ID,
    name: { fr: 'Math + Physique', ar: '' },
    subjectIds: [MATH, PHYS],
    priceMad: 35000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    subjectPrices: null,
    ...overrides,
  };
}

function invoiceFor(formulaId: string, amountMad: number): InvoiceListItemView {
  return {
    id: 'inv_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    studentId: 'stu_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    month: '2026-08',
    status: 'draft',
    issuedAt: null,
    lines: [{ id: 'invl_1', formulaId, label: { fr: 'x', ar: 'x' }, kind: 'regular', amountMad }],
    totalMad: amountMad,
    netPaidMad: 0,
    outstandingMad: amountMad,
    paymentStatus: 'unpaid',
    subjectAllocation: null,
  };
}

describe('computeDefaultAllocation', () => {
  it('splits by the formula price map and sums to the line total', () => {
    const invoice = invoiceFor(FORMULA_ID, 35000);
    const priced = formula({
      subjectPrices: [
        { subjectId: MATH, priceMad: 20000 },
        { subjectId: PHYS, priceMad: 15000 },
      ],
    });

    const result = computeDefaultAllocation(invoice, [priced]);

    expect(result).toEqual([
      { subjectId: MATH, amountMad: 20000 },
      { subjectId: PHYS, amountMad: 15000 },
    ]);
    expect(sumAllocation(result)).toBe(35000);
  });

  it('splits evenly when the formula has no price map, remainder on the last subject', () => {
    const invoice = invoiceFor(FORMULA_ID, 30001);
    const result = computeDefaultAllocation(invoice, [formula()]);

    expect(sumAllocation(result)).toBe(30001);
    expect(result).toEqual([
      { subjectId: MATH, amountMad: 15001 },
      { subjectId: PHYS, amountMad: 15000 },
    ]);
  });

  it('skips a line whose formula is not yet available', () => {
    const invoice = invoiceFor('for_unknown', 35000);
    expect(computeDefaultAllocation(invoice, [formula()])).toEqual([]);
  });
});
