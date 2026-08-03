import { describe, expect, it } from 'vitest';
import type {
  CenterCode,
  DeviceId,
  Invoice,
  InvoiceId,
  StudentId,
  UserId,
} from '@centresoutien/domain';
import { InvalidInvoiceTransitionError, InvoiceNotFoundError } from '@centresoutien/domain';
import {
  createInvoiceHandlers,
  type InvoiceHandlerDeps,
  type IssueInvoiceUseCase,
  type CancelInvoiceUseCase,
} from '../../../src/main/ipc/invoice-handlers';

const CENTER_CODE = 'CS-DEV-001' as CenterCode;
const USER_ID = 'usr_00000000000000000000000001' as UserId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;

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
    status: 'draft',
    issuedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

/** Only `centerCode`/`updatedBy`/`issueInvoice`/`cancelInvoice` are exercised by
 *  `invoice.issue`/`invoice.cancel` — the rest of `InvoiceHandlerDeps` is unused
 *  by those two channels, so stubs that throw if called are enough to satisfy
 *  the type without pulling in the PDF-assembly surface. */
function makeDeps(overrides: {
  issueInvoice: IssueInvoiceUseCase;
  cancelInvoice: CancelInvoiceUseCase;
}): InvoiceHandlerDeps {
  const unused = () => {
    throw new Error('not exercised by invoice.issue/invoice.cancel');
  };
  return {
    listInvoices: { execute: unused },
    invoicePdfRenderer: { render: unused },
    getCenterProfile: { execute: unused },
    getStudent: { execute: unused },
    readCenterLogo: { execute: unused },
    centerCode: () => CENTER_CODE,
    updatedBy: () => USER_ID,
    ...overrides,
  };
}

describe('invoice.issue / invoice.cancel handlers', () => {
  it('issues a draft invoice and stamps centerCode/updatedBy from the injected context', async () => {
    let capturedInput: unknown;
    const issueInvoice: IssueInvoiceUseCase = {
      execute: async (input) => {
        capturedInput = input;
        return makeInvoice({ status: 'issued', issuedAt: new Date('2026-07-15T10:00:00Z') });
      },
    };
    const handlers = createInvoiceHandlers(
      makeDeps({ issueInvoice, cancelInvoice: { execute: async () => makeInvoice() } }),
    );

    const result = await handlers['invoice.issue']({ invoiceId: INVOICE_ID });

    expect(capturedInput).toEqual({
      centerCode: CENTER_CODE,
      invoiceId: INVOICE_ID,
      updatedBy: USER_ID,
    });
    expect(result).toEqual({
      id: INVOICE_ID,
      status: 'issued',
      issuedAt: '2026-07-15T10:00:00.000Z',
      cancelledAt: null,
    });
  });

  it('cancels an invoice and stamps centerCode/updatedBy from the injected context', async () => {
    let capturedInput: unknown;
    const cancelInvoice: CancelInvoiceUseCase = {
      execute: async (input) => {
        capturedInput = input;
        return makeInvoice({ status: 'cancelled', cancelledAt: new Date('2026-07-16T11:00:00Z') });
      },
    };
    const handlers = createInvoiceHandlers(
      makeDeps({ issueInvoice: { execute: async () => makeInvoice() }, cancelInvoice }),
    );

    const result = await handlers['invoice.cancel']({ invoiceId: INVOICE_ID });

    expect(capturedInput).toEqual({
      centerCode: CENTER_CODE,
      invoiceId: INVOICE_ID,
      updatedBy: USER_ID,
    });
    expect(result).toEqual({
      id: INVOICE_ID,
      status: 'cancelled',
      issuedAt: null,
      cancelledAt: '2026-07-16T11:00:00.000Z',
    });
  });

  it('propagates InvalidInvoiceTransitionError for an already-issued invoice', async () => {
    const issueInvoice: IssueInvoiceUseCase = {
      execute: async () => {
        throw new InvalidInvoiceTransitionError(INVOICE_ID, 'issued', 'issued');
      },
    };
    const handlers = createInvoiceHandlers(
      makeDeps({ issueInvoice, cancelInvoice: { execute: async () => makeInvoice() } }),
    );

    await expect(handlers['invoice.issue']({ invoiceId: INVOICE_ID })).rejects.toBeInstanceOf(
      InvalidInvoiceTransitionError,
    );
  });

  it('propagates InvoiceNotFoundError for an unknown or foreign-center invoice', async () => {
    const cancelInvoice: CancelInvoiceUseCase = {
      execute: async () => {
        throw new InvoiceNotFoundError(INVOICE_ID);
      },
    };
    const handlers = createInvoiceHandlers(
      makeDeps({ issueInvoice: { execute: async () => makeInvoice() }, cancelInvoice }),
    );

    await expect(handlers['invoice.cancel']({ invoiceId: INVOICE_ID })).rejects.toBeInstanceOf(
      InvoiceNotFoundError,
    );
  });
});
