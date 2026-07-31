import { describe, it, expect, beforeEach } from 'vitest';
import { IssueInvoice } from '../../../src/use-cases/issue-invoice';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  InvalidInvoiceTransitionError,
  InvoiceNotFoundError,
} from '../../../src/errors/invoice-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { StudentId } from '../../../src/entities/student';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const INVOICE_ID = 'inv_00000000000000000000000001' as InvoiceId;

const CREATED_ISO = '2026-07-31T10:00:00Z';
const ISSUE_ISO = '2026-08-01T09:30:00Z';

const seedClock = fakeClock(CREATED_ISO);

function makeInvoice(status: InvoiceStatus, overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    studentId: STUDENT_ID,
    month: '2026-09',
    status,
    issuedAt: status === 'draft' ? null : new Date(CREATED_ISO),
    cancelledAt: status === 'cancelled' ? new Date(CREATED_ISO) : null,
    ...overrides,
  };
}

describe('IssueInvoice', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan): IssueInvoice {
    return new IssueInvoice(invoices, fakeClock(ISSUE_ISO), new PlanPolicy(plan));
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  describe('happy path (draft -> issued)', () => {
    beforeEach(async () => {
      await invoices.save(makeInvoice('draft'));
    });

    it('moves the invoice to issued and stamps issuedAt from the clock', async () => {
      const issued = await build(PLANS.essentiel).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        updatedBy: EDITOR,
      });

      expect(issued.status).toBe('issued');
      expect(issued.issuedAt).toEqual(new Date(ISSUE_ISO));
      expect(issued.cancelledAt).toBeNull();
    });

    it('advances updatedAt/updatedBy but never createdAt or version', async () => {
      const issued = await build(PLANS.essentiel).execute({
        centerCode: CENTER,
        invoiceId: INVOICE_ID,
        updatedBy: EDITOR,
      });

      expect(issued.updatedAt).toEqual(new Date(ISSUE_ISO));
      expect(issued.updatedBy).toBe(EDITOR);
      expect(issued.createdAt).toEqual(new Date(CREATED_ISO));
      expect(issued.version).toBe(0); // version is the hub's to assign, never a local edit
      expect(await invoices.findById(INVOICE_ID)).toEqual(issued);
    });
  });

  describe('illegal transitions', () => {
    it('throws InvalidInvoiceTransitionError when issuing an already-issued invoice', async () => {
      await invoices.save(makeInvoice('issued'));
      await expect(
        build(PLANS.essentiel).execute({ centerCode: CENTER, invoiceId: INVOICE_ID, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(InvalidInvoiceTransitionError);
    });

    it('throws InvalidInvoiceTransitionError when issuing a cancelled invoice', async () => {
      await invoices.save(makeInvoice('cancelled'));
      await expect(
        build(PLANS.essentiel).execute({ centerCode: CENTER, invoiceId: INVOICE_ID, updatedBy: EDITOR }),
      ).rejects.toMatchObject({ code: 'invalid-invoice-transition', from: 'cancelled', to: 'issued' });
    });
  });

  describe('resolution / tenant scoping', () => {
    it('throws InvoiceNotFoundError for an unknown id', async () => {
      await expect(
        build(PLANS.essentiel).execute({
          centerCode: CENTER,
          invoiceId: 'inv_00000000000000000000000099' as InvoiceId,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceNotFoundError for an invoice in another center (no cross-tenant issue)', async () => {
      await invoices.save(makeInvoice('draft', { centerCode: OTHER_CENTER }));
      await expect(
        build(PLANS.essentiel).execute({ centerCode: CENTER, invoiceId: INVOICE_ID, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceNotFoundError for a discarded (tombstoned) invoice', async () => {
      await invoices.save(makeInvoice('draft'));
      await invoices.softDelete(INVOICE_ID, new Date('2026-07-31T12:00:00Z'), USER);
      await expect(
        build(PLANS.essentiel).execute({ centerCode: CENTER, invoiceId: INVOICE_ID, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      await invoices.save(makeInvoice('draft'));
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(
        build(planWithout).execute({ centerCode: CENTER, invoiceId: INVOICE_ID, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect((await invoices.findById(INVOICE_ID))?.status).toBe('draft');
    });
  });
});
