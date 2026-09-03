import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateInvoiceDraft,
  type CreateInvoiceDraftInput,
} from '../../../src/use-cases/create-invoice-draft';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { DuplicateInvoiceError } from '../../../src/errors/invoice-errors';
import { invoiceTotalMad } from '../../../src/policies/invoice-total';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { StudentId } from '../../../src/entities/student';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const FORMULA_ID = 'fml_00000000000000000000000002';
const CLOCK_ISO = '2026-07-31T10:00:00Z';

function validInput(overrides: Partial<CreateInvoiceDraftInput> = {}): CreateInvoiceDraftInput {
  return {
    studentId: STUDENT_ID,
    month: '2026-09',
    lines: [
      {
        formulaId: FORMULA_ID,
        label: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
        kind: 'regular',
        amountMad: 35000,
      },
    ],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateInvoiceDraft', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan): CreateInvoiceDraft {
    return new CreateInvoiceDraft(invoices, fakeClock(CLOCK_ISO), new PlanPolicy(plan));
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  describe('happy path', () => {
    it('creates a draft invoice with a prefixed id and a fresh envelope', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(validInput());

      expect(invoice.id).toMatch(/^inv_/);
      expect(invoice.studentId).toBe(STUDENT_ID);
      expect(invoice.month).toBe('2026-09');
      expect(invoice.status).toBe('draft');
      expect(invoice.issuedAt).toBeNull();
      expect(invoice.cancelledAt).toBeNull();
      expect(invoice.centerCode).toBe(CENTER);
      expect(invoice.deviceOrigin).toBe(DEVICE);
      expect(invoice.updatedBy).toBe(USER);
      expect(invoice.createdAt).toEqual(new Date(CLOCK_ISO));
      expect(invoice.updatedAt).toEqual(invoice.createdAt);
      expect(invoice.deletedAt).toBeNull();
      expect(invoice.version).toBe(0);
    });

    it('derives the id deterministically from (centerCode, studentId, month) — same triple, same id', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(validInput());
      expect(invoice.id).toBe(`inv_${CENTER}_${STUDENT_ID}_2026-09`);
    });

    it('creates one line per snapshot, each with a prefixed id, the invoice ref, and an envelope', async () => {
      const { invoice, lines } = await build(PLANS.essentiel).execute(
        validInput({
          lines: [
            { formulaId: FORMULA_ID, label: { fr: 'Math', ar: 'رياضيات' }, kind: 'regular', amountMad: 20000 },
            {
              formulaId: 'fml_00000000000000000000000003',
              label: { fr: 'Préparation Bac', ar: 'تحضير الباك' },
              kind: 'exam-prep',
              amountMad: 80000,
            },
          ],
        }),
      );

      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line.id).toMatch(/^invl_/);
        expect(line.invoiceId).toBe(invoice.id);
        expect(line.centerCode).toBe(CENTER);
        expect(line.createdAt).toEqual(new Date(CLOCK_ISO));
        expect(line.version).toBe(0);
      }
      expect(lines[0]?.kind).toBe('regular');
      expect(lines[1]?.kind).toBe('exam-prep');
      expect(lines[1]?.label).toEqual({ fr: 'Préparation Bac', ar: 'تحضير الباك' });
    });

    // SOU-271: a formula created FR-only carries `name.ar === ''`; snapshotting
    // that name onto the invoice line must produce a valid line (`label_ar === ''`)
    // — the invoice PDF is FR-only, so nothing renders the empty AR label.
    it('accepts a line whose AR label is empty (FR-only formula) and snapshots label_ar as ""', async () => {
      const { lines } = await build(PLANS.essentiel).execute(
        validInput({
          lines: [{ formulaId: FORMULA_ID, label: { fr: 'Math', ar: '' }, kind: 'regular', amountMad: 20000 }],
        }),
      );
      expect(lines).toHaveLength(1);
      expect(lines[0]?.label).toEqual({ fr: 'Math', ar: '' });
    });

    it('persists the header and lines so they can be read back, and the total derives from the lines', async () => {
      const { invoice } = await build(PLANS.essentiel).execute(
        validInput({
          lines: [
            { formulaId: FORMULA_ID, label: { fr: 'Math', ar: 'رياضيات' }, kind: 'regular', amountMad: 20000 },
            { formulaId: 'fml_00000000000000000000000003', label: { fr: 'SVT', ar: 'علوم' }, kind: 'regular', amountMad: 15000 },
          ],
        }),
      );

      expect(await invoices.findById(invoice.id)).toEqual(invoice);
      expect(await invoices.findByStudentMonth(CENTER, STUDENT_ID, '2026-09')).toEqual(invoice);
      const lines = await invoices.listLines(invoice.id);
      expect(lines).toHaveLength(2);
      expect(invoiceTotalMad(lines)).toBe(35000);
    });
  });

  describe('one invoice per student per month (idempotency guard)', () => {
    it('throws DuplicateInvoiceError on a second draft for the same student and month', async () => {
      await build(PLANS.essentiel).execute(validInput());
      await expect(build(PLANS.essentiel).execute(validInput())).rejects.toBeInstanceOf(
        DuplicateInvoiceError,
      );
    });

    it('carries the studentId and month on the error', async () => {
      await build(PLANS.essentiel).execute(validInput());
      await expect(build(PLANS.essentiel).execute(validInput())).rejects.toMatchObject({
        code: 'duplicate-invoice',
        studentId: STUDENT_ID,
        month: '2026-09',
      });
    });

    it('allows a different month for the same student', async () => {
      await build(PLANS.essentiel).execute(validInput({ month: '2026-09' }));
      const { invoice } = await build(PLANS.essentiel).execute(validInput({ month: '2026-10' }));
      expect(invoice.month).toBe('2026-10');
    });

    it('allows recreating after the prior invoice was discarded (tombstone does not count), resurrecting the same deterministic id', async () => {
      const first = await build(PLANS.essentiel).execute(validInput());
      await invoices.softDelete(first.invoice.id, new Date('2026-08-01T00:00:00Z'), USER);

      const second = await build(PLANS.essentiel).execute(validInput());
      // The id is a pure function of (centerCode, studentId, month) — recreating
      // for the same student-month always resurrects the same id, never mints a
      // second one for one billed month.
      expect(second.invoice.id).toBe(first.invoice.id);
      expect(second.invoice.deletedAt).toBeNull();
    });

    it('is center-scoped: a foreign center’s same-month row is not a duplicate, a same-center repeat still is', async () => {
      // Defensive: on desktop one DB is one center, but the guard filters by center in
      // the query, so it never mistakes a foreign-tenant row (future shared backend) for
      // a clash — and never *misses* a real same-center duplicate, regardless of the
      // order rows were inserted. Seeding OTHER_CENTER first proves order-independence.
      await build(PLANS.essentiel).execute(validInput({ centerCode: OTHER_CENTER }));
      const { invoice } = await build(PLANS.essentiel).execute(validInput({ centerCode: CENTER }));
      expect(invoice.centerCode).toBe(CENTER);

      // A second CENTER draft for the same student+month is still refused.
      await expect(
        build(PLANS.essentiel).execute(validInput({ centerCode: CENTER })),
      ).rejects.toBeInstanceOf(DuplicateInvoiceError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a malformed student id', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: 'not-an-id' })),
      ).rejects.toThrow();
    });

    it('rejects an invalid month', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ month: '2026-13' })),
      ).rejects.toThrow();
    });

    it('rejects an invoice with no lines', async () => {
      await expect(build(PLANS.essentiel).execute(validInput({ lines: [] }))).rejects.toThrow();
    });

    it('rejects a negative amount', async () => {
      await expect(
        build(PLANS.essentiel).execute(
          validInput({
            lines: [{ formulaId: FORMULA_ID, label: { fr: 'Math', ar: 'رياضيات' }, kind: 'regular', amountMad: -1 }],
          }),
        ),
      ).rejects.toThrow();
    });

    it('rejects a non-integer amount', async () => {
      await expect(
        build(PLANS.essentiel).execute(
          validInput({
            lines: [{ formulaId: FORMULA_ID, label: { fr: 'Math', ar: 'رياضيات' }, kind: 'regular', amountMad: 100.5 }],
          }),
        ),
      ).rejects.toThrow();
    });

    it('rejects a blank line label', async () => {
      await expect(
        build(PLANS.essentiel).execute(
          validInput({
            lines: [{ formulaId: FORMULA_ID, label: { fr: '', ar: 'رياضيات' }, kind: 'regular', amountMad: 20000 }],
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
