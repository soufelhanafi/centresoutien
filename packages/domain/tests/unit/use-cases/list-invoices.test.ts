import { describe, it, expect, beforeEach } from 'vitest';
import { ListInvoices } from '../../../src/use-cases/list-invoices';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { InvalidInvoiceListQueryError } from '../../../src/errors/invoice-errors';
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

      const { items, nextCursor } = await build().execute({ centerCode: CENTER });

      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.id).toBe(invoice.id);
      expect(items[0]?.lines).toHaveLength(2);
      expect(items[0]?.totalMad).toBe(35000);
      expect(items[0]?.netPaidMad).toBe(0);
      expect(items[0]?.outstandingMad).toBe(35000);
      expect(items[0]?.status).toBe('unpaid');
      // Unpaginated reads never carry a cursor.
      expect(nextCursor).toBeNull();
    });

    it('derives partially-paid and paid from the seeded net-paid figure', async () => {
      const partial = makeInvoice({ month: '2026-09' });
      await invoices.createDraft(partial, [makeLine(partial.id, 30000)]);
      invoices.setNetPaid(partial.id, 10000);

      const paid = makeInvoice({ month: '2026-09' });
      await invoices.createDraft(paid, [makeLine(paid.id, 30000)]);
      invoices.setNetPaid(paid.id, 30000);

      const { items } = await build().execute({ centerCode: CENTER });
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

      const { items } = await build().execute({ centerCode: CENTER });
      expect(items[0]?.status).toBe('paid');
      expect(items[0]?.outstandingMad).toBe(0);
    });

    it('includes cancelled invoices, lifecycle-badged rather than hidden', async () => {
      const cancelled = makeInvoice({ status: 'cancelled', cancelledAt: new Date('2026-08-05T00:00:00Z') });
      await invoices.createDraft(cancelled, [makeLine(cancelled.id, 20000)]);

      const { items } = await build().execute({ centerCode: CENTER });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.status).toBe('cancelled');
    });

    it('returns an empty list when the center has no invoices', async () => {
      const { items, nextCursor } = await build().execute({ centerCode: CENTER });
      expect(items).toEqual([]);
      expect(nextCursor).toBeNull();
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
      const { items } = await build().execute({ centerCode: CENTER, month: '2026-09' });
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.invoice.month === '2026-09')).toBe(true);
    });

    it('filters by studentId', async () => {
      const { items } = await build().execute({ centerCode: CENTER, studentId: STUDENT_A });
      expect(items).toHaveLength(2);
      expect(items.every((item) => item.invoice.studentId === STUDENT_A)).toBe(true);
    });

    it('filters by invoiceId — the single-invoice detail fetch', async () => {
      const { rows } = await invoices.listInvoices(CENTER, { studentId: STUDENT_B });
      const target = rows[0];
      const { items } = await build().execute({ centerCode: CENTER, invoiceId: target?.invoice.id });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_B);
    });

    it('filters by the derived payment status, not the lifecycle status', async () => {
      const unpaid = await build().execute({ centerCode: CENTER, paymentStatus: 'unpaid' });
      expect(unpaid.items).toHaveLength(1);
      expect(unpaid.items[0]?.invoice.studentId).toBe(STUDENT_B);

      const partial = await build().execute({ centerCode: CENTER, paymentStatus: 'partially-paid' });
      expect(partial.items).toHaveLength(1);
      expect(partial.items[0]?.invoice.month).toBe('2026-10');

      const paid = await build().execute({ centerCode: CENTER, paymentStatus: 'paid' });
      expect(paid.items).toHaveLength(1);
      expect(paid.items[0]?.invoice.month).toBe('2026-09');
    });

    it('combines month + paymentStatus filters', async () => {
      const { items } = await build().execute({
        centerCode: CENTER,
        month: '2026-09',
        paymentStatus: 'unpaid',
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_B);
    });

    it('never returns another center’s invoices', async () => {
      const { items } = await build().execute({ centerCode: OTHER_CENTER });
      expect(items).toEqual([]);
    });
  });

  describe('openOnly', () => {
    it('returns only invoices that still owe money and are not cancelled', async () => {
      const paid = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(paid, [makeLine(paid.id, 20000)]);
      invoices.setNetPaid(paid.id, 20000); // fully paid → excluded

      const owing = makeInvoice({ studentId: STUDENT_B });
      await invoices.createDraft(owing, [makeLine(owing.id, 30000)]);
      invoices.setNetPaid(owing.id, 10000); // partially paid → included

      const cancelledOwing = makeInvoice({
        status: 'cancelled',
        cancelledAt: new Date('2026-08-05T00:00:00Z'),
      });
      await invoices.createDraft(cancelledOwing, [makeLine(cancelledOwing.id, 40000)]); // owes but cancelled → excluded

      const { items } = await build().execute({ centerCode: CENTER, openOnly: true });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.id).toBe(owing.id);
      expect(items[0]?.outstandingMad).toBe(20000);
    });
  });

  describe('search (student name)', () => {
    it('matches on the fr/ar student name substring, case-insensitively', async () => {
      const yassine = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(yassine, [makeLine(yassine.id, 20000)]);
      invoices.setStudentName(STUDENT_A, { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });

      const salma = makeInvoice({ studentId: STUDENT_B });
      await invoices.createDraft(salma, [makeLine(salma.id, 30000)]);
      invoices.setStudentName(STUDENT_B, { fr: 'Salma Bennani', ar: 'سلمى بناني' });

      const { items } = await build().execute({ centerCode: CENTER, search: 'yass' });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_A);

      const arabic = await build().execute({ centerCode: CENTER, search: 'سلمى' });
      expect(arabic.items).toHaveLength(1);
      expect(arabic.items[0]?.invoice.studentId).toBe(STUDENT_B);
    });

    it('matches diacritic-insensitively (é folds to e)', async () => {
      const eric = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(eric, [makeLine(eric.id, 20000)]);
      invoices.setStudentName(STUDENT_A, { fr: 'Éric Benörî', ar: 'إريك' });

      const { items } = await build().execute({ centerCode: CENTER, search: 'eric benori' });
      expect(items).toHaveLength(1);
      expect(items[0]?.invoice.studentId).toBe(STUDENT_A);
    });
  });

  describe('query validation', () => {
    it('rejects combining paymentStatus with pageSize (short-page landmine)', async () => {
      await expect(
        build().execute({ centerCode: CENTER, paymentStatus: 'unpaid', pageSize: 20 }),
      ).rejects.toBeInstanceOf(InvalidInvoiceListQueryError);
    });

    it('allows paymentStatus alone and pageSize alone', async () => {
      const invoice = makeInvoice();
      await invoices.createDraft(invoice, [makeLine(invoice.id, 20000)]);

      await expect(
        build().execute({ centerCode: CENTER, paymentStatus: 'unpaid' }),
      ).resolves.toMatchObject({ items: expect.any(Array) });
      await expect(
        build().execute({ centerCode: CENTER, pageSize: 20 }),
      ).resolves.toMatchObject({ items: expect.any(Array) });
    });
  });

  describe('studentName', () => {
    it('carries the resolved bilingual student name on each row', async () => {
      const invoice = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(invoice, [makeLine(invoice.id, 20000)]);
      invoices.setStudentName(STUDENT_A, { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });

      const { items } = await build().execute({ centerCode: CENTER });
      expect(items[0]?.studentName).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
    });

    it('falls back to empty strings when the student has not synced yet', async () => {
      const invoice = makeInvoice({ studentId: STUDENT_B });
      await invoices.createDraft(invoice, [makeLine(invoice.id, 20000)]);

      const { items } = await build().execute({ centerCode: CENTER });
      expect(items[0]?.studentName).toEqual({ fr: '', ar: '' });
    });
  });

  describe('cursor pagination', () => {
    it('returns a bounded page plus a nextCursor, then the second page, then null', async () => {
      // Three open invoices; id ascends with invoiceSeq, so DESC order is 3rd, 2nd, 1st.
      const first = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(first, [makeLine(first.id, 10000)]);
      const second = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(second, [makeLine(second.id, 10000)]);
      const third = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(third, [makeLine(third.id, 10000)]);

      const page1 = await build().execute({ centerCode: CENTER, openOnly: true, pageSize: 2 });
      expect(page1.items.map((i) => i.invoice.id)).toEqual([third.id, second.id]);
      expect(page1.nextCursor).toBe(second.id);

      const page2 = await build().execute({
        centerCode: CENTER,
        openOnly: true,
        pageSize: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.items.map((i) => i.invoice.id)).toEqual([first.id]);
      expect(page2.nextCursor).toBeNull();
    });

    it('a page that exactly drains the result set carries no nextCursor', async () => {
      const only = makeInvoice({ studentId: STUDENT_A });
      await invoices.createDraft(only, [makeLine(only.id, 10000)]);

      const { items, nextCursor } = await build().execute({ centerCode: CENTER, pageSize: 5 });
      expect(items).toHaveLength(1);
      expect(nextCursor).toBeNull();
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
