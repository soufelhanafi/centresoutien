import { describe, it, expect } from 'vitest';
import { assertInvoicePayable, isInvoicePayable } from '../../../src/policies/payable-invoice';
import { InvoiceNotPayableError } from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const INVOICE = 'inv_00000000000000000000000001' as InvoiceId;

function makeInvoice(status: InvoiceStatus): Invoice {
  return {
    id: INVOICE,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    studentId: STUDENT,
    month: '2026-09',
    status,
    issuedAt: status === 'draft' ? null : new Date('2026-08-01T10:00:00Z'),
    cancelledAt: status === 'cancelled' ? new Date('2026-08-02T10:00:00Z') : null,
  };
}

describe('assertInvoicePayable', () => {
  it('accepts an issued invoice', () => {
    expect(() => assertInvoicePayable(makeInvoice('issued'))).not.toThrow();
  });

  it('rejects a draft invoice', () => {
    expect(() => assertInvoicePayable(makeInvoice('draft'))).toThrow(InvoiceNotPayableError);
  });

  it('rejects a cancelled invoice', () => {
    expect(() => assertInvoicePayable(makeInvoice('cancelled'))).toThrow(InvoiceNotPayableError);
  });

  it('carries the invoice id and offending status on the error', () => {
    expect(() => assertInvoicePayable(makeInvoice('draft'))).toThrow(
      expect.objectContaining({ invoiceId: INVOICE, status: 'draft', code: 'invoice-not-payable' }),
    );
  });
});

describe('isInvoicePayable', () => {
  it('is true only for issued', () => {
    expect(isInvoicePayable(makeInvoice('issued'))).toBe(true);
    expect(isInvoicePayable(makeInvoice('draft'))).toBe(false);
    expect(isInvoicePayable(makeInvoice('cancelled'))).toBe(false);
  });
});
