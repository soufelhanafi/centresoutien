import { describe, it, expect } from 'vitest';
import { deriveInvoiceId, deriveInvoiceLineId } from '../../../src/policies/invoice-id';
import { INVOICE_ID_PREFIX } from '../../../src/entities/invoice';
import { INVOICE_LINE_ID_PREFIX } from '../../../src/entities/invoice-line';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { StudentId } from '../../../src/entities/student';
import type { FormulaId } from '../../../src/entities/formula';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const OTHER_STUDENT = 'stu_00000000000000000000000002' as StudentId;
const FORMULA = 'fml_00000000000000000000000001' as FormulaId;
const OTHER_FORMULA = 'fml_00000000000000000000000002' as FormulaId;

describe('deriveInvoiceId', () => {
  it('is a pure function: the same (centerCode, studentId, month) always yields the same id', () => {
    const first = deriveInvoiceId(CENTER, STUDENT, '2026-09');
    const second = deriveInvoiceId(CENTER, STUDENT, '2026-09');
    expect(first).toBe(second);
  });

  it('matches the entity id-prefix shape', () => {
    const id = deriveInvoiceId(CENTER, STUDENT, '2026-09');
    expect(id.startsWith(`${INVOICE_ID_PREFIX}_`)).toBe(true);
  });

  it('differs when the student differs', () => {
    expect(deriveInvoiceId(CENTER, STUDENT, '2026-09')).not.toBe(
      deriveInvoiceId(CENTER, OTHER_STUDENT, '2026-09'),
    );
  });

  it('differs when the month differs', () => {
    expect(deriveInvoiceId(CENTER, STUDENT, '2026-09')).not.toBe(
      deriveInvoiceId(CENTER, STUDENT, '2026-10'),
    );
  });

  it('differs when the center differs — never mixes two centers into one id', () => {
    expect(deriveInvoiceId(CENTER, STUDENT, '2026-09')).not.toBe(
      deriveInvoiceId(OTHER_CENTER, STUDENT, '2026-09'),
    );
  });
});

describe('deriveInvoiceLineId', () => {
  const invoiceId = deriveInvoiceId(CENTER, STUDENT, '2026-09');
  const otherInvoiceId = deriveInvoiceId(CENTER, OTHER_STUDENT, '2026-09');

  it('is a pure function: the same (invoiceId, formulaId, kind) always yields the same id', () => {
    const first = deriveInvoiceLineId(invoiceId, FORMULA, 'regular');
    const second = deriveInvoiceLineId(invoiceId, FORMULA, 'regular');
    expect(first).toBe(second);
  });

  it('matches the entity id-prefix shape', () => {
    const id = deriveInvoiceLineId(invoiceId, FORMULA, 'regular');
    expect(id.startsWith(`${INVOICE_LINE_ID_PREFIX}_`)).toBe(true);
  });

  it('differs when the formula differs', () => {
    expect(deriveInvoiceLineId(invoiceId, FORMULA, 'regular')).not.toBe(
      deriveInvoiceLineId(invoiceId, OTHER_FORMULA, 'regular'),
    );
  });

  it('differs when the kind differs — the same formula billed under two tracks is two lines', () => {
    expect(deriveInvoiceLineId(invoiceId, FORMULA, 'regular')).not.toBe(
      deriveInvoiceLineId(invoiceId, FORMULA, 'exam-prep'),
    );
  });

  it('differs when the invoice differs', () => {
    expect(deriveInvoiceLineId(invoiceId, FORMULA, 'regular')).not.toBe(
      deriveInvoiceLineId(otherInvoiceId, FORMULA, 'regular'),
    );
  });
});
