import { describe, expect, it } from 'vitest';
import type {
  CenterCode,
  DeviceId,
  Invoice,
  InvoiceId,
  InvoiceListItem,
  StudentId,
  SubjectId,
  UserId,
} from '@centresoutien/domain';
import {
  createInvoiceHandlers,
  type InvoiceHandlerDeps,
} from '../../../src/main/ipc/invoice-handlers';

const CENTER_CODE = 'CS-DEV-001' as CenterCode;
const USER_ID = 'usr_00000000000000000000000001' as UserId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const FR = 'sub_00000000000000000000000002' as SubjectId;

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    centerCode: CENTER_CODE,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date('2026-07-01T09:00:00Z'),
    updatedAt: new Date('2026-07-01T09:00:00Z'),
    updatedBy: USER_ID,
    deletedAt: null,
    version: 0,
    studentId: 'stu_00000000000000000000000001' as StudentId,
    month: '2026-07',
    status: 'issued',
    issuedAt: new Date('2026-07-01T09:00:00Z'),
    cancelledAt: null,
    subjectAllocation: null,
    ...overrides,
  };
}

function makeListItem(invoice: Invoice): InvoiceListItem {
  return {
    invoice,
    studentName: { fr: 'Yassine', ar: 'ياسين' },
    lines: [],
    totalMad: 90000,
    netPaidMad: 0,
    outstandingMad: 90000,
    status: 'unpaid',
  };
}

/** Shared mutable invoice so `invoice.setAllocation` and `invoice.list` read/write
 *  the same row — the set→list round-trip the readback bug (Finding 8) broke. */
function makeDeps(): { deps: InvoiceHandlerDeps; current: () => Invoice } {
  let invoice = makeInvoice();
  const unused = () => {
    throw new Error('not exercised by this test');
  };
  const deps: InvoiceHandlerDeps = {
    listInvoices: { execute: async () => ({ items: [makeListItem(invoice)], nextCursor: null }) },
    issueInvoice: { execute: unused },
    cancelInvoice: { execute: unused },
    updateDraftInvoiceLineAmount: { execute: unused },
    setInvoiceSubjectAllocation: {
      execute: async (input) => {
        const allocation =
          input.allocations === null
            ? null
            : input.allocations.map((entry) => ({
                subjectId: entry.subjectId as SubjectId,
                amountMad: entry.amountMad,
              }));
        invoice = { ...invoice, subjectAllocation: allocation };
        return invoice;
      },
    },
    invoicePdfRenderer: { render: unused },
    getCenterProfile: { execute: unused },
    getStudent: { execute: unused },
    readCenterLogo: { execute: unused },
    centerCode: () => CENTER_CODE,
    updatedBy: () => USER_ID,
    tempDir: '/tmp',
  };
  return { deps, current: () => invoice };
}

describe('invoice.list subjectAllocation readback (Finding 8)', () => {
  it('projects subjectAllocation (null when there is no override)', async () => {
    const handlers = createInvoiceHandlers(makeDeps().deps);

    const { invoices } = await handlers['invoice.list']({});

    expect(invoices[0]?.subjectAllocation).toBeNull();
  });

  it('preserves the override across a set → list round-trip', async () => {
    const handlers = createInvoiceHandlers(makeDeps().deps);

    await handlers['invoice.setAllocation']({
      invoiceId: INVOICE_ID,
      allocations: [
        { subjectId: MATH, amountMad: 44000 },
        { subjectId: FR, amountMad: 46000 },
      ],
    });

    const { invoices } = await handlers['invoice.list']({});

    expect(invoices[0]?.subjectAllocation).toEqual([
      { subjectId: MATH, amountMad: 44000 },
      { subjectId: FR, amountMad: 46000 },
    ]);
  });
});
