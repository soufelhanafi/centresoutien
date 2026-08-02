import { describe, it, expect, beforeEach } from 'vitest';
import { ListInvoices } from '../../../src/use-cases/list-invoices';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Invoice, InvoiceId, InvoiceStatus } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { FormulaId } from '../../../src/entities/formula';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;

const seedClock = fakeClock('2026-08-01T10:00:00Z');

let invoiceSeq = 0;
function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  invoiceSeq += 1;
  return {
    id: `inv_${String(invoiceSeq).padStart(26, '0')}` as InvoiceId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    studentId: STUDENT_A,
    month: '2026-09',
    status: 'issued' as InvoiceStatus,
    issuedAt: new Date('2026-08-01T10:00:00Z'),
    cancelledAt: null,
    ...over,
  };
}

let lineSeq = 0;
function makeLine(invoiceId: InvoiceId, amountMad: number): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, seedClock),
    invoiceId,
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular',
    amountMad,
  };
}

describe('ListInvoices', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan = PLANS.essentiel): ListInvoices {
    return new ListInvoices(invoices, new PlanPolicy(plan));
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  describe('happy path', () => {
    it('returns every live invoice with lines, total, and derived unpaid status', async () => {
      const invoice = makeInvoice();
      await invoices.createDraft(invoice, [
        makeLine(invoice.id, 20000),
        makeLine(invoice.id, 15000),
      ]);

      const items = await build().execute({ centerCode: CENTER });

      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.id).toBe(invoice.id);
      expect(items[0]?.lines).toHaveLength(2);
      expect(items[0]?.totalMad).toBe(35000);
      expect(items[0]?.netPaidMad).toBe(0);
      expect(items[0]?.outstandingMad).toBe(35000);
      expect(items[0]?.status).toBe('unpaid');
    });

    it('derives partially-paid and paid from the seeded net-paid figure', async () => {
      const partial = makeInvoice({ month: '2026-09' });
      await invoices.createDraft(partial, [makeLine(partial.id, 30000)]);
      invoices.setNetPaid(partial.id, 10000);

      const paid = makeInvoice({ month: '2026-09' });
      await invoices.createDraft(paid, [makeLine(paid.id, 30000)]);
      invoices.setNetPaid(paid.id, 30000);

      const items = await build().execute({ centerCode: CENTER });
      const byId = new Map(items.map((item) => [item.invoice.id, item]));

      expect(byId.get(partial.id)?.status).toBe('partially-paid');
      expect(byId.get(partial.id)?.outstandingMad).toBe(20000);
      expect(byId.get(paid.id)?.status).toBe('paid');
      expect(byId.get(paid.id)?.outstandingMad).toBe(0);
    });

    it('clamps outstanding to 0 on overpayment, still reading paid', async () => {
      const invoice = makeInvoice();
      await invoices.createDraft(invoice, [makeLine(invoice.id, 10000)]);
      invoices.setNetPaid(invoice.id, 15000);

      const items = await build().execute({ centerCode: CENTER });
      expect(items[0]?.status).toBe('paid');
      expect(items[0]?.outstandingMad).toBe(0);
    });

    it('includes cancelled invoices, lifecycle-badged rather than hidden', async () => {
      const cancelled = makeInvoice({ status: 'cancelled', cancelledAt: new Date('2026-08-05T00:00:00Z') });
      await invoices.createDraft(cancelled, [makeLine(cancelled.id, 20000)]);

      const items = await build().execute({ centerCode: CENTER });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.status).toBe('cancelled');
    });

    it('returns an empty list when the center has no invoices', async () => {
      expect(await build().execute({ centerCode: CENTER })).toEqual([]);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      const septA = makeInvoice({ studentId: STUDENT_A, month: '2026-09' });
      await invoices.createDraft(septA, [makeLine(septA.id, 20000)]);
      invoices.setNetPaid(septA.id, 20000); // paid

      const septB = makeInvoice({ studentId: STUDENT_B, month: '2026-09' });
      await invoices.createDraft(septB, [makeLine(septB.id, 30000)]); // unpaid

      const octA = makeInvoice({ studentId: STUDENT_A, month: '2026-10' });
      await invoices.createDraft(octA, [makeLine(octA.id, 40000)]);
      invoices.setNetPaid(octA.id, 10000); // partially-paid
    });

    it('filters by month', async () => {
      const items = await build().execute({ centerCode: CENTER, month: '2026-09' });
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.invoice.month === '2026-09')).toBe(true);
    });

    it('filters by studentId', async () => {
      const items = await build().execute({ centerCode: CENTER, studentId: STUDENT_A });
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.invoice.studentId === STUDENT_A)).toBe(true);
    });

    it('filters by invoiceId — the single-invoice detail fetch', async () => {
      const [target] = await invoices.listInvoices(CENTER, { studentId: STUDENT_B });
      const items = await build().execute({ centerCode: CENTER, invoiceId: target?.invoice.id });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_B);
    });

    it('filters by the derived payment status, not the lifecycle status', async () => {
      const unpaid = await build().execute({ centerCode: CENTER, paymentStatus: 'unpaid' });
      expect(unpaid).toHaveLength(1);
      expect(unpaid[0]?.invoice.studentId).toBe(STUDENT_B);

      const partial = await build().execute({ centerCode: CENTER, paymentStatus: 'partially-paid' });
      expect(partial).toHaveLength(1);
      expect(partial[0]?.invoice.month).toBe('2026-10');

      const paid = await build().execute({ centerCode: CENTER, paymentStatus: 'paid' });
      expect(paid).toHaveLength(1);
      expect(paid[0]?.invoice.month).toBe('2026-09');
    });

    it('combines month + paymentStatus filters', async () => {
      const items = await build().execute({
        centerCode: CENTER,
        month: '2026-09',
        paymentStatus: 'unpaid',
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_B);
    });

    it('never returns another center’s invoices', async () => {
      expect(await build().execute({ centerCode: OTHER_CENTER })).toEqual([]);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError without core.invoicing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
